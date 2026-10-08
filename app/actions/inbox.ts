"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, notFoundFailure, validationFailure, type ActionResult } from "@/lib/action-errors";
import { requireProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { generateInsight } from "@/lib/inbox/ai";
import { getChannelAdapter } from "@/lib/inbox/channels";
import { graphRequest, graphUrl } from "@/lib/inbox/channels/meta";
import type { SendResult } from "@/lib/inbox/channels/types";
import { getConversation, getConversationCrm, getConversationMessages } from "@/lib/inbox/data";
import { safeFileName } from "@/lib/inbox/ingest";
import type { AiInsightKind, ChannelKind, ConversationStatus } from "@/lib/inbox/types";
import { aiInsightKindSchema, channelAccountSettingsSchema, conversationNoteSchema, conversationStatusSchema, convertConversationSchema, outboundAttachmentMaxBytes, outboundAttachmentTypes, outboundTextSchema } from "@/lib/inbox/validation";
import { replyWindow } from "@/lib/inbox/window";
import { canManageAssignments, canManageTeam } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previewOnly: ActionResult = { ok: false, kind: "validation_error", message: "The Inbox is not available in preview mode." };

type SendTarget = { id: string; channel: ChannelKind; channel_account_id: string; external_thread_id: string; last_inbound_at: string | null; contact_id: string | null; lead_id: string | null; accountExternalId: string };

/** Loads the conversation under the employee's RLS scope and checks the channel can be replied on right now. */
async function resolveSendTarget(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, conversationId: string): Promise<{ target: SendTarget } | { failure: ActionResult }> {
  const { data } = await supabase.from("conversations").select("id, channel, channel_account_id, external_thread_id, last_inbound_at, contact_id, lead_id, channel_accounts(external_account_id, is_active), communication_channels(is_enabled)").eq("id", conversationId).maybeSingle();
  if (!data) return { failure: { ok: false, kind: "not_found", message: "This conversation no longer exists or is outside your access." } };
  const account = data.channel_accounts as unknown as { external_account_id: string; is_active: boolean } | null;
  const channel = data.communication_channels as unknown as { is_enabled: boolean } | null;
  if (!account?.is_active || !channel?.is_enabled) return { failure: validationFailure("This channel is currently disabled.") };
  const adapter = getChannelAdapter(data.channel as ChannelKind);
  if (!adapter) return { failure: validationFailure("Replies are not supported on this channel.") };
  const missing = adapter.missingEnv();
  if (missing.length) return { failure: validationFailure(`This channel is not connected yet. Missing server settings: ${missing.join(", ")}.`) };
  const window = replyWindow(data.channel as ChannelKind, data.last_inbound_at, Date.now());
  if (!window.open) return { failure: validationFailure(window.reason ?? "The reply window is closed.") };
  return { target: { id: data.id, channel: data.channel as ChannelKind, channel_account_id: data.channel_account_id, external_thread_id: data.external_thread_id, last_inbound_at: data.last_inbound_at, contact_id: data.contact_id, lead_id: data.lead_id, accountExternalId: account.external_account_id } };
}

async function recordSendResult(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, messageId: string, result: SendResult) {
  const now = new Date().toISOString();
  const values = result.ok
    ? { status: "sent", external_message_id: result.externalMessageId, sent_at: now }
    : { status: "failed", failed_at: now, error_code: result.code ?? null, error_message: result.message.slice(0, 500) };
  return supabase.from("messages").update(values).eq("id", messageId);
}

export async function sendMessageAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  const parsed = outboundTextSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the message.");
  try {
    const supabase = await createSupabaseServerClient();
    const resolved = await resolveSendTarget(supabase, parsed.data.conversationId);
    if ("failure" in resolved) return resolved.failure;
    const { target } = resolved;

    // The message is stored as queued first so nothing an employee sends can go unrecorded.
    const { data: message, error } = await supabase.from("messages").insert({
      conversation_id: target.id, channel: target.channel, channel_account_id: target.channel_account_id, direction: "outbound", message_type: "text",
      body: parsed.data.text, sender_external_id: target.accountExternalId, recipient_external_id: target.external_thread_id, sender_profile_id: profile.id,
      status: "queued", contact_id: target.contact_id, lead_id: target.lead_id, metadata: { sender_name: profile.full_name },
    }).select("id").single();
    if (error) return actionFailure("inbox.message.create", profile.id, error, { permission_denied: "You don’t have permission to reply in this conversation." });

    const result = await getChannelAdapter(target.channel)!.sendText({ accountExternalId: target.accountExternalId, to: target.external_thread_id, text: parsed.data.text });
    const recorded = await recordSendResult(supabase, message.id, result);
    if (recorded.error) console.error("Inbox send result could not be recorded", { messageId: message.id, code: recorded.error.code });
    revalidatePath("/inbox");
    if (!result.ok) return { ok: false, kind: "network_error", message: `Message not delivered: ${result.message}` };
    return { ok: true, message: "Message sent.", id: message.id };
  } catch (error) { return actionFailure("inbox.message.send", profile.id, error); }
}

export async function sendAttachmentAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  const conversationId = String(formData.get("conversationId") ?? "");
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 1024);
  const file = formData.get("file");
  if (!uuidPattern.test(conversationId) || !(file instanceof File)) return validationFailure("Choose a file to send.");
  if (!file.size || file.size > outboundAttachmentMaxBytes) return validationFailure("Files must be 16 MB or smaller.");
  if (!outboundAttachmentTypes.has(file.type)) return validationFailure("This file type cannot be sent on this channel.");
  try {
    const supabase = await createSupabaseServerClient();
    const resolved = await resolveSendTarget(supabase, conversationId);
    if ("failure" in resolved) return resolved.failure;
    const { target } = resolved;
    const adapter = getChannelAdapter(target.channel)!;
    if (!adapter.sendMedia) return validationFailure("Sending files is not supported on this channel yet.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const messageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
    const { data: message, error } = await supabase.from("messages").insert({
      conversation_id: target.id, channel: target.channel, channel_account_id: target.channel_account_id, direction: "outbound", message_type: messageType,
      body: caption || null, sender_external_id: target.accountExternalId, recipient_external_id: target.external_thread_id, sender_profile_id: profile.id,
      status: "queued", contact_id: target.contact_id, lead_id: target.lead_id, metadata: { sender_name: profile.full_name },
    }).select("id").single();
    if (error) return actionFailure("inbox.attachment.create", profile.id, error, { permission_denied: "You don’t have permission to reply in this conversation." });

    const storagePath = `${target.id}/${message.id}-${safeFileName(file.name)}`;
    const uploaded = await supabase.storage.from("inbox-media").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    await supabase.from("message_attachments").insert({ message_id: message.id, conversation_id: target.id, storage_path: uploaded.error ? null : storagePath, mime_type: file.type, file_name: file.name.slice(0, 240), size_bytes: file.size, media_status: uploaded.error ? "failed" : "stored" });

    const result = await adapter.sendMedia({ accountExternalId: target.accountExternalId, to: target.external_thread_id, bytes, mimeType: file.type, fileName: file.name, caption: caption || undefined });
    await recordSendResult(supabase, message.id, result);
    revalidatePath("/inbox");
    if (!result.ok) return { ok: false, kind: "network_error", message: `File not delivered: ${result.message}` };
    return { ok: true, message: "File sent.", id: message.id };
  } catch (error) { return actionFailure("inbox.attachment.send", profile.id, error); }
}

export async function assignConversationAction(conversationId: string, assigneeId: string | null): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  if (!canManageAssignments(profile.role)) return { ok: false, kind: "permission_denied", message: "Only administrators and sales managers can assign conversations." };
  if (!uuidPattern.test(conversationId) || (assigneeId !== null && !uuidPattern.test(assigneeId))) return validationFailure("Choose a valid employee.");
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("conversations").update({ assigned_to: assigneeId }).eq("id", conversationId).select("id").maybeSingle();
    if (error) return actionFailure("inbox.conversation.assign", profile.id, error, { permission_denied: "That employee is outside your permitted team scope." });
    if (!data) return notFoundFailure("inbox.conversation.assign", profile.id);
    revalidatePath("/inbox");
    return { ok: true, message: assigneeId ? "Conversation assigned." : "Conversation returned to the unassigned queue." };
  } catch (error) { return actionFailure("inbox.conversation.assign", profile.id, error); }
}

export async function setConversationStatusAction(conversationId: string, status: ConversationStatus): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  const parsed = conversationStatusSchema.safeParse(status);
  if (!parsed.success || !uuidPattern.test(conversationId)) return validationFailure("Choose a valid conversation status.");
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("conversations").update({ status: parsed.data }).eq("id", conversationId).select("id").maybeSingle();
    if (error) return actionFailure("inbox.conversation.status", profile.id, error);
    if (!data) return notFoundFailure("inbox.conversation.status", profile.id);
    revalidatePath("/inbox");
    return { ok: true, message: parsed.data === "closed" ? "Conversation closed." : parsed.data === "pending" ? "Conversation marked as pending." : "Conversation reopened." };
  } catch (error) { return actionFailure("inbox.conversation.status", profile.id, error); }
}

export async function markConversationReadAction(conversationId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode() || !uuidPattern.test(conversationId)) return { ok: true, message: "" };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("conversation_reads").upsert({ conversation_id: conversationId, user_id: profile.id, last_read_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
    if (error) return actionFailure("inbox.conversation.read", profile.id, error);
    return { ok: true, message: "" };
  } catch (error) { return actionFailure("inbox.conversation.read", profile.id, error); }
}

export async function addConversationNoteAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  const parsed = conversationNoteSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the note.");
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("conversation_notes").insert({ conversation_id: parsed.data.conversationId, author_id: profile.id, body: parsed.data.body });
    if (error) return actionFailure("inbox.note.create", profile.id, error, { permission_denied: "You don’t have permission to add a note to this conversation." });
    // Mirror the note onto the CRM timeline when the conversation is linked to a record.
    const { data: conversation } = await supabase.from("conversations").select("contact_id, lead_id").eq("id", parsed.data.conversationId).maybeSingle();
    if (conversation?.contact_id || conversation?.lead_id) {
      await supabase.from("activities").insert({ activity_type: "note", subject: "Inbox note added", description: parsed.data.body, user_id: profile.id, contact_id: conversation.contact_id, lead_id: conversation.lead_id, metadata: { conversation_id: parsed.data.conversationId } });
    }
    revalidatePath("/inbox");
    return { ok: true, message: "Internal note added." };
  } catch (error) { return actionFailure("inbox.note.create", profile.id, error); }
}

export async function linkConversationAction(conversationId: string, contactId: string, leadId: string | null): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  if (!uuidPattern.test(conversationId) || !uuidPattern.test(contactId) || (leadId !== null && !uuidPattern.test(leadId))) return validationFailure("Choose a contact to link.");
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("link_conversation", { target_conversation: conversationId, target_contact: contactId, target_lead: leadId });
    if (error) return actionFailure("inbox.conversation.link", profile.id, error, { permission_denied: "That contact or lead is outside your access." });
    revalidatePath("/inbox");
    return { ok: true, message: leadId ? "Conversation linked to the lead." : "Conversation linked to the contact." };
  } catch (error) { return actionFailure("inbox.conversation.link", profile.id, error); }
}

/**
 * Converts the sender into a lead through the existing lead RPC, which reuses a
 * contact with the same normalized phone number instead of creating a duplicate.
 */
export async function convertConversationToLeadAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return previewOnly;
  const parsed = convertConversationSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the lead details.");
  try {
    const conversation = await getConversation(parsed.data.conversationId);
    if (!conversation) return notFoundFailure("inbox.conversation.convert", profile.id);
    const supabase = await createSupabaseServerClient();
    const firstInbound = await supabase.from("messages").select("body").eq("conversation_id", conversation.id).eq("direction", "inbound").not("body", "is", null).order("created_at").limit(1).maybeSingle();
    const assignedTo = canManageAssignments(profile.role) ? parsed.data.assigned_to : profile.id;
    const slug = `${parsed.data.full_name}-${parsed.data.customer_need}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "lead";
    const payload = {
      contact_id: conversation.contact_id ?? "", full_name: parsed.data.full_name, phone: parsed.data.phone,
      whatsapp_number: conversation.channel === "whatsapp" ? parsed.data.phone : "", contact_email: "",
      organization_name: parsed.data.organization_name ?? "", location_text: parsed.data.location_text ?? "",
      source: conversation.channel === "whatsapp" ? "whatsapp" : "social_media",
      receiving_whatsapp_number: conversation.channel === "whatsapp" ? conversation.account_identifier ?? "" : "",
      campaign_source: "", customer_need: parsed.data.customer_need, status: "new", priority: parsed.data.priority, assigned_to: assignedTo,
      received_at: conversation.created_at, last_contacted_at: conversation.last_message_at ?? "", next_follow_up_at: "", notes: "",
      original_message: (firstInbound.data?.body as string | undefined)?.slice(0, 4000) ?? "", slug,
    };
    const { data, error } = await supabase.rpc("create_lead_with_contact", { payload, actor_id: profile.id });
    if (error) return actionFailure("inbox.conversation.convert", profile.id, error, { permission_denied: "You don’t have permission to create this lead.", validation_error: "Check the name, phone and need." });
    const created = data as { lead_id?: string; lead_slug?: string; contact_id?: string } | null;
    if (!created?.lead_id || !created.contact_id) return actionFailure("inbox.conversation.convert", profile.id, { message: "Lead RPC returned an incomplete result." });
    const linked = await supabase.rpc("link_conversation", { target_conversation: conversation.id, target_contact: created.contact_id, target_lead: created.lead_id });
    revalidatePath("/inbox"); revalidatePath("/leads"); revalidatePath("/contacts"); revalidatePath("/pipeline"); revalidatePath("/dashboard");
    if (linked.error) {
      actionFailure("inbox.conversation.convert.link", profile.id, linked.error);
      return { ok: false, kind: "unexpected_server_error", message: "The lead was created, but the conversation could not be linked to it. Link it from the contact panel." };
    }
    return { ok: true, message: "Lead created and linked to this conversation.", id: created.lead_id, slug: created.lead_slug };
  } catch (error) { return actionFailure("inbox.conversation.convert", profile.id, error); }
}

export async function updateChannelAccountAction(accountId: string, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManageTeam(profile.role)) return { ok: false, kind: "permission_denied", message: "Only administrators can change channel settings." };
  const parsed = channelAccountSettingsSchema.safeParse(input);
  if (!parsed.success || !uuidPattern.test(accountId)) return validationFailure(parsed.success ? "Invalid channel account." : parsed.error.issues[0]?.message ?? "Check the channel settings.");
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("channel_accounts").update({ auto_create_leads: parsed.data.auto_create_leads, default_assignee_id: parsed.data.default_assignee_id || null, is_active: parsed.data.is_active }).eq("id", accountId).select("id").maybeSingle();
    if (error) return actionFailure("inbox.channel-account.update", profile.id, error);
    if (!data) return notFoundFailure("inbox.channel-account.update", profile.id);
    revalidatePath("/settings");
    return { ok: true, message: "Channel settings saved." };
  } catch (error) { return actionFailure("inbox.channel-account.update", profile.id, error); }
}

/** Reads the numbers on the configured WhatsApp Business Account and registers any that are missing. */
export async function syncWhatsAppNumbersAction(): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManageTeam(profile.role)) return { ok: false, kind: "permission_denied", message: "Only administrators can connect channel numbers." };
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !businessAccountId) return validationFailure("Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID on the server first.");
  try {
    const result = await graphRequest<{ data?: { id: string; display_phone_number?: string; verified_name?: string }[] }>(`${graphUrl(`${businessAccountId}/phone_numbers`)}?fields=id,display_phone_number,verified_name`, token);
    if (!result.ok) return { ok: false, kind: "network_error", message: `Meta rejected the request: ${result.message}` };
    const numbers = result.data.data ?? [];
    const supabase = await createSupabaseServerClient();
    const existing = await supabase.from("channel_accounts").select("external_account_id").eq("channel", "whatsapp");
    if (existing.error) return actionFailure("inbox.whatsapp.sync", profile.id, existing.error);
    const known = new Set((existing.data ?? []).map((row) => row.external_account_id));
    const missing = numbers.filter((number) => !known.has(number.id)).map((number) => ({ channel: "whatsapp", external_account_id: number.id, display_name: number.verified_name || `WhatsApp ${number.display_phone_number ?? number.id}`, display_identifier: number.display_phone_number ? `+${number.display_phone_number.replace(/\D/g, "")}` : null, created_by: profile.id }));
    if (missing.length) {
      const { error } = await supabase.from("channel_accounts").insert(missing);
      if (error) return actionFailure("inbox.whatsapp.sync", profile.id, error);
    }
    revalidatePath("/settings");
    return { ok: true, message: numbers.length ? `${numbers.length} WhatsApp number${numbers.length === 1 ? "" : "s"} found, ${missing.length} added.` : "Meta returned no phone numbers for this business account." };
  } catch (error) { return actionFailure("inbox.whatsapp.sync", profile.id, error); }
}

export type AiInsightResult = { ok: true; kind: AiInsightKind; content: Record<string, unknown> } | { ok: false; message: string };

/** Produces an advisory insight or draft. Nothing here sends a message to the customer. */
export async function generateAiInsightAction(conversationId: string, kind: AiInsightKind): Promise<AiInsightResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return { ok: false, message: "AI assistance is not available in preview mode." };
  const parsedKind = aiInsightKindSchema.safeParse(kind);
  if (!parsedKind.success || !uuidPattern.test(conversationId)) return { ok: false, message: "Unknown AI request." };
  const conversation = await getConversation(conversationId);
  if (!conversation) return { ok: false, message: "This conversation no longer exists or is outside your access." };
  const [messages, crm] = await Promise.all([getConversationMessages(conversationId), getConversationCrm(conversation)]);
  const result = await generateInsight(parsedKind.data, {
    channel: conversation.channel, messages,
    crmContext: {
      contact: crm.contact ? { name: crm.contact.full_name, organization: crm.contact.organization_name, location: crm.contact.location_text } : null,
      lead: crm.lead ? { need: crm.lead.customer_need, stage: crm.lead.status, priority: crm.lead.priority, location: crm.lead.location_text, next_follow_up_at: crm.lead.next_follow_up_at, notes: crm.lead.notes } : null,
      open_tasks: crm.tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").map((task) => ({ title: task.title, due_at: task.due_at })),
      site_visits: crm.visits.map((visit) => ({ status: visit.status, scheduled_at: visit.scheduled_at })),
      quotations: crm.quotations.map((quote) => ({ number: quote.quote_number, status: quote.status, total: quote.total, currency: quote.currency })),
    },
  });
  if (!result.ok) return result;
  const supabase = await createSupabaseServerClient();
  const stored = await supabase.from("conversation_ai_insights").insert({ conversation_id: conversationId, kind: parsedKind.data, content: result.content, model: result.model, created_by: profile.id });
  if (stored.error) console.error("AI insight could not be stored", { code: stored.error.code });
  return { ok: true, kind: parsedKind.data, content: result.content };
}

export type ContactMatch = { id: string; full_name: string; phone: string | null; organization_name: string | null };

/** Contact lookup for linking a conversation. Results are limited to contacts the employee can already see. */
export async function searchContactsForLinkAction(query: string): Promise<ContactMatch[]> {
  await requireProfile();
  const term = query.trim().replace(/[%_,()]/g, " ").trim();
  if (isDemoMode() || term.length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const digits = term.replace(/\D/g, "");
  const filters = [`full_name.ilike.%${term}%`, `organization_name.ilike.%${term}%`];
  if (digits.length >= 4) filters.push(`phone_normalized.ilike.%${digits}%`, `whatsapp_normalized.ilike.%${digits}%`);
  const { data } = await supabase.from("contacts_view").select("id, full_name, phone, organization_name").or(filters.join(",")).limit(8);
  return (data ?? []) as ContactMatch[];
}
