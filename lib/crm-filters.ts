import type { CrmTask, Lead, LeadStatus } from "@/lib/types";

export const leadStatuses: LeadStatus[] = ["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"];

export type LeadFilters = {
  status?: LeadStatus;
  received?: "today";
};

export type TaskFilters = {
  assignedTo?: string;
  completed?: boolean;
  due?: "today";
  open?: boolean;
  overdue?: boolean;
  upcoming?: boolean;
};

export function isLeadStatus(value: string | undefined): value is LeadStatus {
  return Boolean(value && leadStatuses.includes(value as LeadStatus));
}

export function beirutDay(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function filterLeads(leads: Lead[], filters: LeadFilters, nowIso: string) {
  const today = beirutDay(nowIso);
  return leads.filter((lead) => {
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.received === "today" && beirutDay(lead.received_at) !== today) return false;
    return true;
  });
}

export function filterTasks(tasks: CrmTask[], filters: TaskFilters, nowIso: string) {
  const now = new Date(nowIso);
  const today = beirutDay(now);
  return tasks.filter((task) => {
    const due = new Date(task.due_at);
    const completed = task.status === "completed";
    if (filters.assignedTo && task.assigned_to !== filters.assignedTo) return false;
    if (filters.completed !== undefined && completed !== filters.completed) return false;
    if (filters.open && completed) return false;
    if (filters.due === "today" && (completed || beirutDay(due) !== today)) return false;
    if (filters.overdue && (completed || due >= now)) return false;
    if (filters.upcoming && (completed || due <= now || beirutDay(due) === today)) return false;
    return true;
  });
}

export function getDashboardMetrics(leads: Lead[], tasks: CrmTask[], nowIso: string) {
  const leadCount = (status: LeadStatus) => filterLeads(leads, { status }, nowIso).length;
  return {
    newLeads: leadCount("new"),
    leadsToday: filterLeads(leads, { received: "today" }, nowIso).length,
    qualifiedLeads: leadCount("qualified"),
    siteVisits: leadCount("site_visit"),
    quotations: leadCount("quotation"),
    wonLeads: leadCount("won"),
    lostLeads: leadCount("lost"),
    tasksDueToday: filterTasks(tasks, { due: "today" }, nowIso).length,
    overdueTasks: filterTasks(tasks, { overdue: true }, nowIso).length,
  };
}
