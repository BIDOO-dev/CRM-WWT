import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseLeadWorkbook } from "@/lib/imports/workbook";
import type { Profile } from "@/lib/types";

const userId = "10000000-0000-4000-8000-000000000001";
const profiles: Profile[] = [{ id: userId, full_name: "Sales User", email: "sales@example.test", role: "sales_rep", phone: null, avatar_url: null, is_active: true }];

describe("Excel lead workbook parsing", () => {
  it("auto-maps historical columns, preserves separate inquiries and captures spreadsheet status colors", async () => {
    const workbook = new ExcelJS.Workbook();
    const leads = workbook.addWorksheet("2026");
    leads.addRow(["#", "Date", "Client Name", "Opportunity Owner", "Phone Number", "Email", "Title/Field", "Region", "Action 1", "Media Campaign"]);
    leads.addRow([1, new Date("2026-01-05T00:00:00Z"), "Sample Customer", "Sales User", "70 123 456", "sample@example.test", "Treatment system", "Beirut", "Initial call", "Campaign A"]);
    leads.addRow([2, new Date("2026-04-05T00:00:00Z"), "Sample Customer", "Sales User", "70 123 456", "sample@example.test", "Maintenance request", "Beirut", "Follow-up", "Campaign A"]);
    const legend = workbook.addWorksheet("Color Code");
    const legendCell = legend.getCell("A1");
    legendCell.value = "Follow up";
    legendCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    for (const rowNumber of [2, 3]) leads.getCell(rowNumber, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseLeadWorkbook({ buffer, profiles, currentUserId: userId });

    expect(parsed.sheets).toEqual([{ name: "2026", headers: expect.arrayContaining(["Date", "Client Name", "Opportunity Owner", "Phone Number", "Title/Field"]), row_count: 2 }]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((row) => row.phone_normalized)).toEqual(["+96170123456", "+96170123456"]);
    expect(parsed.rows.map((row) => row.customer_need)).toEqual(["Treatment system", "Maintenance request"]);
    expect(parsed.rows[0]).toMatchObject({ assigned_to: userId, status_category: "Follow up", status: "contacted", source: "social_media" });
    expect(parsed.rows[0].notes).toContain("Action 1: Initial call");
    expect(parsed.rows[0].fingerprint).not.toBe(parsed.rows[1].fingerprint);
    expect(parsed.fileFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
