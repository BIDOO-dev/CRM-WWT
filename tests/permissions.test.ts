import { describe, expect, it } from "vitest";
import { canApproveQuotations, canDeleteLeads, canImportHistoricalLeads, canManageAssignments, canManageTeam, canViewAllRecords } from "@/lib/permissions";

describe("role capability helpers", () => {
  it("allows administrators to manage all Phase 1 capabilities", () => {
    expect(canDeleteLeads("admin")).toBe(true);
    expect(canManageAssignments("admin")).toBe(true);
    expect(canViewAllRecords("admin")).toBe(true);
    expect(canApproveQuotations("admin")).toBe(true);
    expect(canImportHistoricalLeads("admin")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
  });

  it("allows managers to assign but not delete leads", () => {
    expect(canDeleteLeads("sales_manager")).toBe(false);
    expect(canManageAssignments("sales_manager")).toBe(true);
    expect(canApproveQuotations("sales_manager")).toBe(true);
    expect(canImportHistoricalLeads("sales_manager")).toBe(true);
    expect(canManageTeam("sales_manager")).toBe(false);
  });

  it("keeps sales reps scoped to their own records", () => {
    expect(canManageAssignments("sales_rep")).toBe(false);
    expect(canViewAllRecords("sales_rep")).toBe(false);
    expect(canApproveQuotations("sales_rep")).toBe(false);
    expect(canImportHistoricalLeads("sales_rep")).toBe(false);
    expect(canManageTeam("sales_rep")).toBe(false);
  });
});
