import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Activity,
  Contact,
  CrmFile,
  Lead,
  Profile,
  Quotation,
  QuotationItem,
  QuotationVersion,
  SiteVisit,
  Tender,
  TenderChecklistItem,
} from "@/lib/types";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getPhase2PageClock() {
  const now = new Date();
  const expiration = new Date(now.getTime() + 30 * 86400000);
  return {
    nowMs: now.getTime(),
    issueDate: now.toISOString().slice(0, 10),
    expirationDate: expiration.toISOString().slice(0, 10),
  };
}

function activityRows(rows: Record<string, unknown>[]): Activity[] {
  return rows.map((row) => ({
    id: String(row.id),
    activity_type: String(row.activity_type),
    subject: String(row.subject),
    description: String(row.description ?? ""),
    occurred_at: String(row.occurred_at),
    user_name: (row.profiles as { full_name?: string } | null)?.full_name ?? "WWT CRM",
  }));
}

async function signedFiles(
  table: "site_visit_files" | "quotation_files" | "tender_files",
  foreignKey: "site_visit_id" | "quotation_id" | "tender_id",
  id: string,
): Promise<CrmFile[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from(table).select("id, file_name, mime_type, size_bytes, storage_path, created_at").eq(foreignKey, id).order("created_at", { ascending: false });
  return Promise.all((data ?? []).map(async (row) => {
    const { data: signed } = await supabase.storage.from("crm-files").createSignedUrl(row.storage_path, 3600);
    return { ...row, download_url: signed?.signedUrl ?? null } as CrmFile;
  }));
}

export async function getSiteVisits(): Promise<SiteVisit[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("site_visits_view").select("*").order("scheduled_at", { ascending: false });
  return (data ?? []) as SiteVisit[];
}

export async function getSiteVisit(id: string): Promise<SiteVisit | null> {
  if (!isUuid(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("site_visits_view").select("*").eq("id", id).maybeSingle();
  return data as SiteVisit | null;
}

export async function getSiteVisitDetails(id: string) {
  const supabase = await createSupabaseServerClient();
  const [activities, files] = await Promise.all([
    supabase.from("activities").select("id, activity_type, subject, description, occurred_at, profiles(full_name)").eq("site_visit_id", id).order("occurred_at", { ascending: false }),
    signedFiles("site_visit_files", "site_visit_id", id),
  ]);
  return { activities: activityRows((activities.data ?? []) as Record<string, unknown>[]), files };
}

export async function getQuotations(): Promise<Quotation[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("quotation_current_view").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as Quotation[];
}

export async function getQuotation(id: string): Promise<Quotation | null> {
  if (!isUuid(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("quotation_current_view").select("*").eq("id", id).maybeSingle();
  return data as Quotation | null;
}

export async function getQuotationDetails(id: string) {
  const supabase = await createSupabaseServerClient();
  const quotation = await getQuotation(id);
  const [versions, items, activities, files] = await Promise.all([
    supabase.from("quotation_versions").select("*").eq("quotation_id", id).order("version_number", { ascending: false }),
    supabase.from("quotation_items").select("*").eq("quotation_version_id", quotation?.version_id ?? "00000000-0000-0000-0000-000000000000").order("position"),
    supabase.from("activities").select("id, activity_type, subject, description, occurred_at, profiles(full_name)").eq("quotation_id", id).order("occurred_at", { ascending: false }),
    signedFiles("quotation_files", "quotation_id", id),
  ]);
  const signedVersions = await Promise.all(((versions.data ?? []) as QuotationVersion[]).map(async (version) => {
    if (!version.pdf_path) return { ...version, pdf_download_url: null };
    const { data } = await supabase.storage.from("crm-files").createSignedUrl(version.pdf_path, 3600);
    return { ...version, pdf_download_url: data?.signedUrl ?? null };
  }));
  return {
    versions: signedVersions,
    items: (items.data ?? []) as QuotationItem[],
    activities: activityRows((activities.data ?? []) as Record<string, unknown>[]),
    files,
  };
}

export async function getQuotationVersion(versionId: string) {
  const supabase = await createSupabaseServerClient();
  const [version, items] = await Promise.all([
    supabase.from("quotation_versions").select("*").eq("id", versionId).maybeSingle(),
    supabase.from("quotation_items").select("*").eq("quotation_version_id", versionId).order("position"),
  ]);
  return { version: version.data as QuotationVersion | null, items: (items.data ?? []) as QuotationItem[] };
}

export async function getTenders(): Promise<Tender[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenders_view").select("*").order("deadline");
  return (data ?? []) as Tender[];
}

export async function getTender(id: string): Promise<Tender | null> {
  if (!isUuid(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenders_view").select("*").eq("id", id).maybeSingle();
  return data as Tender | null;
}

export async function getTenderDetails(id: string) {
  const supabase = await createSupabaseServerClient();
  const [checklist, activities, files] = await Promise.all([
    supabase.from("tender_checklist_items").select("*").eq("tender_id", id).order("position"),
    supabase.from("activities").select("id, activity_type, subject, description, occurred_at, profiles(full_name)").eq("tender_id", id).order("occurred_at", { ascending: false }),
    signedFiles("tender_files", "tender_id", id),
  ]);
  return {
    checklist: (checklist.data ?? []) as TenderChecklistItem[],
    activities: activityRows((activities.data ?? []) as Record<string, unknown>[]),
    files,
  };
}

export async function getTeamProfiles(): Promise<Profile[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, phone, avatar_url, is_active, manager_id, manager:profiles!profiles_manager_id_fkey(full_name)").order("full_name");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    full_name: String(row.full_name),
    email: String(row.email),
    role: row.role as Profile["role"],
    phone: row.phone as string | null,
    avatar_url: row.avatar_url as string | null,
    is_active: Boolean(row.is_active),
    manager_id: row.manager_id as string | null,
    manager_name: (row.manager as { full_name?: string } | null)?.full_name ?? null,
  }));
}

export type ReportFilters = {
  from?: string;
  to?: string;
  salesperson?: string;
  source?: string;
  receivingNumber?: string;
  stage?: string;
};

function inDateRange(value: string, filters: ReportFilters) {
  const time = new Date(value).getTime();
  if (filters.from && time < new Date(`${filters.from}T00:00:00`).getTime()) return false;
  if (filters.to && time > new Date(`${filters.to}T23:59:59`).getTime()) return false;
  return true;
}

export async function getReportData(filters: ReportFilters) {
  const supabase = await createSupabaseServerClient();
  const [leadResult, visitResult, quoteResult, tenderResult] = await Promise.all([
    supabase.from("leads_view").select("*"),
    supabase.from("site_visits_view").select("*"),
    supabase.from("quotation_current_view").select("*"),
    supabase.from("tenders_view").select("*"),
  ]);
  const leads = ((leadResult.data ?? []) as Lead[]).filter((lead) => inDateRange(lead.received_at, filters))
    .filter((lead) => !filters.salesperson || lead.assigned_to === filters.salesperson)
    .filter((lead) => !filters.source || lead.source === filters.source)
    .filter((lead) => !filters.receivingNumber || lead.receiving_whatsapp_normalized === filters.receivingNumber)
    .filter((lead) => !filters.stage || lead.status === filters.stage);
  const leadIds = new Set(leads.map((lead) => lead.id));
  const visits = ((visitResult.data ?? []) as SiteVisit[]).filter((visit) => leadIds.has(visit.lead_id) && inDateRange(visit.scheduled_at, filters));
  const quotes = ((quoteResult.data ?? []) as Quotation[]).filter((quote) => leadIds.has(quote.lead_id) && inDateRange(quote.issue_date, filters));
  const tenders = ((tenderResult.data ?? []) as Tender[]).filter((tender) => inDateRange(tender.created_at, filters))
    .filter((tender) => !filters.salesperson || tender.assigned_employee_id === filters.salesperson);
  return { leads, visits, quotes, tenders };
}

export async function getPhase2FormOptions(): Promise<{ profiles: Profile[]; contacts: Contact[]; leads: Lead[]; siteVisits: SiteVisit[] }> {
  const supabase = await createSupabaseServerClient();
  const [profiles, contacts, leads, siteVisits] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, phone, avatar_url, is_active, manager_id").eq("is_active", true).order("full_name"),
    supabase.from("contacts_view").select("*").order("full_name"),
    supabase.from("leads_view").select("*").order("received_at", { ascending: false }),
    supabase.from("site_visits_view").select("*").order("scheduled_at", { ascending: false }),
  ]);
  return {
    profiles: (profiles.data ?? []) as Profile[],
    contacts: (contacts.data ?? []) as Contact[],
    leads: (leads.data ?? []) as Lead[],
    siteVisits: (siteVisits.data ?? []) as SiteVisit[],
  };
}
