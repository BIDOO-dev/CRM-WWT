import "server-only";

import { isDemoMode } from "@/lib/config";
import { demoActivities, demoContacts, demoLeads, demoProfiles, demoTasks } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Contact, CrmTask, Lead, Profile } from "@/lib/types";

function byIdOrSlug<T extends { id: string; slug: string }>(rows: T[], key: string) {
  return rows.find((row) => row.id === key || row.slug === key) ?? null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getProfiles(): Promise<Profile[]> {
  if (isDemoMode()) return demoProfiles;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, phone, avatar_url, is_active").eq("is_active", true).order("full_name");
  return (data ?? []) as Profile[];
}

export async function getLeads(): Promise<Lead[]> {
  if (isDemoMode()) return demoLeads;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("leads_view").select("*").order("received_at", { ascending: false });
  return (data ?? []) as Lead[];
}

export async function getLead(key: string) {
  if (isDemoMode()) return byIdOrSlug(demoLeads, key);
  const supabase = await createSupabaseServerClient();
  const query = supabase.from("leads_view").select("*");
  const { data } = await (isUuid(key) ? query.eq("id", key) : query.eq("slug", key)).maybeSingle();
  return data as Lead | null;
}

export async function getContacts(): Promise<Contact[]> {
  if (isDemoMode()) return demoContacts;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("contacts_view").select("*").order("last_interaction_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as Contact[];
}

export async function getContact(key: string) {
  if (isDemoMode()) return byIdOrSlug(demoContacts, key);
  const supabase = await createSupabaseServerClient();
  const query = supabase.from("contacts_view").select("*");
  const { data } = await (isUuid(key) ? query.eq("id", key) : query.eq("slug", key)).maybeSingle();
  return data as Contact | null;
}

export async function getTasks(): Promise<CrmTask[]> {
  if (isDemoMode()) return demoTasks;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tasks_view").select("*").order("due_at");
  return (data ?? []) as CrmTask[];
}

export async function getDashboardData() {
  const [leads, tasks] = await Promise.all([getLeads(), getTasks()]);
  let activities = demoActivities;
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("activities").select("id, activity_type, subject, description, occurred_at, profiles(full_name)").order("occurred_at", { ascending: false }).limit(8);
    activities = (data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), activity_type: String(row.activity_type), subject: String(row.subject), description: String(row.description ?? ""), occurred_at: String(row.occurred_at), user_name: (row.profiles as { full_name?: string } | null)?.full_name ?? "WWT CRM" }));
  }
  return { leads, tasks, activities };
}

export async function getActivitiesFor(subject: "contact" | "lead", id: string) {
  if (isDemoMode()) return demoActivities;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("activities").select("id, activity_type, subject, description, occurred_at, profiles(full_name)").eq(`${subject}_id`, id).order("occurred_at", { ascending: false });
  return (data ?? []).map((row: Record<string, unknown>) => ({ ...row, user_name: ((row.profiles as { full_name?: string } | null)?.full_name ?? "WWT CRM") }));
}

export async function getContactRelations(contactId: string) {
  if (isDemoMode()) return { leads: demoLeads.filter((item) => item.contact_id === contactId), tasks: demoTasks.filter((item) => item.contact_id === contactId), activities: demoActivities };
  const supabase = await createSupabaseServerClient();
  const [leads, tasks, activities] = await Promise.all([
    supabase.from("leads_view").select("*").eq("contact_id", contactId).order("received_at", { ascending: false }),
    supabase.from("tasks_view").select("*").eq("contact_id", contactId).order("due_at"),
    supabase.from("activities").select("id, activity_type, subject, description, occurred_at, profiles(full_name)").eq("contact_id", contactId).order("occurred_at", { ascending: false }),
  ]);
  return { leads: leads.data ?? [], tasks: tasks.data ?? [], activities: (activities.data ?? []).map((row: Record<string, unknown>) => ({ ...row, user_name: ((row.profiles as { full_name?: string } | null)?.full_name ?? "WWT CRM") })) };
}

export async function searchCrm(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (isDemoMode()) {
    return [
      ...demoContacts.filter((row) => `${row.full_name} ${row.organization_name ?? ""} ${row.phone}`.toLowerCase().includes(q)).slice(0, 5).map((row) => ({ type: "Contact", label: row.full_name || row.phone, detail: [row.phone, row.organization_name].filter(Boolean).join(" · "), href: `/contacts/${row.slug}` })),
      ...demoLeads.filter((row) => `${row.contact_name} ${row.phone} ${row.customer_need}`.toLowerCase().includes(q)).slice(0, 5).map((row) => ({ type: "Lead", label: row.contact_name || row.phone, detail: row.customer_need, href: `/leads/${row.slug}` })),
    ];
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("search_crm", { search_term: q });
  return data ?? [];
}
