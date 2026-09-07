"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, GripVertical, LayoutGrid, List, MapPin, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateLeadStatusAction } from "@/app/actions/crm";
import { Badge } from "@/components/ui/primitives";
import type { Lead, LeadStatus } from "@/lib/types";
import { initials, titleCase } from "@/lib/utils";

const stages: { id: LeadStatus; label: string; dot: string }[] = [
  { id: "new", label: "New", dot: "#b9d8bc" },
  { id: "contacted", label: "Contacted", dot: "#9fbda2" },
  { id: "qualified", label: "Qualified", dot: "#82a886" },
  { id: "site_visit", label: "Site visit", dot: "#69a06d" },
  { id: "quotation", label: "Quotation", dot: "#508d4c" },
  { id: "negotiation", label: "Negotiation", dot: "#3a7745" },
  { id: "won", label: "Won", dot: "#245e31" },
  { id: "lost", label: "Lost", dot: "#9c6b5c" },
];

export function PipelineBoard({ leads }: { leads: Lead[] }) {
  const [items, setItems] = useState(leads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const active = items.find((item) => item.id === activeId) ?? null;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const id = String(event.active.id);
    const stage = event.over?.id as LeadStatus | undefined;
    const current = items.find((item) => item.id === id);
    if (!current || !stage || current.status === stage) return;
    const previous = current.status;
    setItems((rows) => rows.map((row) => row.id === id ? { ...row, status: stage } : row));
    startTransition(async () => {
      const result = await updateLeadStatusAction(id, stage);
      if (!result.ok) { setItems((rows) => rows.map((row) => row.id === id ? { ...row, status: previous } : row)); toast.error(result.message); }
      else toast.success(`${current.contact_name || current.phone} moved to ${titleCase(stage)}.`);
    });
  }

  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e1e6e1] bg-white px-4 py-3"><div className="flex items-center gap-4 text-xs"><span className="font-semibold text-[#2d3830]">{items.filter((item) => !["won", "lost"].includes(item.status)).length} active leads</span><span className="h-4 w-px bg-[#e1e6e1]" /><span className="text-[#7a847c]">{items.filter((item) => item.status === "won").length} won · {items.filter((item) => item.status === "lost").length} lost</span></div><div className="flex items-center gap-2"><div className="flex rounded-lg border border-[#dce3dc] bg-[#f8faf8] p-0.5"><button onClick={() => setView("board")} aria-label="Board view" className={`grid size-8 place-items-center rounded-md ${view === "board" ? "bg-white text-[#448349] shadow-sm" : "text-[#8b938c]"}`}><LayoutGrid className="size-4" /></button><button onClick={() => setView("list")} aria-label="List view" className={`grid size-8 place-items-center rounded-md ${view === "list" ? "bg-white text-[#448349] shadow-sm" : "text-[#8b938c]"}`}><List className="size-4" /></button></div><Link href="/leads/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#448349] px-3 text-[11px] font-semibold text-white hover:bg-[#3a7745]"><Plus className="size-3.5" /> New lead</Link></div></div>{view === "board" ? <DndContext id="wwt-lead-pipeline" sensors={sensors} onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}><div className="soft-scrollbar flex snap-x gap-3 overflow-x-auto pb-4">{stages.map((stage) => <PipelineColumn key={stage.id} stage={stage} leads={items.filter((item) => item.status === stage.id)} />)}</div><DragOverlay>{active ? <LeadCard lead={active} overlay /> : null}</DragOverlay></DndContext> : <PipelineList leads={items} />}</div>;
}

function PipelineColumn({ stage, leads }: { stage: (typeof stages)[number]; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return <section ref={setNodeRef} className={`min-h-[540px] w-[286px] shrink-0 snap-start rounded-xl border p-2.5 transition-colors ${isOver ? "border-[#82a886] bg-[#eaf3ea]" : "border-[#e1e6e1] bg-[#f1f3f1]"}`}><div className="mb-3 flex items-center gap-2 px-1 py-1"><span className="size-2 rounded-full" style={{ backgroundColor: stage.dot }} /><h3 className="flex-1 text-[11px] font-bold uppercase tracking-[.07em] text-[#657068]">{stage.label}</h3><span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#7b847d]">{leads.length}</span></div><div className="space-y-2.5">{leads.map((lead) => <DraggableCard key={lead.id} lead={lead} />)}{!leads.length ? <div className="grid h-28 place-items-center rounded-lg border border-dashed border-[#d7ddd7] text-center text-[10px] leading-4 text-[#98a099]">Drag a lead<br />into this stage</div> : null}</div></section>;
}

function DraggableCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={isDragging ? "opacity-30" : "opacity-100"}><LeadCard lead={lead} dragProps={{ ...attributes, ...listeners }} /></div>;
}

function LeadCard({ lead, dragProps, overlay }: { lead: Lead; dragProps?: Record<string, unknown>; overlay?: boolean }) {
  return <article className={`rounded-lg border border-[#dfe5df] bg-white p-3.5 shadow-[0_1px_2px_rgba(30,48,33,.05)] ${overlay ? "w-[280px] rotate-2 shadow-xl" : ""}`}><div className="flex items-start gap-2"><button {...dragProps} aria-label={`Move ${lead.contact_name || lead.phone}`} className="-ml-1 mt-0.5 cursor-grab touch-none text-[#b1b8b2] active:cursor-grabbing"><GripVertical className="size-4" /></button><div className="min-w-0 flex-1"><Link href={`/leads/${lead.slug}`} className="block truncate text-xs font-semibold text-[#2c3730] hover:text-[#448349]">{lead.contact_name || lead.phone}</Link><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#59635c]">{lead.customer_need}</p></div></div><div className="mt-3 space-y-1.5 border-t border-[#edf0ed] pt-2.5 text-[9px] text-[#808a82]"><p className="flex items-center gap-1.5"><UserRound className="size-3" /> {lead.assigned_name}</p><p className="flex items-center gap-1.5"><MapPin className="size-3" /> {lead.location_text || "Location not set"}</p><p className="flex items-center gap-1.5"><CalendarClock className="size-3" /> {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "No follow-up scheduled"}</p></div><div className="mt-3 flex items-center justify-between"><Badge value={lead.priority} /><span className="grid size-7 place-items-center rounded-full bg-[#edf2ed] text-[8px] font-bold text-[#527057]" title={lead.assigned_name}>{initials(lead.assigned_name)}</span></div></article>;
}

function PipelineList({ leads }: { leads: Lead[] }) {
  return <div className="overflow-hidden rounded-xl border border-[#e1e6e1] bg-white"><div className="hidden grid-cols-[1fr_1.5fr_120px_1fr_130px] gap-4 border-b border-[#e8ece8] bg-[#fafbfa] px-5 py-3 text-[9px] font-bold uppercase tracking-[.08em] text-[#8b948c] md:grid"><span>Contact</span><span>Need</span><span>Stage</span><span>Location</span><span>Owner</span></div><div className="divide-y divide-[#edf0ed]">{leads.map((item) => <Link key={item.id} href={`/leads/${item.slug}`} className="grid gap-2 px-5 py-4 hover:bg-[#fafbfa] md:grid-cols-[1fr_1.5fr_120px_1fr_130px] md:items-center md:gap-4"><span className="text-xs font-semibold text-[#2e3931]">{item.contact_name || item.phone}</span><span className="truncate text-[11px] text-[#6f7971]">{item.customer_need}</span><Badge value={item.status} /><span className="text-[11px] text-[#6f7971]">{item.location_text || "—"}</span><span className="text-[11px] text-[#647067]">{item.assigned_name}</span></Link>)}</div></div>;
}
