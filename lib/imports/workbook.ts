import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { ImportStatusMap, ImportOwnerMap, SheetColumnMapping, WorkbookMapping, WorkbookSheetInfo } from "@/lib/imports/types";
import { normalizeImportedPhone } from "@/lib/imports/phone";
import type { LeadStatus, Profile } from "@/lib/types";

export type ParsedLeadImportRow = {
  fingerprint: string;
  source_sheet: string;
  source_row: number;
  full_name: string;
  phone: string;
  phone_normalized: string | null;
  email: string;
  organization_name: string;
  customer_need: string;
  location_text: string;
  received_at: string | null;
  source: string;
  campaign_source: string;
  original_message: string;
  notes: string;
  owner_name: string;
  assigned_to: string;
  status_category: string;
  status: LeadStatus;
  warnings: string[];
};

function text(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value) return String(value.text).trim();
  }
  return String(value).trim();
}

function fillKey(cell: ExcelJS.Cell) {
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern" || fill.pattern === "none") return "No color";
  const color = fill.fgColor;
  if (!color) return "No color";
  if (color.argb) return `Color #${color.argb.slice(-6).toUpperCase()}`;
  if (color.theme !== undefined) return `Theme color ${color.theme}`;
  return "No color";
}

function parseDate(value: ExcelJS.CellValue, fallbackYear?: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString();
  const raw = text(value);
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slash) { const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]); const date = new Date(Date.UTC(year, Number(slash[2]) - 1, Number(slash[1]))); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
  const withoutYear = raw.match(/^(\d{1,2})[\s\/-]([A-Za-z]{3,9})$/);
  const parsed = new Date(withoutYear && fallbackYear ? `${raw} ${fallbackYear}` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function autoColumn(headers: string[], candidates: string[]) { const lowered = headers.map((header) => header.toLowerCase().trim()); for (const candidate of candidates) { const index = lowered.findIndex((header) => header === candidate || header.includes(candidate)); if (index >= 0) return headers[index]; } return ""; }
export function autoMapping(sheets: WorkbookSheetInfo[]): WorkbookMapping { return Object.fromEntries(sheets.map((sheet) => { const h = sheet.headers; const mapping: SheetColumnMapping = { full_name: autoColumn(h, ["client name", "contact name", "customer name", "name"]), phone: autoColumn(h, ["phone number", "phone", "whatsapp"]), email: autoColumn(h, ["email"]), organization_name: autoColumn(h, ["organization", "company"]), customer_need: autoColumn(h, ["title/field", "customer need", "project", "inquiry"]), location_text: autoColumn(h, ["region", "location", "address"]), received_at: autoColumn(h, ["date"]), campaign_source: autoColumn(h, ["media campaign", "campaign"]), owner: autoColumn(h, ["opportunity owner", "lead coordinator", "salesperson", "owner"]) }; return [sheet.name, mapping]; })); }

function defaultStatus(category: string): LeadStatus { const value = category.toLowerCase(); if (value.includes("closed")) return "lost"; if (value.includes("installed")) return "won"; if (value.includes("downpayment")) return "negotiation"; if (value.includes("fup") || value.includes("follow up") || value.includes("follow-up") || value.includes("interested")) return "contacted"; return "new"; }

export async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never);
  const legend = new Map<string, string>(); const legendSheet = workbook.worksheets.find((sheet) => sheet.name.toLowerCase().includes("color code"));
  if (legendSheet) legendSheet.eachRow((row) => { const label = text(row.getCell(1).value); if (label) legend.set(fillKey(row.getCell(1)), label.trim()); });
  const sheets = workbook.worksheets.filter((sheet) => sheet !== legendSheet).map((sheet) => { const headers = sheet.getRow(1).values; return { name: sheet.name, headers: (Array.isArray(headers) ? headers.slice(1).map((value) => text(value as ExcelJS.CellValue)).filter(Boolean) : []), row_count: Math.max(0, sheet.actualRowCount - 1) }; });
  if (!sheets.length) throw new Error("The workbook does not contain an importable worksheet.");
  if (sheets.some((sheet) => sheet.headers.length > 100) || sheets.reduce((sum, sheet) => sum + sheet.row_count, 0) > 50000) throw new Error("The workbook exceeds the safe import size.");
  return { workbook, legend, sheets, fingerprint: createHash("sha256").update(buffer).digest("hex") };
}

export async function parseLeadWorkbook(input: { buffer: Buffer; mapping?: WorkbookMapping; ownerMap?: ImportOwnerMap; statusMap?: ImportStatusMap; profiles: Profile[]; currentUserId: string }) {
  const { workbook, legend, sheets, fingerprint: fileFingerprint } = await readWorkbook(input.buffer); const mapping = input.mapping ?? autoMapping(sheets); const profileByName = new Map(input.profiles.map((profile) => [profile.full_name.trim().toLowerCase(), profile.id])); const rows: ParsedLeadImportRow[] = []; const ownerValues = new Set<string>(); const statusCategories = new Set<string>();
  for (const sheetInfo of sheets) { const sheet = workbook.getWorksheet(sheetInfo.name); if (!sheet) continue; const headers = new Map<string, number>(); sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => { const label = text(cell.value); if (label) headers.set(label, column); }); const selected = mapping[sheetInfo.name] ?? autoMapping([sheetInfo])[sheetInfo.name]; const fallbackYear = /^20\d{2}$/.test(sheetInfo.name) ? Number(sheetInfo.name) : undefined;
    for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) { const row = sheet.getRow(rowNumber); const value = (target: keyof SheetColumnMapping) => { const header = selected?.[target]; const column = header ? headers.get(header) : undefined; return column ? text(row.getCell(column).value) : ""; }; const hasData = [...headers.values()].some((column) => text(row.getCell(column).value)); if (!hasData) continue;
      const phone = value("phone"); const phoneResult = normalizeImportedPhone(phone); const receivedAt = parseDate(headers.get(selected?.received_at ?? "") ? row.getCell(headers.get(selected.received_at)!).value : null, fallbackYear); const ownerName = value("owner"); if (ownerName) ownerValues.add(ownerName); const mappedOwner = input.ownerMap?.[ownerName] || profileByName.get(ownerName.toLowerCase()) || input.currentUserId;
      const coloredCells = [...headers.values()].map((column) => row.getCell(column)).filter((cell) => fillKey(cell) !== "No color"); const rawColor = coloredCells.length ? fillKey(coloredCells[0]) : "No color"; const statusCategory = legend.get(rawColor) ?? rawColor; statusCategories.add(statusCategory); const status = input.statusMap?.[statusCategory] ?? defaultStatus(statusCategory);
      const actionNotes: string[] = []; for (const [header, column] of headers) { if (/^(action|action taken|conveyed)/i.test(header)) { const note = text(row.getCell(column).value); if (note) actionNotes.push(`${header}: ${note}`); } }
      const referralColumn = [...headers.entries()].find(([header]) => /ref+erral/i.test(header)); const referral = referralColumn ? text(row.getCell(referralColumn[1]).value) : ""; const campaign = value("campaign_source"); const source = referral ? "referral" : campaign ? "social_media" : "other"; const fullName = value("full_name"); const customerNeed = value("customer_need") || "Needs qualification"; const warningList = [phoneResult.warning, !receivedAt ? "Invalid or missing received date" : undefined, !fullName ? "Missing customer name" : undefined, ownerName && !input.ownerMap?.[ownerName] && !profileByName.has(ownerName.toLowerCase()) ? "Owner not matched; current user will be assigned" : undefined].filter(Boolean) as string[];
      const recordKey = [phoneResult.normalized ?? phone, receivedAt ?? "", customerNeed.toLowerCase(), actionNotes.join("|").toLowerCase()].join("|"); const recordFingerprint = createHash("sha256").update(recordKey).digest("hex"); rows.push({ fingerprint: recordFingerprint, source_sheet: sheetInfo.name, source_row: rowNumber, full_name: fullName, phone, phone_normalized: phoneResult.normalized, email: value("email"), organization_name: value("organization_name"), customer_need: customerNeed, location_text: value("location_text"), received_at: receivedAt, source, campaign_source: campaign, original_message: actionNotes[0] ?? "", notes: [actionNotes.join("\n"), referral ? `Historical referral: ${referral}` : "", ownerName ? `Historical owner: ${ownerName}` : "", `Historical status category: ${statusCategory}`].filter(Boolean).join("\n"), owner_name: ownerName, assigned_to: mappedOwner, status_category: statusCategory, status, warnings: warningList });
    }
  }
  return { rows, sheets, mapping, ownerValues: [...ownerValues].sort(), statusCategories: [...statusCategories].sort(), fileFingerprint };
}
