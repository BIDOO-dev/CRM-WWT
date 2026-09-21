import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { classifyImportRows, countUniqueImportContacts } from "@/lib/imports/matching";
import { parseLeadWorkbook } from "@/lib/imports/workbook";
import type { ImportOwnerMap, ImportPreviewResponse, ImportStatusMap, WorkbookMapping } from "@/lib/imports/types";
import { canImportHistoricalLeads } from "@/lib/permissions";
import { getTeamProfiles } from "@/lib/phase2-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types";

const leadStatuses = new Set<LeadStatus>(["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"]);
function parsedJson<T>(value: FormDataEntryValue | null, fallback: T): T { if (typeof value !== "string" || !value) return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }
async function chunks<T>(values: T[], size = 150) { const result: T[][] = []; for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size)); return result; }

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!canImportHistoricalLeads(profile.role)) return NextResponse.json({ message: "Only administrators and sales managers can import historical leads." }, { status: 403 });
  const form = await request.formData(); const file = form.get("file"); const mode = form.get("mode") === "commit" ? "commit" : "preview";
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "Choose an .xlsx workbook." }, { status: 400 });
  if (!file.size || file.size > 10 * 1024 * 1024) return NextResponse.json({ message: "The workbook must be smaller than 10 MB." }, { status: 400 });
  const mapping = parsedJson<WorkbookMapping | undefined>(form.get("mapping"), undefined); const ownerMap = parsedJson<ImportOwnerMap>(form.get("owner_map"), {}); const candidateStatusMap = parsedJson<ImportStatusMap>(form.get("status_map"), {}); const statusMap = Object.fromEntries(Object.entries(candidateStatusMap).filter(([, value]) => leadStatuses.has(value))) as ImportStatusMap;
  const profiles = await getTeamProfiles(); const allowedProfiles = profiles.filter((item) => item.is_active); const allowedProfileIds = new Set(allowedProfiles.map((item) => item.id)); const safeOwnerMap = Object.fromEntries(Object.entries(ownerMap).filter(([, id]) => allowedProfileIds.has(id)));
  const buffer = Buffer.from(await file.arrayBuffer());
  let firstPass: Awaited<ReturnType<typeof parseLeadWorkbook>>;
  try { firstPass = await parseLeadWorkbook({ buffer, mapping, ownerMap: safeOwnerMap, statusMap, profiles, currentUserId: profile.id }); } catch { return NextResponse.json({ message: "The workbook could not be parsed safely. Check its worksheets and column structure." }, { status: 400 }); }
  const profileByName = new Map(allowedProfiles.map((item) => [item.full_name.trim().toLowerCase(), item.id])); const resolvedOwnerMap = { ...Object.fromEntries(firstPass.ownerValues.map((name) => [name, safeOwnerMap[name] ?? profileByName.get(name.trim().toLowerCase()) ?? ""])), ...safeOwnerMap };
  let parsed = firstPass;
  if (Object.values(resolvedOwnerMap).some(Boolean)) { try { parsed = await parseLeadWorkbook({ buffer, mapping: firstPass.mapping, ownerMap: resolvedOwnerMap, statusMap, profiles, currentUserId: profile.id }); } catch { return NextResponse.json({ message: "The workbook could not be parsed safely after applying the selected mappings." }, { status: 400 }); } }
  Object.assign(safeOwnerMap, resolvedOwnerMap);
  const supabase = await createSupabaseServerClient(); const normalizedPhones = [...new Set(parsed.rows.map((row) => row.phone_normalized).filter(Boolean))] as string[]; const fingerprints = [...new Set(parsed.rows.map((row) => row.fingerprint))]; const existingPhones = new Set<string>(); const importedFingerprints = new Set<string>();
  for (const group of await chunks(normalizedPhones)) { const [phones, whatsapp] = await Promise.all([supabase.from("contacts").select("phone_normalized, whatsapp_normalized").in("phone_normalized", group), supabase.from("contacts").select("phone_normalized, whatsapp_normalized").in("whatsapp_normalized", group)]); [...(phones.data ?? []), ...(whatsapp.data ?? [])].forEach((row) => { if (row.phone_normalized) existingPhones.add(row.phone_normalized); if (row.whatsapp_normalized) existingPhones.add(row.whatsapp_normalized); }); }
  for (const group of await chunks(fingerprints)) { const { data } = await supabase.from("lead_import_records").select("source_fingerprint").in("source_fingerprint", group); (data ?? []).forEach((row) => importedFingerprints.add(row.source_fingerprint)); }
  const rows = classifyImportRows(parsed.rows, existingPhones, importedFingerprints); const ready = rows.filter((row) => row.phone_normalized && row.received_at && !row.duplicate);
  if (mode === "commit") {
    if (form.get("confirmation") !== "IMPORT") return NextResponse.json({ message: "Explicit import confirmation is required." }, { status: 400 });
    if (form.get("expected_fingerprint") !== parsed.fileFingerprint) return NextResponse.json({ message: "The workbook changed after preview. Run preview again." }, { status: 409 });
    const payloadRows = ready.map((row) => ({ fingerprint: row.fingerprint, source_sheet: row.source_sheet, source_row: row.source_row, full_name: row.full_name, phone: row.phone, email: row.email, organization_name: row.organization_name, customer_need: row.customer_need, location_text: row.location_text, received_at: row.received_at, source: row.source, campaign_source: row.campaign_source, original_message: row.original_message, notes: row.notes, assigned_to: row.assigned_to, status: row.status, next_follow_up_at: "" }));
    const { data, error } = await supabase.rpc("import_historical_leads", { payload: { source_name: file.name, rows: payloadRows }, actor_id: profile.id });
    if (error) return NextResponse.json({ message: "The import transaction failed. No partial rows were kept.", detail: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, result: data });
  }
  const uniqueContacts = countUniqueImportContacts(rows); const existingMatched = new Set(rows.filter((row) => row.existing_contact).map((row) => row.phone_normalized)).size;
  const response: ImportPreviewResponse = { file_name: file.name, file_fingerprint: parsed.fileFingerprint, sheets: parsed.sheets, mapping: parsed.mapping, owner_values: parsed.ownerValues, owner_map: safeOwnerMap, status_categories: parsed.statusCategories, status_map: Object.fromEntries(parsed.statusCategories.map((category) => [category, rows.find((row) => row.status_category === category)?.status ?? "new"])) as ImportStatusMap, summary: { spreadsheet_rows: rows.length, unique_contacts: uniqueContacts, existing_contacts_matched: existingMatched, new_contacts_estimated: Math.max(0, uniqueContacts - existingMatched), duplicate_records: rows.filter((row) => row.duplicate).length, leads_ready: ready.length, manual_review: rows.filter((row) => row.warnings.length > 0 || row.duplicate).length, invalid_phone_numbers: rows.filter((row) => !row.phone_normalized).length, invalid_dates: rows.filter((row) => !row.received_at).length, previously_imported: rows.filter((row) => row.previously_imported).length }, rows: rows.slice(0, 50).map((row) => ({ source_sheet: row.source_sheet, source_row: row.source_row, full_name: row.full_name, phone: row.phone, phone_normalized: row.phone_normalized, customer_need: row.customer_need, received_at: row.received_at, status_category: row.status_category, status: row.status, owner_name: row.owner_name, existing_contact: row.existing_contact, duplicate: row.duplicate, warnings: row.warnings })) };
  return NextResponse.json(response);
}
