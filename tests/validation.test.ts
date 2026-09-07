import { describe, expect, it } from "vitest";
import { contactSchema, leadNeedSchema, leadSchema, taskSchema } from "@/lib/validation";

const userId = "10000000-0000-4000-8000-000000000001";

describe("CRM input validation", () => {
  it("accepts a WhatsApp-ready lead without requiring a company", () => {
    const parsed = leadSchema.safeParse({ contact_id: "", full_name: "Ahmad Darwish", phone: "+961 70 000 000", whatsapp_number: "+961 70 000 000", contact_email: "", organization_name: "", source: "whatsapp", receiving_whatsapp_number: "+961 70 100 101", campaign_source: "Meta — Treatment", customer_need: "Wastewater treatment system", location_text: "Baabda", status: "new", priority: "medium", assigned_to: userId, received_at: "2026-09-07T12:30", last_contacted_at: "", next_follow_up_at: "", notes: "", original_message: "Hello, I need a treatment system." });
    expect(parsed.success).toBe(true);
  });

  it("rejects a lead with an invalid assignee, phone or need", () => {
    const parsed = leadSchema.safeParse({ contact_id: "", full_name: "A", phone: "12", contact_email: "bad", source: "manual", customer_need: "", status: "new", priority: "medium", assigned_to: "not-a-uuid", received_at: "" });
    expect(parsed.success).toBe(false);
  });

  it.each(["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"])("accepts the %s lead stage", (status) => {
    const parsed = leadSchema.safeParse({ contact_id: "", full_name: "Customer", phone: "+96170000000", contact_email: "", source: "manual", customer_need: "Waste collection", status, priority: "medium", assigned_to: userId, received_at: "2026-09-07T12:30" });
    expect(parsed.success).toBe(true);
  });

  it("accepts contact and task records without company relationships", () => {
    expect(contactSchema.safeParse({ full_name: "Nadine Haddad", phone: "+961 3 000 000", whatsapp_number: "+961 3 000 000", email: "nadine@example.com", location_text: "Choueifat", organization_name: "Cedar Foods", notes: "", owner_id: userId }).success).toBe(true);
    expect(taskSchema.safeParse({ title: "Follow up", description: "", task_type: "call", priority: "high", due_at: "2026-09-08T09:00", assigned_to: userId, contact_id: "", lead_id: "" }).success).toBe(true);
  });

  it("allows salespeople to manually edit the customer need", () => {
    expect(leadNeedSchema.safeParse({ customer_need: "Industrial wastewater treatment assessment", location_text: "Zahle", notes: "Call after 3 PM", next_follow_up_at: "" }).success).toBe(true);
  });
});
