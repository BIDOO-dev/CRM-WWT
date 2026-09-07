import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(resolve("supabase/migrations/20260907130000_phase1_crm.sql"), "utf8").toLowerCase();
const refactorMigration = readFileSync(resolve("supabase/migrations/20260907170000_contact_lead_first_crm.sql"), "utf8").toLowerCase();

describe("contact + lead-first database architecture", () => {
  it.each(["profiles", "companies", "contacts", "leads", "opportunities", "tasks", "activities"])("keeps RLS enabled for %s", (table) => {
    expect(baseMigration).toContain(`alter table public.${table} enable row level security`);
  });

  it("normalizes phone keys for contact matching without forcing a destructive unique constraint", () => {
    expect(refactorMigration).toContain("function public.normalize_phone");
    expect(refactorMigration).toContain("phone_normalized text generated always");
    expect(refactorMigration).toContain("contacts_phone_normalized_idx");
    expect(refactorMigration).not.toContain("unique index contacts_phone_normalized");
  });

  it("creates a lead and reuses or creates its contact transactionally", () => {
    expect(refactorMigration).toContain("function public.create_lead_with_contact");
    expect(refactorMigration).toContain("where canonical_phone is not null");
    expect(refactorMigration).toContain("return jsonb_build_object('lead_id'");
    expect(refactorMigration).toContain("to authenticated, service_role");
  });

  it("uses all requested lead pipeline stages", () => {
    expect(refactorMigration).toContain("('new', 'contacted', 'qualified', 'site_visit', 'quotation', 'negotiation', 'won', 'lost')");
  });

  it("loosens company relationships but retains legacy tables safely", () => {
    expect(refactorMigration).toContain("alter column company_id drop not null");
    expect(refactorMigration).toContain("legacy archive retained");
    expect(refactorMigration).not.toContain("drop table public.companies");
  });

  it("removes the company and opportunity routes", () => {
    expect(existsSync(resolve("app/(crm)/companies/page.tsx"))).toBe(false);
    expect(existsSync(resolve("app/(crm)/opportunities/[id]/page.tsx"))).toBe(false);
  });

  it("keeps contact-first views under invoker security", () => {
    expect(refactorMigration.match(/security_invoker = true/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
