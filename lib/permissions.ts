import type { UserRole } from "@/lib/types";

export function canManageAssignments(role: UserRole) {
  return role === "admin" || role === "sales_manager";
}

export function canDeleteLeads(role: UserRole) {
  return role === "admin";
}

export function canViewAllRecords(role: UserRole) {
  return role === "admin" || role === "sales_manager";
}

export function canApproveQuotations(role: UserRole) {
  return role === "admin" || role === "sales_manager";
}

export function canImportHistoricalLeads(role: UserRole) {
  return role === "admin" || role === "sales_manager";
}

export function canManageTeam(role: UserRole) {
  return role === "admin";
}
