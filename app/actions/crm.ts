"use server";

import { revalidatePath } from "next/cache";
import {
  actionFailure,
  notFoundFailure,
  validationFailure,
  type ActionResult,
} from "@/lib/action-errors";
import { requireProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { canManageAssignments } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types";
import { contactSchema, leadNeedSchema, leadSchema, leadStatusSchema, taskSchema } from "@/lib/validation";

function safeSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || crypto.randomUUID();
}

function contactValues(data: typeof contactSchema._output, ownerId: string) {
  const names = data.full_name.split(/\s+/);
  return {
    ...data,
    owner_id: ownerId,
    email: data.email || null,
    whatsapp_number: data.whatsapp_number || null,
    location_text: data.location_text || null,
    organization_name: data.organization_name || null,
    notes: data.notes || null,
    first_name: names[0],
    last_name: names.slice(1).join(" ") || null,
  };
}

export async function createLeadAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the lead details.");
  const assignedTo = canManageAssignments(profile.role) ? parsed.data.assigned_to : profile.id;
  const slug = safeSlug(`${parsed.data.full_name || parsed.data.phone}-${parsed.data.customer_need}`);
  if (isDemoMode()) return { ok: true, message: "Lead created in preview mode. Matching contacts are reused by phone.", id: crypto.randomUUID(), slug };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_lead_with_contact", { payload: { ...parsed.data, assigned_to: assignedTo, slug }, actor_id: profile.id });
    if (error) return actionFailure("lead.create", profile.id, error, {
      permission_denied: "You don’t have permission to create this lead.",
      constraint_error: "This lead conflicts with an existing record. Check the contact and phone details.",
      validation_error: "Check the lead, contact, and phone details.",
    });
    const result = data as { lead_id?: string; lead_slug?: string } | null;
    if (!result?.lead_id || !result.lead_slug) return actionFailure("lead.create", profile.id, { message: "Lead RPC returned an incomplete result." });
    revalidatePath("/leads"); revalidatePath("/contacts"); revalidatePath("/pipeline"); revalidatePath("/dashboard");
    return { ok: true, message: "Lead created and linked to its contact.", id: result.lead_id, slug: result.lead_slug };
  } catch (error) {
    return actionFailure("lead.create", profile.id, error);
  }
}

export async function updateLeadStatusAction(id: string, status: LeadStatus): Promise<ActionResult> {
  const profile = await requireProfile();
  const valid = leadStatusSchema.safeParse(status);
  if (!valid.success) return validationFailure("Choose a valid pipeline stage.");
  if (isDemoMode()) return { ok: true, message: "Pipeline updated in preview mode." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("leads").update({ status: valid.data }).eq("id", id).select("id").maybeSingle();
    if (error) return actionFailure("lead.status.update", profile.id, error, { permission_denied: "You don’t have permission to move this lead." });
    if (!data) return notFoundFailure("lead.status.update", profile.id);
    revalidatePath("/leads"); revalidatePath(`/leads/${id}`); revalidatePath("/pipeline"); revalidatePath("/dashboard");
    return { ok: true, message: "Lead stage updated." };
  } catch (error) {
    return actionFailure("lead.status.update", profile.id, error);
  }
}

export async function updateLeadNeedAction(id: string, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = leadNeedSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the lead details.");
  if (isDemoMode()) return { ok: true, message: "Lead details updated in preview mode." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("leads").update({ customer_need: parsed.data.customer_need, service_interest: parsed.data.customer_need, location_text: parsed.data.location_text || null, notes: parsed.data.notes || null, next_follow_up_at: parsed.data.next_follow_up_at || null }).eq("id", id).select("id").maybeSingle();
    if (error) return actionFailure("lead.details.update", profile.id, error, { permission_denied: "You don’t have permission to edit this lead." });
    if (!data) return notFoundFailure("lead.details.update", profile.id);
    revalidatePath(`/leads/${id}`); revalidatePath("/leads"); revalidatePath("/pipeline");
    return { ok: true, message: "Lead details updated." };
  } catch (error) {
    return actionFailure("lead.details.update", profile.id, error);
  }
}

export async function createContactAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the contact details.");
  const ownerId = canManageAssignments(profile.role) ? parsed.data.owner_id : profile.id;
  const slug = `${safeSlug(parsed.data.full_name)}-${crypto.randomUUID().slice(0, 6)}`;
  if (isDemoMode()) return { ok: true, message: "Contact created in preview mode.", id: crypto.randomUUID(), slug };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: duplicate, error: duplicateError } = await supabase.rpc("find_contact_by_phone", { raw_phone: parsed.data.phone });
    if (duplicateError) return actionFailure("contact.duplicate-check", profile.id, duplicateError);
    if (Array.isArray(duplicate) && duplicate[0]) return { ok: false, kind: "constraint_error", message: `A contact already uses this phone number: ${duplicate[0].full_name}.` };

    const { data, error } = await supabase.from("contacts").insert({ ...contactValues(parsed.data, ownerId), created_by: profile.id, slug }).select("id, slug").single();
    if (error) return actionFailure("contact.create", profile.id, error, {
      permission_denied: "You don’t have permission to create a contact for this owner.",
      constraint_error: "This contact conflicts with an existing record. Check the phone and owner.",
    });
    revalidatePath("/contacts");
    return { ok: true, message: "Contact created.", id: data.id, slug: data.slug };
  } catch (error) {
    return actionFailure("contact.create", profile.id, error);
  }
}

export async function updateContactAction(id: string, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the contact details.");
  const ownerId = canManageAssignments(profile.role) ? parsed.data.owner_id : profile.id;
  if (isDemoMode()) return { ok: true, message: "Contact updated in preview mode.", id };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: duplicate, error: duplicateError } = await supabase.rpc("find_contact_by_phone", { raw_phone: parsed.data.phone });
    if (duplicateError) return actionFailure("contact.duplicate-check", profile.id, duplicateError);
    const conflictingContact = Array.isArray(duplicate) ? duplicate.find((contact) => contact.id !== id) : null;
    if (conflictingContact) return { ok: false, kind: "constraint_error", message: `A contact already uses this phone number: ${conflictingContact.full_name}.` };

    const { data, error } = await supabase.from("contacts").update(contactValues(parsed.data, ownerId)).eq("id", id).select("id, slug").maybeSingle();
    if (error) return actionFailure("contact.update", profile.id, error, {
      permission_denied: "You don’t have permission to edit this contact or change its owner.",
      constraint_error: "This contact conflicts with an existing record. Check the phone and owner.",
    });
    if (!data) return notFoundFailure("contact.update", profile.id);
    revalidatePath("/contacts"); revalidatePath(`/contacts/${id}`); revalidatePath(`/contacts/${data.slug}`);
    return { ok: true, message: "Contact updated.", id: data.id, slug: data.slug };
  } catch (error) {
    return actionFailure("contact.update", profile.id, error);
  }
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the task details.");
  const assignedTo = canManageAssignments(profile.role) ? parsed.data.assigned_to : profile.id;
  if (isDemoMode()) return { ok: true, message: "Task created in preview mode.", id: crypto.randomUUID() };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("tasks").insert({ ...parsed.data, assigned_to: assignedTo, created_by: profile.id, contact_id: parsed.data.contact_id || null, lead_id: parsed.data.lead_id || null }).select("id").single();
    if (error) return actionFailure("task.create", profile.id, error, { permission_denied: "You don’t have permission to create this task." });
    revalidatePath("/tasks"); revalidatePath("/dashboard");
    return { ok: true, message: "Task created.", id: data.id };
  } catch (error) {
    return actionFailure("task.create", profile.id, error);
  }
}

export async function completeTaskAction(id: string, completed: boolean): Promise<ActionResult> {
  const profile = await requireProfile();
  if (isDemoMode()) return { ok: true, message: completed ? "Task completed in preview mode." : "Task reopened in preview mode." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("tasks").update({ status: completed ? "completed" : "pending", completed_at: completed ? new Date().toISOString() : null }).eq("id", id).select("id").maybeSingle();
    if (error) return actionFailure("task.completion.update", profile.id, error, { permission_denied: "You don’t have permission to update this task." });
    if (!data) return notFoundFailure("task.completion.update", profile.id);
    revalidatePath("/tasks"); revalidatePath("/dashboard");
    return { ok: true, message: completed ? "Task completed." : "Task reopened." };
  } catch (error) {
    return actionFailure("task.completion.update", profile.id, error);
  }
}

export async function addActivityNoteAction(input: { subjectId: string; subjectType: "lead" | "contact"; description: string }): Promise<ActionResult> {
  const profile = await requireProfile();
  if (input.description.trim().length < 2) return validationFailure("Enter a note before saving.");
  if (isDemoMode()) return { ok: true, message: "Note added in preview mode." };
  const link = input.subjectType === "lead" ? { lead_id: input.subjectId } : { contact_id: input.subjectId };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("activities").insert({ activity_type: "note", subject: "Note added", description: input.description.trim(), user_id: profile.id, ...link });
    if (error) return actionFailure("activity.note.create", profile.id, error, { permission_denied: "You don’t have permission to add a note to this record." });
    revalidatePath(`/${input.subjectType}s/${input.subjectId}`);
    return { ok: true, message: "Note added." };
  } catch (error) {
    return actionFailure("activity.note.create", profile.id, error);
  }
}
