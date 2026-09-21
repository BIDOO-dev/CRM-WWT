import { describe, expect, it } from "vitest";
import { quotationSchema, siteVisitSchema, teamMemberSchema, tenderSchema } from "@/lib/phase2-validation";

const contactId = "10000000-0000-4000-8000-000000000001";
const leadId = "10000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000003";

describe("Phase 2 server validation", () => {
  it("accepts a structured site visit and rejects missing scheduling details", () => {
    const valid = { contact_id: contactId, lead_id: leadId, assigned_employee_id: userId, status: "scheduled", scheduled_at: "2026-10-01T09:30", site_location: "Customer site", project_name: "Treatment assessment", contact_person: "", phone: "", requested_capacity: "12", estimated_flow: "", number_of_users: "", follow_up_date: "" };
    expect(siteVisitSchema.safeParse(valid).success).toBe(true);
    expect(siteVisitSchema.safeParse({ ...valid, scheduled_at: "", site_location: "" }).success).toBe(false);
  });

  it("validates quotation dates, currency, tax and line items", () => {
    const valid = { contact_id: contactId, lead_id: leadId, site_visit_id: "", project_name: "WWT project", salesperson_id: userId, issue_date: "2026-10-01", expiration_date: "2026-10-31", currency: "usd", notes: "", terms: "", discount_amount: 0, tax_rate: 0, items: [{ description: "Treatment system", quantity: 1, unit: "unit", unit_price: 1000, discount_percent: 0 }] };
    const parsed = quotationSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.currency).toBe("USD");
    expect(quotationSchema.safeParse({ ...valid, expiration_date: "2026-09-30" }).success).toBe(false);
    expect(quotationSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(quotationSchema.safeParse({ ...valid, tax_rate: 101 }).success).toBe(false);
  });

  it("accepts an editable tender checklist and protects team role values", () => {
    expect(tenderSchema.safeParse({ title: "Municipal tender", customer_entity: "Public entity", contact_id: "", reference_number: "T-1", description: "", estimated_value: "", currency: "usd", deadline: "2026-11-01T12:00", submission_date: "", assigned_employee_id: userId, source: "portal", status: "reviewing", notes: "", checklist: [{ label: "Technical documents", is_completed: false }, { label: "Custom requirement", is_completed: true }] }).success).toBe(true);
    expect(teamMemberSchema.safeParse({ full_name: "Team Member", email: "member@example.com", role: "owner", manager_id: "", is_active: true }).success).toBe(false);
  });
});
