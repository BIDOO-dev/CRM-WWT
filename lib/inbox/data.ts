import "server-only";

import { isDemoMode } from "@/lib/config";
import type { AiInsight, ChannelAccount, ChannelKind, ConversationNote, ConversationSummary, InboxMessage, MessageAttachment } from "@/lib/inbox/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Contact, CrmTask, Lead, Quotation, SiteVisit } from "@/lib/types";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type InboxList = { conversations: ConversationSummary[]; available: boolean };

/**
 * `available` is false when the inbox tables cannot be read, for example before
 * the Phase 3 migration has been applied, so the page can explain instead of failing.
 * Preview mode intentionally has no sample conversations.
 */
export async function getConversations(): Promise<InboxList> {
  if (isDemoMode()) return { conversations: [], available: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("conversations_view").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(300);
  if (error) return { conversations: [], available: false };
  return { conversations: (data ?? []) as ConversationSummary[], available: true };
}

export async function getUnreadConversationCount(): Promise<number> {
  if (isDemoMode()) return 0;
  try {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase.from("conversations_view").select("id", { count: "exact", head: true }).eq("is_unread", true).neq("status", "closed");
    return error ? 0 : count ?? 0;
  } catch { return 0; }
}

export async function getConversation(id: string): Promise<ConversationSummary | null> {
  if (isDemoMode() || !isUuid(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("conversations_view").select("*").eq("id", id).maybeSingle();
  return data as ConversationSummary | null;
}

export async function getConversationMessages(conversationId: string): Promise<InboxMessage[]> {
  const supabase = await createSupabaseServerClient();
  const [messages, attachments] = await Promise.all([
    supabase.from("messages").select("id, conversation_id, direction, message_type, body, status, error_message, sender_profile_id, metadata, sent_at, received_at, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(400),
    supabase.from("message_attachments").select("id, message_id, mime_type, file_name, size_bytes, media_status").eq("conversation_id", conversationId),
  ]);
  const byMessage = new Map<string, MessageAttachment[]>();
  for (const attachment of (attachments.data ?? []) as MessageAttachment[]) byMessage.set(attachment.message_id, [...(byMessage.get(attachment.message_id) ?? []), attachment]);
  return ((messages.data ?? []) as Array<Omit<InboxMessage, "attachments" | "sender_name"> & { metadata: Record<string, unknown> | null }>).reverse().map(({ metadata, ...message }) => ({
    ...message,
    sender_name: typeof metadata?.sender_name === "string" ? metadata.sender_name : metadata?.source ? "Sent from the phone app" : null,
    attachments: byMessage.get(message.id) ?? [],
  }));
}

export type ConversationCrm = {
  contact: Contact | null;
  lead: Lead | null;
  contactLeads: Lead[];
  tasks: CrmTask[];
  visits: SiteVisit[];
  quotations: Quotation[];
  notes: ConversationNote[];
  insights: AiInsight[];
  firstInboundBody: string | null;
};

/** Everything the right-hand CRM panel shows. Each query runs under the employee's own RLS scope. */
export async function getConversationCrm(conversation: ConversationSummary): Promise<ConversationCrm> {
  const supabase = await createSupabaseServerClient();
  const none = Promise.resolve({ data: null });
  const contactId = conversation.contact_id;
  const [contact, lead, contactLeads, tasks, visits, quotations, notes, insights, firstInbound] = await Promise.all([
    contactId ? supabase.from("contacts_view").select("*").eq("id", contactId).maybeSingle() : none,
    conversation.lead_id ? supabase.from("leads_view").select("*").eq("id", conversation.lead_id).maybeSingle() : none,
    contactId ? supabase.from("leads_view").select("*").eq("contact_id", contactId).order("received_at", { ascending: false }) : none,
    contactId ? supabase.from("tasks_view").select("*").eq("contact_id", contactId).order("due_at").limit(20) : none,
    contactId ? supabase.from("site_visits_view").select("*").eq("contact_id", contactId).order("scheduled_at", { ascending: false }).limit(10) : none,
    contactId ? supabase.from("quotation_current_view").select("*").eq("contact_id", contactId).order("updated_at", { ascending: false }).limit(10) : none,
    supabase.from("conversation_notes").select("id, body, author_id, created_at, profiles(full_name)").eq("conversation_id", conversation.id).order("created_at", { ascending: false }),
    supabase.from("conversation_ai_insights").select("id, kind, content, model, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("messages").select("body").eq("conversation_id", conversation.id).eq("direction", "inbound").not("body", "is", null).order("created_at").limit(1).maybeSingle(),
  ]);
  return {
    contact: (contact.data ?? null) as Contact | null,
    lead: (lead.data ?? null) as Lead | null,
    contactLeads: (contactLeads.data ?? []) as Lead[],
    tasks: (tasks.data ?? []) as CrmTask[],
    visits: (visits.data ?? []) as SiteVisit[],
    quotations: (quotations.data ?? []) as Quotation[],
    notes: ((notes.data ?? []) as Record<string, unknown>[]).map((row) => ({ id: String(row.id), body: String(row.body), author_id: String(row.author_id), created_at: String(row.created_at), author_name: (row.profiles as { full_name?: string } | null)?.full_name ?? "Team member" })),
    insights: (insights.data ?? []) as AiInsight[],
    firstInboundBody: (firstInbound.data as { body?: string } | null)?.body ?? null,
  };
}

export async function getChannelSettings(): Promise<{ channels: { kind: ChannelKind; label: string; is_enabled: boolean; notes: string | null }[]; accounts: ChannelAccount[]; available: boolean }> {
  if (isDemoMode()) return { channels: [], accounts: [], available: false };
  const supabase = await createSupabaseServerClient();
  const [channels, accounts] = await Promise.all([
    supabase.from("communication_channels").select("kind, label, is_enabled, notes").order("label"),
    supabase.from("channel_accounts").select("id, channel, external_account_id, display_name, display_identifier, is_active, default_assignee_id, auto_create_leads").order("created_at"),
  ]);
  if (channels.error || accounts.error) return { channels: [], accounts: [], available: false };
  return { channels: channels.data ?? [], accounts: (accounts.data ?? []) as ChannelAccount[], available: true };
}
