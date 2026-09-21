"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, notFoundFailure, validationFailure, type ActionResult } from "@/lib/action-errors";
import { requireProfile } from "@/lib/auth";
import { canApproveQuotations, canManageAssignments, canManageTeam } from "@/lib/permissions";
import { buildQuotationPdf } from "@/lib/pdf/quotation";
import { getQuotation, getQuotationVersion } from "@/lib/phase2-data";
import { quotationSchema, quotationStatusSchema, siteVisitSchema, teamMemberSchema, tenderSchema } from "@/lib/phase2-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QuotationStatus } from "@/lib/types";

function nullable(value?: string | null) { return value?.trim() ? value.trim() : null; }

export async function saveSiteVisitAction(id: string | null, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = siteVisitSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the site visit details.");
  const assigned = canManageAssignments(profile.role) ? parsed.data.assigned_employee_id : profile.id;
  const values = { ...parsed.data, assigned_employee_id: assigned, contact_person: nullable(parsed.data.contact_person), phone: nullable(parsed.data.phone), project_type: nullable(parsed.data.project_type), wastewater_requirement: nullable(parsed.data.wastewater_requirement), capacity_unit: nullable(parsed.data.capacity_unit), flow_unit: nullable(parsed.data.flow_unit), application_sector: nullable(parsed.data.application_sector), notes: nullable(parsed.data.notes), observations: nullable(parsed.data.observations), recommendation: nullable(parsed.data.recommendation), next_action: nullable(parsed.data.next_action), follow_up_date: nullable(parsed.data.follow_up_date) };
  try {
    const supabase = await createSupabaseServerClient();
    const query = id ? supabase.from("site_visits").update(values).eq("id", id) : supabase.from("site_visits").insert({ ...values, created_by: profile.id });
    const { data, error } = await query.select("id").maybeSingle();
    if (error) return actionFailure(id ? "site-visit.update" : "site-visit.create", profile.id, error, { permission_denied: "You don’t have permission to save this site visit.", constraint_error: "The selected lead and contact do not match." });
    if (!data) return notFoundFailure("site-visit.save", profile.id);
    revalidatePath("/site-visits"); revalidatePath(`/site-visits/${data.id}`); revalidatePath("/dashboard");
    return { ok: true, message: id ? "Site visit updated." : "Site visit scheduled.", id: data.id };
  } catch (error) { return actionFailure("site-visit.save", profile.id, error); }
}

export async function saveQuotationAction(id: string | null, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = quotationSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the quotation details.");
  const salespersonId = canManageAssignments(profile.role) ? parsed.data.salesperson_id : profile.id;
  const payload = { ...parsed.data, salesperson_id: salespersonId, site_visit_id: parsed.data.site_visit_id || "", notes: parsed.data.notes || "", terms: parsed.data.terms || "" };
  try {
    const supabase = await createSupabaseServerClient();
    const result = id
      ? await supabase.rpc("save_quotation_revision", { target_quotation: id, payload, actor_id: profile.id })
      : await supabase.rpc("create_quotation", { payload, actor_id: profile.id });
    if (result.error) return actionFailure(id ? "quotation.revision.save" : "quotation.create", profile.id, result.error, { permission_denied: "You don’t have permission to save this quotation.", constraint_error: "Check the linked contact, lead, visit, and line items." });
    const saved = result.data as { id?: string; quote_number?: string; version_number?: number } | null;
    if (!saved?.id) return actionFailure("quotation.save", profile.id, { message: "Quotation RPC returned an incomplete result." });
    revalidatePath("/quotes"); revalidatePath(`/quotes/${saved.id}`); revalidatePath("/dashboard");
    return { ok: true, message: id && saved.version_number && saved.version_number > 1 ? `Quotation revision ${saved.version_number} created.` : id ? "Quotation updated." : `Quotation ${saved.quote_number ?? ""} created.`, id: saved.id };
  } catch (error) { return actionFailure("quotation.save", profile.id, error); }
}

export async function updateQuotationStatusAction(id: string, status: QuotationStatus, moveLeadToWon = false): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = quotationStatusSchema.safeParse(status);
  if (!parsed.success) return validationFailure("Choose a valid quotation status.");
  if (status === "approved" && !canApproveQuotations(profile.role)) return { ok: false, kind: "permission_denied", message: "Only an administrator or sales manager can approve a quotation." };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("set_quotation_status", { target_quotation: id, next_status: parsed.data, move_lead_to_won: moveLeadToWon, actor_id: profile.id });
    if (error) return actionFailure("quotation.status.update", profile.id, error, { permission_denied: "You don’t have permission to change this quotation status." });
    if (!data) return notFoundFailure("quotation.status.update", profile.id);
    revalidatePath("/quotes"); revalidatePath(`/quotes/${id}`); revalidatePath("/leads"); revalidatePath("/pipeline"); revalidatePath("/dashboard");
    return { ok: true, message: status === "accepted" && moveLeadToWon ? "Quotation accepted and lead moved to Won." : `Quotation marked ${status.replaceAll("_", " ")}.` };
  } catch (error) { return actionFailure("quotation.status.update", profile.id, error); }
}

export async function generateQuotationPdfAction(id: string): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    const quotation = await getQuotation(id);
    if (!quotation) return notFoundFailure("quotation.pdf.generate", profile.id);
    const { version, items } = await getQuotationVersion(quotation.version_id);
    if (!version) return notFoundFailure("quotation.pdf.version", profile.id);
    const bytes = await buildQuotationPdf({ quotation, version, items });
    const fileName = `${quotation.quote_number}-v${version.version_number}.pdf`;
    const storagePath = `quotes/${quotation.id}/${fileName}`;
    const supabase = await createSupabaseServerClient();
    const uploaded = await supabase.storage.from("crm-files").upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (uploaded.error) return actionFailure("quotation.pdf.upload", profile.id, uploaded.error, { permission_denied: "You don’t have permission to store this quotation PDF." });
    const linked = await supabase.rpc("attach_quotation_pdf", { target_version: version.id, storage_object_path: storagePath, actor_id: profile.id });
    if (linked.error) return actionFailure("quotation.pdf.link", profile.id, linked.error);
    revalidatePath(`/quotes/${id}`);
    return { ok: true, message: `${fileName} generated.` };
  } catch (error) { return actionFailure("quotation.pdf.generate", profile.id, error); }
}

export async function saveTenderAction(id: string | null, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = tenderSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the tender details.");
  const assignedEmployeeId = canManageAssignments(profile.role) ? parsed.data.assigned_employee_id : profile.id;
  const payload = { ...parsed.data, assigned_employee_id: assignedEmployeeId, contact_id: parsed.data.contact_id || "", reference_number: parsed.data.reference_number || "", description: parsed.data.description || "", estimated_value: parsed.data.estimated_value === undefined ? "" : String(parsed.data.estimated_value), submission_date: parsed.data.submission_date || "", source: parsed.data.source || "", notes: parsed.data.notes || "" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("save_tender", { target_tender: id, payload, actor_id: profile.id });
    if (error) return actionFailure(id ? "tender.update" : "tender.create", profile.id, error, { permission_denied: "You don’t have permission to save this tender." });
    const saved = data as { id?: string } | null;
    if (!saved?.id) return actionFailure("tender.save", profile.id, { message: "Tender RPC returned an incomplete result." });
    revalidatePath("/tenders"); revalidatePath(`/tenders/${saved.id}`); revalidatePath("/reports");
    return { ok: true, message: id ? "Tender updated." : "Tender created.", id: saved.id };
  } catch (error) { return actionFailure("tender.save", profile.id, error); }
}

export async function toggleTenderChecklistAction(id: string, completed: boolean): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("tender_checklist_items").update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null, completed_by: completed ? profile.id : null }).eq("id", id).select("id, tender_id").maybeSingle();
    if (error) return actionFailure("tender.checklist.update", profile.id, error, { permission_denied: "You don’t have permission to update this checklist." });
    if (!data) return notFoundFailure("tender.checklist.update", profile.id);
    revalidatePath(`/tenders/${data.tender_id}`); revalidatePath("/tenders");
    return { ok: true, message: completed ? "Checklist item completed." : "Checklist item reopened." };
  } catch (error) { return actionFailure("tender.checklist.update", profile.id, error); }
}

export async function updateTeamMemberAction(id: string, input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManageTeam(profile.role)) return { ok: false, kind: "permission_denied", message: "Only administrators can update team settings." };
  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "Check the employee details.");
  if (id === profile.id && (!parsed.data.is_active || parsed.data.role !== "admin")) return validationFailure("You cannot deactivate or demote your own administrator account.");
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("profiles").update({ ...parsed.data, manager_id: parsed.data.manager_id || null }).eq("id", id).select("id").maybeSingle();
    if (error) return actionFailure("team-member.update", profile.id, error, { permission_denied: "Only an administrator can change roles and managers." });
    if (!data) return notFoundFailure("team-member.update", profile.id);
    revalidatePath("/settings");
    return { ok: true, message: "Employee settings updated." };
  } catch (error) { return actionFailure("team-member.update", profile.id, error); }
}
