import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { Quotation, QuotationItem, QuotationVersion } from "@/lib/types";

const green = rgb(0.19, 0.43, 0.24);
const ink = rgb(0.12, 0.16, 0.13);
const muted = rgb(0.42, 0.47, 0.43);
const line = rgb(0.86, 0.89, 0.86);

function money(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) current = next;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildQuotationPdf(input: { quotation: Quotation; version: QuotationVersion; items: QuotationItem[] }) {
  const { quotation, version, items } = input;
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await fs.readFile(path.join(process.cwd(), "public", "wwt-company-profile.jpeg"));
  const logo = await document.embedJpg(logoBytes);
  let page = document.addPage([595.28, 841.89]);
  let y = 790;

  const header = (target: PDFPage) => {
    target.drawImage(logo, { x: 44, y: 742, width: 126, height: 69 });
    target.drawText("QUOTATION", { x: 402, y: 782, size: 18, font: bold, color: green });
    target.drawText(`${quotation.quote_number}  |  Version ${version.version_number}`, { x: 355, y: 760, size: 9, font: regular, color: muted });
    target.drawLine({ start: { x: 44, y: 730 }, end: { x: 551, y: 730 }, thickness: 1.5, color: green });
  };
  header(page);
  y = 704;
  const label = (title: string, value: string, x: number, width: number) => {
    page.drawText(title.toUpperCase(), { x, y, size: 7.5, font: bold, color: muted });
    const lines = wrap(value || "Not provided", regular, 10, width);
    lines.slice(0, 2).forEach((text, index) => page.drawText(text, { x, y: y - 15 - index * 12, size: 10, font: regular, color: ink }));
  };
  label("Customer", quotation.contact_name, 44, 230);
  label("Project", quotation.project_name, 310, 241);
  y -= 55;
  label("Issue date", new Date(`${version.issue_date}T00:00:00`).toLocaleDateString("en-GB"), 44, 150);
  label("Valid until", new Date(`${version.expiration_date}T00:00:00`).toLocaleDateString("en-GB"), 220, 150);
  label("Salesperson", quotation.salesperson_name, 396, 155);
  y -= 60;

  const tableHeader = () => {
    page.drawRectangle({ x: 44, y: y - 6, width: 507, height: 24, color: green });
    [["Description", 50], ["Qty", 337], ["Unit", 383], ["Price", 432], ["Total", 493]].forEach(([text, x]) => page.drawText(String(text), { x: Number(x), y: y + 2, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= 20;
  };
  tableHeader();
  for (const item of items) {
    const descriptionLines = wrap(item.description, regular, 8.5, 270).slice(0, 3);
    const rowHeight = Math.max(28, descriptionLines.length * 11 + 8);
    if (y - rowHeight < 170) {
      page = document.addPage([595.28, 841.89]);
      header(page);
      y = 705;
      tableHeader();
    }
    page.drawRectangle({ x: 44, y: y - rowHeight + 6, width: 507, height: rowHeight, borderColor: line, borderWidth: 0.6 });
    descriptionLines.forEach((text, index) => page.drawText(text, { x: 50, y: y - 8 - index * 11, size: 8.5, font: regular, color: ink }));
    page.drawText(String(item.quantity), { x: 337, y: y - 8, size: 8.5, font: regular, color: ink });
    page.drawText(item.unit, { x: 383, y: y - 8, size: 8.5, font: regular, color: ink });
    page.drawText(money(item.unit_price, version.currency), { x: 432, y: y - 8, size: 7.5, font: regular, color: ink });
    page.drawText(money(item.line_total, version.currency), { x: 493, y: y - 8, size: 7.5, font: regular, color: ink });
    if (item.discount_percent > 0) page.drawText(`${item.discount_percent}% discount`, { x: 432, y: y - 20, size: 6.5, font: regular, color: muted });
    y -= rowHeight;
  }

  if (y < 245) { page = document.addPage([595.28, 841.89]); header(page); y = 700; }
  const totalRows = [
    ["Subtotal", version.subtotal],
    ["Line discounts", -version.line_discount_total],
    ["Additional discount", -version.discount_amount],
    [`Tax (${version.tax_rate}%)`, version.tax_total],
  ] as const;
  for (const [title, value] of totalRows) {
    page.drawText(title, { x: 365, y, size: 8.5, font: regular, color: muted });
    page.drawText(money(value, version.currency), { x: 470, y, size: 8.5, font: regular, color: ink });
    y -= 17;
  }
  page.drawLine({ start: { x: 365, y: y + 7 }, end: { x: 551, y: y + 7 }, thickness: 1, color: green });
  page.drawText("TOTAL", { x: 365, y: y - 6, size: 10, font: bold, color: green });
  page.drawText(money(version.total, version.currency), { x: 466, y: y - 6, size: 10, font: bold, color: green });
  y -= 45;

  const paragraph = (title: string, value?: string | null) => {
    if (!value) return;
    page.drawText(title.toUpperCase(), { x: 44, y, size: 7.5, font: bold, color: green });
    y -= 14;
    for (const text of wrap(value, regular, 8.5, 507)) {
      if (y < 60) { page = document.addPage([595.28, 841.89]); header(page); y = 700; }
      page.drawText(text, { x: 44, y, size: 8.5, font: regular, color: ink });
      y -= 11;
    }
    y -= 10;
  };
  paragraph("Notes", version.notes);
  paragraph("Terms", version.terms);

  document.getPages().forEach((target, index, pages) => {
    target.drawLine({ start: { x: 44, y: 38 }, end: { x: 551, y: 38 }, thickness: 0.5, color: line });
    target.drawText("WWT · Waste Water Treatment · Recyco", { x: 44, y: 23, size: 7, font: regular, color: muted });
    target.drawText(`Page ${index + 1} of ${pages.length}`, { x: 500, y: 23, size: 7, font: regular, color: muted });
  });
  return document.save();
}
