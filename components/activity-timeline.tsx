import { CalendarCheck2, CheckCircle2, ClipboardPlus, FileText, MessageSquareText, Paperclip, Phone, RefreshCw, Trophy, UserPlus, UsersRound } from "lucide-react";
import type { Activity } from "@/lib/types";

const icons = { lead_created: UserPlus, lead_assigned: UserPlus, call: Phone, note: MessageSquareText, stage_change: RefreshCw, task_created: ClipboardPlus, task_completed: CheckCircle2, site_visit_scheduled: CalendarCheck2, site_visit_completed: CheckCircle2, quote_created: FileText, quote_sent: FileText, quote_accepted: Trophy, quote_rejected: RefreshCw, tender_created: UsersRound, file_uploaded: Paperclip };

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (!activities.length) return <p className="px-5 py-10 text-center text-xs text-[#8b948c]">No activity recorded yet.</p>;
  return <div className="divide-y divide-[#edf0ed]">{activities.map((activity) => { const Icon = icons[activity.activity_type as keyof typeof icons] ?? FileText; return <div key={activity.id} className="flex gap-3 px-5 py-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ed] text-[#448349]"><Icon className="size-3.5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-xs font-semibold text-[#344037]">{activity.subject}</p><time className="text-[9px] text-[#969e97]">{new Date(activity.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></div><p className="mt-1 text-[11px] leading-5 text-[#737d75]">{activity.description}</p><p className="mt-1 text-[9px] font-medium text-[#8c958e]">{activity.user_name}</p></div></div>; })}</div>;
}
