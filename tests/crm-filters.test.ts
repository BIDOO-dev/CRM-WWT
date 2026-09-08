import { describe, expect, it } from "vitest";
import { beirutDay, filterLeads, filterTasks, getDashboardMetrics, isLeadStatus } from "@/lib/crm-filters";
import type { CrmTask, Lead, LeadStatus } from "@/lib/types";

const nowIso = "2026-09-08T10:00:00.000Z";

function lead(id: string, status: LeadStatus, receivedAt: string): Lead {
  return {
    id,
    slug: id,
    contact_id: `contact-${id}`,
    contact_name: `Contact ${id}`,
    phone: "+96170000000",
    source: "manual",
    customer_need: "Water treatment",
    status,
    priority: "medium",
    assigned_to: "user-1",
    assigned_name: "Roger",
    received_at: receivedAt,
    created_at: receivedAt,
  };
}

function task(id: string, dueAt: string, status: CrmTask["status"] = "pending"): CrmTask {
  return {
    id,
    title: `Task ${id}`,
    task_type: "follow_up",
    status,
    priority: "medium",
    due_at: dueAt,
    assigned_to: "user-1",
    assigned_name: "Roger",
  };
}

const leads = [
  lead("new", "new", "2026-09-08T08:00:00.000Z"),
  lead("today-qualified", "qualified", "2026-09-07T22:30:00.000Z"),
  lead("old-qualified", "qualified", "2026-09-07T20:30:00.000Z"),
  lead("site", "site_visit", "2026-09-06T10:00:00.000Z"),
  lead("quote", "quotation", "2026-09-06T10:00:00.000Z"),
  lead("won", "won", "2026-09-06T10:00:00.000Z"),
  lead("lost", "lost", "2026-09-06T10:00:00.000Z"),
];

const tasks = [
  task("today", "2026-09-08T15:00:00.000Z"),
  task("overdue", "2026-09-07T09:00:00.000Z"),
  task("completed-overdue", "2026-09-06T09:00:00.000Z", "completed"),
  task("upcoming", "2026-09-09T09:00:00.000Z"),
];

describe("shared dashboard and destination filters", () => {
  it("uses Beirut calendar days for received-today filtering", () => {
    expect(beirutDay("2026-09-07T22:30:00.000Z")).toBe("2026-09-08");
    expect(filterLeads(leads, { received: "today" }, nowIso).map((item) => item.id)).toEqual(["new", "today-qualified"]);
  });

  it.each(["new", "qualified", "site_visit", "quotation", "won", "lost"] as LeadStatus[])("filters the %s destination by pipeline status", (status) => {
    expect(filterLeads(leads, { status }, nowIso).every((item) => item.status === status)).toBe(true);
  });

  it("uses the same task rules for due-today and overdue views", () => {
    expect(filterTasks(tasks, { due: "today" }, nowIso).map((item) => item.id)).toEqual(["today"]);
    expect(filterTasks(tasks, { overdue: true }, nowIso).map((item) => item.id)).toEqual(["overdue"]);
  });

  it("derives every KPI from the same filter functions used by destination pages", () => {
    const metrics = getDashboardMetrics(leads, tasks, nowIso);
    expect(metrics).toEqual({
      newLeads: filterLeads(leads, { status: "new" }, nowIso).length,
      leadsToday: filterLeads(leads, { received: "today" }, nowIso).length,
      qualifiedLeads: filterLeads(leads, { status: "qualified" }, nowIso).length,
      siteVisits: filterLeads(leads, { status: "site_visit" }, nowIso).length,
      quotations: filterLeads(leads, { status: "quotation" }, nowIso).length,
      wonLeads: filterLeads(leads, { status: "won" }, nowIso).length,
      lostLeads: filterLeads(leads, { status: "lost" }, nowIso).length,
      tasksDueToday: filterTasks(tasks, { due: "today" }, nowIso).length,
      overdueTasks: filterTasks(tasks, { overdue: true }, nowIso).length,
    });
  });

  it("accepts only supported lead status query values", () => {
    expect(isLeadStatus("qualified")).toBe(true);
    expect(isLeadStatus("anything-else")).toBe(false);
  });
});
