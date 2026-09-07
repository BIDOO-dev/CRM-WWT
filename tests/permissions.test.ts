import { describe, expect, it } from "vitest";
import { canDeleteLeads, canManageAssignments, canViewAllRecords } from "@/lib/permissions";

describe("role capability helpers", () => {
  it("allows administrators to manage all Phase 1 capabilities", () => {
    expect(canDeleteLeads("admin")).toBe(true);
    expect(canManageAssignments("admin")).toBe(true);
    expect(canViewAllRecords("admin")).toBe(true);
  });

  it("allows managers to assign but not delete leads", () => {
    expect(canDeleteLeads("sales_manager")).toBe(false);
    expect(canManageAssignments("sales_manager")).toBe(true);
  });

  it("keeps sales reps scoped to their own records", () => {
    expect(canManageAssignments("sales_rep")).toBe(false);
    expect(canViewAllRecords("sales_rep")).toBe(false);
  });
});
