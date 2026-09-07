"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { canManageAssignments } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types";
import { contactSchema, leadNeedSchema, leadSchema, leadStatusSchema, taskSchema } from "@/lib/validation";

export type ActionResult = { ok: boolean; message: string; id?: string; slug?: string };

function safeSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || crypto.randomUUID();
}

export async function createLeadAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the lead details." };
  const assignedTo = canManageAssignments(profile.role) ? parsed.data.assigned_to : profile.id;
  const slug = safeSlug(`${parsed.data.full_name || parsed.data.phone}-${parsed.data.customer_need}`);
  if (isDemoMode()) return { ok: true, message: "Lead created in preview mode. Matching contacts are reused by phone.", id: crypto.randomUUID(), slug };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_lead_with_contact", { payload: { ...parsed.data, assigned_to: assignedTo, slug }, actor_id: profile.id });
  if (error) { console.error("Lead creation failed", error); return { ok: false, message: "We couldn’t create this lead. Please check the contact and phone details." }; }
  const result = data as { lead_id: string; lead_slug: string };
  revalidatePath("/leads"); revalidatePath("/contacts"); revalidatePath("/pipeline"); revalidatePath("/dashboard");
  return { ok: true, message: "Lead created and linked to its contact.", id: result.lead_id, slug: result.lead_slug };
}

export async function updateLeadStatusAction(id: string, status: LeadStatus): Promise<ActionResult> {
  const profile = await requireProfile();
  const valid = leadStatusSchema.safeParse(status);
  if (!valid.success) return { ok: false, message: "Choose a valid pipeline stage." };
  if (isDemoMode()) return { ok: true, message: "Pipeline updated in preview mode." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leads").update({ status: valid.data }).eq("id", id);
  if (error) { console.error("Lead status update failed", { error, userId: profile.id }); return { ok: false, message: "The lead could not be moved. Its original stage was restored." }; }
  revalidatePath("/leads"); revalidatePath(`/leads/${id}`); revalidatePath("/pipeline"); revalidatePath("/dashboard");
  return { ok: true, message: "Lead stage updated." };
}

export async function updateLeadNeedAction(id: string, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = leadNeedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the lead details." };
  if (isDemoMode()) return { ok: true, message: "Lead details updated in preview mode." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leads").update({ customer_need: parsed.data.customer_need, service_interest: parsed.data.customer_need, location_text: parsed.data.location_text || null, notes: parsed.data.notes || null, next_follow_up_at: parsed.data.next_follow_up_at || null }).eq("id", id);
  if (error) { console.error("Lead detail update failed", { error, userId: profile.id }); return { ok: false, message: "The lead details could not be updated." }; }
  revalidatePath(`/leads/${id}`); revalidatePath("/leads"); revalidatePath("/pipeline");
  return { ok: true, message: "Lead details updated." };
}

export async function createContactAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the contact details." };
  const ownerId = canManageAssignments(profile.role) ? parsed.data.owner_id : profile.id;
  const slug = `${safeSlug(parsed.data.full_name)}-${crypto.randomUUID().slice(0, 6)}`;
  if (isDemoMode()) return { ok: true, message: "Contact created in preview mode.", id: crypto.randomUUID(), slug };
  const supabase = await createSupabaseServerClient();
  const { data: duplicate } = await supabase.rpc("find_contact_by_phone", { raw_phone: parsed.data.phone });
  if (Array.isArray(duplicate) && duplicate[0]) return { ok: false, message: `A contact already uses this phone number: ${duplicate[0].full_name}.` };
  const names = parsed.data.full_name.split(/\s+/);
  const { data, error } = await supabase.from("contacts").insert({ ...parsed.data, owner_id: ownerId, created_by: profile.id, slug, email: parsed.data.email || null, whatsapp_number: parsed.data.whatsapp_number || null, location_text: parsed.data.location_text || null, organization_name: parsed.data.organization_name || null, first_name: names[0], last_name: names.slice(1).join(" ") || null }).select("id, slug").single();
  if (error) { console.error("Contact creation failed", error); return { ok: false, message: "We couldn’t create this contact." }; }
  revalidatePath("/contacts");
  return { ok: true, message: "Contact created.", id: data.id, slug: data.slug };
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the task details." };
  const assignedTo = canManageAssignments(profile.role) ? parsed.data.assigned_to : profile.id;
  if (isDemoMode()) return { ok: true, message: "Task created in preview mode.", id: crypto.randomUUID() };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tasks").insert({ ...parsed.data, assigned_to: assignedTo, created_by: profile.id, contact_id: parsed.data.contact_id || null, lead_id: parsed.data.lead_id || null }).select("id").single();
  if (error) { console.error("Task creation failed", error); return { ok: false, message: "We couldn’t create this task." }; }
  revalidatePath("/tasks"); revalidatePath("/dashboard");
  return { ok: true, message: "Task created.", id: data.id };
}

export async function completeTaskAction(id: string, completed: boolean): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return { ok: true, message: completed ? "Task completed in preview mode." : "Task reopened in preview mode." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tasks").update({ status: completed ? "completed" : "pending", completed_at: completed ? new Date().toISOString() : null }).eq("id", id);
  if (error) { console.error("Task completion failed", { error, userId: profile.id }); return { ok: false, message: "The task could not be updated." }; }
  revalidatePath("/tasks"); revalidatePath("/dashboard");
  return { ok: true, message: completed ? "Task completed." : "Task reopened." };
}

export async function addActivityNoteAction(input: { subjectId: string; subjectType: "lead" | "contact"; description: string }): Promise<ActionResult> {
  const profile = await requireProfile();
  if (input.description.trim().length < 2) return { ok: false, message: "Enter a note before saving." };
  if (isDemoMode()) return { ok: true, message: "Note added in preview mode." };
  const supabase = await createSupabaseServerClient();
  const link = input.subjectType === "lead" ? { lead_id: input.subjectId } : { contact_id: input.subjectId };
  const { error } = await supabase.from("activities").insert({ activity_type: "note", subject: "Note added", description: input.description.trim(), user_id: profile.id, ...link });
  if (error) { console.error("Activity note failed", error); return { ok: false, message: "The note could not be saved." }; }
  revalidatePath(`/${input.subjectType}s/${input.subjectId}`);
  return { ok: true, message: "Note added." };
}
