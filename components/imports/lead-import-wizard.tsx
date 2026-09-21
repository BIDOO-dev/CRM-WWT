"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, inputClass, selectClass } from "@/components/ui/primitives";
import { importTargets, type ImportOwnerMap, type ImportPreviewResponse, type ImportStatusMap, type WorkbookMapping } from "@/lib/imports/types";
import type { LeadStatus, Profile } from "@/lib/types";
import { titleCase } from "@/lib/utils";

const targetLabels: Record<(typeof importTargets)[number], string> = {
  full_name: "Customer / contact name", phone: "Phone / WhatsApp", email: "Email",
  organization_name: "Organization", customer_need: "Lead need / title", location_text: "Region / location",
  received_at: "Received date", campaign_source: "Campaign source", owner: "Salesperson / owner",
};
const statuses: LeadStatus[] = ["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"];

export function LeadImportWizard({ profiles }: { profiles: Profile[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<WorkbookMapping>({});
  const [ownerMap, setOwnerMap] = useState<ImportOwnerMap>({});
  const [statusMap, setStatusMap] = useState<ImportStatusMap>({});
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [completed, setCompleted] = useState<{ imported: number; new_contacts: number; matched_contacts: number; skipped: number } | null>(null);

  async function request(mode: "preview" | "commit") {
    if (!file) { toast.error("Choose the WWT Excel workbook first."); return; }
    if (mode === "commit" && (!preview || !confirmed)) { toast.error("Review the preview and confirm before importing."); return; }
    setPending(true);
    const body = new FormData(); body.set("file", file); body.set("mode", mode);
    if (Object.keys(mapping).length) body.set("mapping", JSON.stringify(mapping));
    body.set("owner_map", JSON.stringify(ownerMap)); body.set("status_map", JSON.stringify(statusMap));
    if (mode === "commit" && preview) { body.set("expected_fingerprint", preview.file_fingerprint); body.set("confirmation", "IMPORT"); }
    try {
      const response = await fetch("/api/import/leads", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Import request failed.");
      if (mode === "preview") {
        const next = result as ImportPreviewResponse;
        setPreview(next); setMapping(next.mapping); setOwnerMap(next.owner_map); setStatusMap(next.status_map); setConfirmed(false);
        toast.success("Dry-run preview complete. No CRM records were changed.");
      } else { setCompleted(result.result); toast.success("Historical leads imported."); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import request failed."); }
    finally { setPending(false); }
  }

  if (completed) return <Card className="p-8 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#e5f2e7] text-[#33713d]"><CheckCircle2 className="size-6" /></span><h3 className="mt-4 text-lg font-semibold text-[#263229]">Import completed</h3><p className="mt-2 text-sm text-[#6f7971]">{completed.imported} leads imported. {completed.new_contacts} new contacts created, {completed.matched_contacts} existing contacts matched, and {completed.skipped} rows skipped.</p></Card>;

  return <div className="space-y-5">
    <Card className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><span className="grid size-11 place-items-center rounded-xl bg-[#edf4ed] text-[#448349]"><FileSpreadsheet className="size-5" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-[#303c33]">Select the master lead workbook</h3><p className="mt-1 text-[11px] leading-5 text-[#7b857d]">The workbook is parsed in memory and is not stored. Preview performs database reads only.</p></div><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setCompleted(null); }} className={`${inputClass} h-auto max-w-sm py-2 text-xs`} /><Button disabled={pending || !file} onClick={() => void request("preview")}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Preview</Button></div></Card>
    {preview ? <>
      <SummaryCards preview={preview} />
      <MappingCard preview={preview} mapping={mapping} setMapping={setMapping} pending={pending} refresh={() => void request("preview")} />
      <div className="grid gap-5 lg:grid-cols-2"><OwnerMapCard preview={preview} profiles={profiles} ownerMap={ownerMap} setOwnerMap={setOwnerMap} /><StatusMapCard preview={preview} statusMap={statusMap} setStatusMap={setStatusMap} /></div>
      <SampleRows preview={preview} />
      <Card className="border-[#cbdccb] bg-[#f7faf7] p-5"><label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[#448349]" /><span><span className="block text-xs font-semibold text-[#344037]">I reviewed the dry run and confirm this import.</span><span className="mt-1 block text-[10px] leading-5 text-[#748077]">Only {preview.summary.leads_ready} ready rows will be written. Invalid, duplicate and previously imported records are skipped. This does not delete or merge existing CRM records.</span></span></label><div className="mt-4 flex justify-end"><Button disabled={!confirmed || pending} onClick={() => void request("commit")}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Confirm and import {preview.summary.leads_ready} leads</Button></div></Card>
    </> : null}
  </div>;
}

function SummaryCards({ preview }: { preview: ImportPreviewResponse }) {
  const values = [["Spreadsheet rows", preview.summary.spreadsheet_rows], ["Unique contacts", preview.summary.unique_contacts], ["Existing contacts matched", preview.summary.existing_contacts_matched], ["New contacts estimated", preview.summary.new_contacts_estimated], ["Duplicate records", preview.summary.duplicate_records], ["Leads ready", preview.summary.leads_ready], ["Manual review", preview.summary.manual_review], ["Invalid phones / dates", `${preview.summary.invalid_phone_numbers} / ${preview.summary.invalid_dates}`]];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{values.map(([label, value]) => <Card key={label} className="p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-[#879088]">{label}</p><p className="mt-2 text-xl font-semibold text-[#29352c]">{value}</p></Card>)}</div>;
}

function MappingCard({ preview, mapping, setMapping, pending, refresh }: { preview: ImportPreviewResponse; mapping: WorkbookMapping; setMapping: React.Dispatch<React.SetStateAction<WorkbookMapping>>; pending: boolean; refresh: () => void }) {
  return <Card><div className="border-b border-[#edf0ed] px-5 py-4"><h3 className="text-sm font-semibold text-[#303c33]">Column mapping</h3><p className="mt-1 text-[10px] text-[#8b948c]">Review each worksheet. Action columns are preserved automatically in lead notes.</p></div><div className="space-y-6 p-5">{preview.sheets.map((sheet) => <section key={sheet.name}><h4 className="mb-3 text-xs font-bold text-[#3c493f]">{sheet.name} · {sheet.row_count} worksheet rows</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{importTargets.map((target) => <label key={target} className="text-[9px] font-bold uppercase tracking-wider text-[#879088]">{targetLabels[target]}<select value={mapping[sheet.name]?.[target] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [sheet.name]: { ...current[sheet.name], [target]: event.target.value } }))} className={`${selectClass} mt-1 h-9 text-xs`}><option value="">Not mapped</option>{sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></section>)}</div><div className="border-t border-[#edf0ed] px-5 py-4"><Button variant="secondary" disabled={pending} onClick={refresh}><RefreshCw className="size-4" /> Refresh preview with mapping</Button></div></Card>;
}

function OwnerMapCard({ preview, profiles, ownerMap, setOwnerMap }: { preview: ImportPreviewResponse; profiles: Profile[]; ownerMap: ImportOwnerMap; setOwnerMap: React.Dispatch<React.SetStateAction<ImportOwnerMap>> }) {
  return <Card><div className="border-b border-[#edf0ed] px-5 py-4"><h3 className="text-sm font-semibold text-[#303c33]">Historical owner matching</h3><p className="mt-1 text-[10px] text-[#8b948c]">Unmatched names default to your account unless mapped here.</p></div><div className="space-y-3 p-5">{preview.owner_values.length ? preview.owner_values.map((owner) => <label key={owner} className="grid grid-cols-[1fr_1fr] items-center gap-3 text-xs text-[#556058]"><span className="truncate">{owner}</span><select value={ownerMap[owner] ?? ""} onChange={(event) => setOwnerMap((current) => ({ ...current, [owner]: event.target.value }))} className={`${selectClass} h-9 text-xs`}><option value="">Current importer</option>{profiles.filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>) : <p className="text-xs text-[#8b948c]">No owner column values detected.</p>}</div></Card>;
}

function StatusMapCard({ preview, statusMap, setStatusMap }: { preview: ImportPreviewResponse; statusMap: ImportStatusMap; setStatusMap: React.Dispatch<React.SetStateAction<ImportStatusMap>> }) {
  return <Card><div className="border-b border-[#edf0ed] px-5 py-4"><h3 className="text-sm font-semibold text-[#303c33]">Legacy color / status mapping</h3><p className="mt-1 text-[10px] text-[#8b948c]">Map the workbook’s color categories into the current lead pipeline.</p></div><div className="space-y-3 p-5">{preview.status_categories.map((category) => <label key={category} className="grid grid-cols-[1fr_1fr] items-center gap-3 text-xs text-[#556058]"><span className="truncate">{category}</span><select value={statusMap[category] ?? "new"} onChange={(event) => setStatusMap((current) => ({ ...current, [category]: event.target.value as LeadStatus }))} className={`${selectClass} h-9 text-xs`}>{statuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>)}</div></Card>;
}

function SampleRows({ preview }: { preview: ImportPreviewResponse }) {
  return <Card><div className="border-b border-[#edf0ed] px-5 py-4"><h3 className="text-sm font-semibold text-[#303c33]">Sample validation results</h3><p className="mt-1 text-[10px] text-[#8b948c]">First {preview.rows.length} nonblank rows. Customer values remain in this authenticated preview only.</p></div><div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="bg-[#fafbfa] text-[9px] uppercase tracking-wider text-[#7e8880]"><tr><th className="px-4 py-3 text-left">Source</th><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Phone</th><th className="px-4 py-3 text-left">Need</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Validation</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">{preview.rows.map((row) => <tr key={`${row.source_sheet}-${row.source_row}`}><td className="whitespace-nowrap px-4 py-3 text-[10px] text-[#7e8880]">{row.source_sheet} · {row.source_row}</td><td className="max-w-44 truncate px-4 py-3 font-medium text-[#39463c]">{row.full_name || "Missing"}</td><td className="whitespace-nowrap px-4 py-3">{row.phone_normalized ?? (row.phone || "Invalid")}</td><td className="max-w-56 truncate px-4 py-3">{row.customer_need}</td><td className="px-4 py-3">{titleCase(row.status)}</td><td className="px-4 py-3">{row.duplicate ? <span className="inline-flex items-center gap-1 text-[#a85238]"><AlertTriangle className="size-3" /> Duplicate</span> : row.warnings.length ? <span title={row.warnings.join(" · ")} className="inline-flex items-center gap-1 text-[#9a641b]"><AlertTriangle className="size-3" /> Review</span> : <span className="inline-flex items-center gap-1 text-[#33713d]"><CheckCircle2 className="size-3" /> Ready{row.existing_contact ? " · matched" : ""}</span>}</td></tr>)}</tbody></table></div></Card>;
}
