import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Trophy, UsersRound } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, PageIntro, selectClass } from "@/components/ui/primitives";
import { getPhase2PageClock, getTenders } from "@/lib/phase2-data";
import type { Tender, TenderStatus } from "@/lib/types";

const statuses: TenderStatus[] = ["identified", "reviewing", "bid", "no_bid", "preparing", "submitted", "won", "lost"];
const closedStatuses = new Set<TenderStatus>(["won", "lost", "no_bid", "submitted"]);

function isOverdue(tender: Tender, nowMs: number) {
  return !closedStatuses.has(tender.status) && new Date(tender.deadline).getTime() < nowMs;
}

function isUpcoming(tender: Tender, nowMs: number) {
  return !closedStatuses.has(tender.status) && new Date(tender.deadline).getTime() >= nowMs;
}

export default async function TendersPage({ searchParams }: PageProps<"/tenders">) {
  const params = await searchParams;
  const status = typeof params.status === "string" && statuses.includes(params.status as TenderStatus) ? params.status as TenderStatus : undefined;
  const deadlineFilter = params.deadline === "overdue" || params.deadline === "upcoming" ? params.deadline : undefined;
  const allTenders = await getTenders();
  const { nowMs } = getPhase2PageClock();
  const tenders = allTenders
    .filter((tender) => !status || tender.status === status)
    .filter((tender) => deadlineFilter !== "overdue" || isOverdue(tender, nowMs))
    .filter((tender) => deadlineFilter !== "upcoming" || isUpcoming(tender, nowMs));

  const summaries = [
    { label: "Upcoming deadlines", value: allTenders.filter((tender) => isUpcoming(tender, nowMs)).length, href: "/tenders?deadline=upcoming", icon: CalendarClock },
    { label: "Overdue", value: allTenders.filter((tender) => isOverdue(tender, nowMs)).length, href: "/tenders?deadline=overdue", icon: AlertTriangle },
    { label: "Submitted", value: allTenders.filter((tender) => tender.status === "submitted").length, href: "/tenders?status=submitted", icon: CheckCircle2 },
    { label: "Won / lost", value: `${allTenders.filter((tender) => tender.status === "won").length} / ${allTenders.filter((tender) => tender.status === "lost").length}`, href: "/tenders", icon: Trophy },
  ];

  return <div className="space-y-6">
    <PageIntro title="Tenders" description="Track bid decisions, editable document checklists and submission deadlines." actions={<LinkButton href="/tenders/new"><Plus className="size-4" /> New tender</LinkButton>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => { const Icon = summary.icon; return <Link key={summary.label} href={summary.href} className="rounded-xl border border-[#e1e6e1] bg-white p-4 shadow-[0_1px_3px_rgba(22,40,24,.04)] transition hover:-translate-y-0.5 hover:border-[#b9d1bb] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f9f73]"><span className="flex items-start justify-between"><span><span className="block text-[10px] font-bold uppercase tracking-wider text-[#879088]">{summary.label}</span><span className="mt-2 block text-2xl font-semibold tracking-[-.04em] text-[#253128]">{summary.value}</span></span><span className="grid size-9 place-items-center rounded-xl bg-[#edf4ed] text-[#448349]"><Icon className="size-4" /></span></span></Link>; })}
    </div>
    <Card>
      <div className="flex flex-col gap-3 border-b border-[#edf0ed] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#7b857d]">{tenders.length} {tenders.length === 1 ? "tender" : "tenders"}{deadlineFilter ? ` · ${deadlineFilter}` : ""}</p>
        <form className="flex gap-2">
          <select name="status" defaultValue={status ?? ""} className={`${selectClass} h-9 min-w-44 text-xs`}>
            <option value="">All statuses</option>
            {statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
          <button className="h-9 rounded-lg border border-[#dce3dc] px-3 text-xs font-semibold text-[#59635c]">Filter</button>
        </form>
      </div>
      {tenders.length ? <div className="divide-y divide-[#edf0ed]">{tenders.map((tender) => {
        const overdue = isOverdue(tender, nowMs);
        return <Link key={tender.id} href={`/tenders/${tender.id}`} className="flex flex-col gap-3 p-4 hover:bg-[#fafbfa] sm:flex-row sm:items-center sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf4ed] text-[#448349]"><UsersRound className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#2d3930]">{tender.title}</span><span className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[#818b83]"><span>{tender.customer_entity}</span><span>{tender.reference_number || "No reference"}</span><span>{tender.checklist_completed}/{tender.checklist_count} checklist items</span></span></span>
          <span className="flex items-center justify-between gap-4 sm:block sm:text-right"><Badge value={tender.status} />{overdue ? <span className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-[#b45438]"><AlertTriangle className="size-3" /> Overdue</span> : <span className="mt-2 block text-[9px] text-[#8b948c]">Due {new Date(tender.deadline).toLocaleDateString("en-GB")}</span>}</span>
        </Link>;
      })}</div> : <EmptyState icon={<UsersRound className="size-5" />} title={status || deadlineFilter ? `No ${status?.replaceAll("_", " ") ?? deadlineFilter} tenders found.` : "No tenders yet."} description="Add a tender to track its deadline, documents and bid status." action={<LinkButton href="/tenders/new">New tender</LinkButton>} />}
    </Card>
  </div>;
}
