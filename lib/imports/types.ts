import type { LeadStatus } from "@/lib/types";

export const importTargets = ["full_name", "phone", "email", "organization_name", "customer_need", "location_text", "received_at", "campaign_source", "owner"] as const;
export type ImportTarget = (typeof importTargets)[number];
export type SheetColumnMapping = Record<ImportTarget, string>;
export type WorkbookMapping = Record<string, SheetColumnMapping>;
export type ImportOwnerMap = Record<string, string>;
export type ImportStatusMap = Record<string, LeadStatus>;

export type WorkbookSheetInfo = {
  name: string;
  headers: string[];
  row_count: number;
};

export type ImportPreviewRow = {
  source_sheet: string;
  source_row: number;
  full_name: string;
  phone: string;
  phone_normalized: string | null;
  customer_need: string;
  received_at: string | null;
  status_category: string;
  status: LeadStatus;
  owner_name: string;
  existing_contact: boolean;
  duplicate: boolean;
  warnings: string[];
};

export type ImportSummary = {
  spreadsheet_rows: number;
  unique_contacts: number;
  existing_contacts_matched: number;
  new_contacts_estimated: number;
  duplicate_records: number;
  leads_ready: number;
  manual_review: number;
  invalid_phone_numbers: number;
  invalid_dates: number;
  previously_imported: number;
};

export type ImportPreviewResponse = {
  file_name: string;
  file_fingerprint: string;
  sheets: WorkbookSheetInfo[];
  mapping: WorkbookMapping;
  owner_values: string[];
  owner_map: ImportOwnerMap;
  status_categories: string[];
  status_map: ImportStatusMap;
  summary: ImportSummary;
  rows: ImportPreviewRow[];
};
