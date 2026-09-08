"use client";

import Link from "next/link";
import { ArrowUpDown, ChevronRight, Filter, Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { filterLeads, isLeadStatus, leadStatuses } from "@/lib/crm-filters";
import type { Lead, LeadStatus, Profile } from "@/lib/types";
import { initials, titleCase } from "@/lib/utils";

export function LeadsTable({ leads, profiles, nowIso, fixedStatus, emptyTitle }: { leads: Lead[]; profiles: Profile[]; nowIso: string; fixedStatus?: LeadStatus; emptyTitle?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get("status") ?? undefined;
  const status = fixedStatus ?? (isLeadStatus(requestedStatus) ? requestedStatus : undefined);
  const received = searchParams.get("received") === "today" ? "today" : undefined;
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [priority, setPriority] = useState("all");
  const [owner, setOwner] = useState("all");
  const [sortAsc, setSortAsc] = useState(false);
  const scoped = useMemo(() => filterLeads(leads, { status, received }, nowIso), [leads, nowIso, received, status]);
  const filtered = useMemo(() => scoped.filter((lead) => {
    const haystack = `${lead.contact_name} ${lead.phone} ${lead.customer_need} ${lead.organization_name ?? ""} ${lead.location_text ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (source === "all" || lead.source === source) && (priority === "all" || lead.priority === priority) && (owner === "all" || lead.assigned_to === owner);
  }).sort((a, b) => sortAsc ? a.received_at.localeCompare(b.received_at) : b.received_at.localeCompare(a.received_at)), [owner, priority, scoped, search, sortAsc, source]);
  const selectStyle = "h-9 rounded-lg border border-[#dce3dc] bg-white px-2.5 text-[11px] font-medium text-[#59635c] focus:border-[#82a886]";
  const noResultsTitle = emptyTitle ?? (status ? `No ${titleCase(status).toLowerCase()} leads found.` : received === "today" ? "No leads received today." : "No leads match these filters");

  function updateQuery(name: "status" | "received", value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete(name); else next.set(name, value);
    window.history.pushState(null, "", `${pathname}${next.size ? `?${next.toString()}` : ""}`);
  }

  function clearFilters() {
    setSearch(""); setSource("all"); setPriority("all"); setOwner("all");
    const next = new URLSearchParams(searchParams.toString());
    if (!fixedStatus) next.delete("status");
    next.delete("received");
    window.history.pushState(null, "", `${pathname}${next.size ? `?${next.toString()}` : ""}`);
  }

  return <section className="overflow-hidden rounded-xl border border-[#e1e6e1] bg-white shadow-[0_1px_3px_rgba(22,40,24,.04)]">
    <div className="flex flex-col gap-3 border-b border-[#edf0ed] p-4 lg:flex-row lg:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#929a93]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-lg border border-[#dce3dc] bg-[#fafbfa] pl-9 pr-3 text-xs placeholder:text-[#9aa29b] focus:border-[#82a886] focus:bg-white" placeholder="Search people, phones, needs or locations..." /></div><div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0"><span className="flex items-center gap-1 text-[10px] font-semibold text-[#889189]"><SlidersHorizontal className="size-3.5" /> Filters</span>{fixedStatus ? null : <select aria-label="Filter by status" value={status ?? "all"} onChange={(event) => updateQuery("status", event.target.value)} className={selectStyle}><option value="all">All stages</option>{leadStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select>}<select aria-label="Filter by received date" value={received ?? "all"} onChange={(event) => updateQuery("received", event.target.value)} className={selectStyle}><option value="all">All received dates</option><option value="today">Received today</option></select><select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)} className={selectStyle}><option value="all">All sources</option>{[...new Set(leads.map((item) => item.source))].map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}</select><select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={selectStyle}><option value="all">All priorities</option>{["low", "medium", "high", "urgent"].map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}</select><select aria-label="Filter by salesperson" value={owner} onChange={(e) => setOwner(e.target.value)} className={selectStyle}><option value="all">All salespeople</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></div></div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1080px] border-collapse text-left"><thead><tr className="border-b border-[#edf0ed] bg-[#fafbfa] text-[9px] font-bold uppercase tracking-[.08em] text-[#8b948c]"><th className="px-5 py-3">Contact</th><th className="px-4 py-3">Need / service</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Last contact</th><th className="px-4 py-3">Next follow-up</th><th className="px-4 py-3"><button onClick={() => setSortAsc((value) => !value)} className="flex items-center gap-1">Received <ArrowUpDown className="size-3" /></button></th></tr></thead><tbody className="divide-y divide-[#f0f2f0]">{filtered.map((item) => <tr key={item.id} className="group hover:bg-[#fafbfa]"><td className="px-5 py-3.5"><Link href={`/leads/${item.slug}`} className="font-semibold text-[#2f3a32] hover:text-[#448349]">{item.contact_name || item.phone}</Link><p className="mt-0.5 text-[10px] text-[#929a93]">{item.phone}{item.organization_name ? ` · ${item.organization_name}` : ""}</p></td><td className="max-w-[240px] px-4 py-3.5"><p className="truncate text-[11px] font-medium text-[#59635c]">{item.customer_need}</p><p className="mt-0.5 truncate text-[10px] text-[#929a93]">{item.location_text || "Location not set"}</p></td><td className="px-4 py-3.5 text-[11px] text-[#667068]">{titleCase(item.source)}</td><td className="px-4 py-3.5"><Badge value={item.status} /></td><td className="px-4 py-3.5"><Badge value={item.priority} /></td><td className="px-4 py-3.5"><span className="flex items-center gap-2 text-[11px] font-medium text-[#59635c]"><span className="grid size-6 place-items-center rounded-full bg-[#edf2ed] text-[8px] font-bold text-[#557059]">{initials(item.assigned_name)}</span>{item.assigned_name}</span></td><td className="px-4 py-3.5 text-[10px] text-[#7d867f]">{formatDate(item.last_contacted_at)}</td><td className="px-4 py-3.5 text-[10px] font-medium text-[#546d57]">{formatDate(item.next_follow_up_at)}</td><td className="px-4 py-3.5 text-[10px] text-[#8a938b]">{formatDate(item.received_at)}</td></tr>)}</tbody></table></div>
    <div className="divide-y divide-[#edf0ed] md:hidden">{filtered.map((item) => <Link key={item.id} href={`/leads/${item.slug}`} className="block p-4 hover:bg-[#fafbfa]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2f3a32]">{item.contact_name || item.phone}</p><p className="mt-1 line-clamp-2 text-xs text-[#758078]">{item.customer_need}</p></div><ChevronRight className="mt-0.5 size-4 shrink-0 text-[#a4aba5]" /></div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge value={item.status} /><Badge value={item.priority} /><span className="text-[10px] text-[#8a938b]">{titleCase(item.source)}</span><span className="ml-auto text-[10px] text-[#6f7871]">{item.assigned_name}</span></div></Link>)}</div>
    {!filtered.length ? <div className="grid min-h-56 place-items-center text-center"><div><Filter className="mx-auto size-6 text-[#82a886]" /><p className="mt-3 text-sm font-semibold text-[#3d493f]">{noResultsTitle}</p><button onClick={clearFilters} className="mt-2 text-xs font-semibold text-[#448349]">Clear filters</button></div></div> : null}
    <div className="border-t border-[#edf0ed] px-4 py-3 text-[10px] text-[#858e87]">Showing {filtered.length} of {scoped.length} leads in this view</div>
  </section>;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
}
