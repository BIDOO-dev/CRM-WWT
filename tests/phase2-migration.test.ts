import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const activityMigration = readFileSync(resolve("supabase/migrations/20260921120000_phase2_activity_types.sql"), "utf8").toLowerCase();
const migration = readFileSync(resolve("supabase/migrations/20260921121000_phase2_operational_crm.sql"), "utf8").toLowerCase();

describe("Phase 2 persistent database architecture", () => {
  it.each([
    "site_visits", "site_visit_files", "quotations", "quotation_versions", "quotation_items", "quotation_files",
    "tenders", "tender_checklist_items", "tender_files", "lead_imports", "lead_import_records",
  ])("creates and enables RLS for %s", (table) => {
    expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it("keeps operational views under invoker security", () => {
    expect(migration.match(/security_invoker = true/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("provides quote numbering, calculations, versioning and relationship validation", () => {
    expect(migration).toContain("function public.assign_quote_number");
    expect(migration).toContain("function public.recalculate_quotation_version");
    expect(migration).toContain("function public.save_quotation_revision");
    expect(migration).toContain("function public.set_quotation_status");
    expect(migration).toContain("linked lead could not be moved to won");
    expect(migration).toContain("next_version_number := quote_row.current_version + 1");
    expect(migration).toContain("function public.validate_quotation_links");
    expect(migration).toContain("quotation site visit does not match its lead and contact");
  });

  it("keeps private files private and governed by record-aware policies", () => {
    expect(migration).toContain("values ('crm-files', 'crm-files', false");
    expect(migration).toContain("function private.can_access_crm_file_path");
    expect(migration).toContain("create policy crm_files_select");
    expect(migration).toContain("create policy crm_files_insert");
    expect(migration).toContain("create policy crm_files_update");
    expect(migration).toContain("create policy crm_files_delete");
  });

  it("keeps sales-representative visibility tied to record or lead ownership", () => {
    const visitHelper = migration.match(/function private\.can_view_site_visit[\s\S]*?\$\$;/)?.[0] ?? "";
    const quoteHelper = migration.match(/function private\.can_view_quotation[\s\S]*?\$\$;/)?.[0] ?? "";
    const tenderHelper = migration.match(/function private\.can_view_tender[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(visitHelper).toContain("private.can_view_owner(sv.assigned_employee_id)");
    expect(quoteHelper).toContain("private.can_view_owner(q.salesperson_id)");
    expect(tenderHelper).toContain("private.can_view_owner(t.assigned_employee_id)");
    expect(visitHelper).not.toContain("private.can_view_contact(sv.contact_id)");
    expect(quoteHelper).not.toContain("private.can_view_contact(q.contact_id)");
    expect(tenderHelper).not.toContain("private.can_view_contact(t.contact_id)");
  });

  it("imports contacts and leads transactionally with phone matching and duplicate fingerprints", () => {
    expect(migration).toContain("function public.import_historical_leads");
    expect(migration).toContain("source_fingerprint text not null unique");
    expect(migration).toContain("c.phone_normalized = normalized or c.whatsapp_normalized = normalized");
    expect(migration).toContain("insert into public.contacts");
    expect(migration).toContain("insert into public.leads");
    expect(migration).toContain("private.current_role() not in ('admin', 'sales_manager')");
  });

  it("extends the existing timeline for every requested Phase 2 event", () => {
    ["task_created", "site_visit_scheduled", "site_visit_completed", "quote_created", "quote_accepted", "quote_rejected", "tender_created", "file_uploaded"].forEach((event) => expect(activityMigration).toContain(`'${event}'`));
    expect(migration).toContain("'task_created', 'task created'");
  });
});
