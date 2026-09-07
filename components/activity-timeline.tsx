import { CheckCircle2, FileText, MessageSquareText, Phone, RefreshCw, UserPlus } from "lucide-react";
import type { Activity } from "@/lib/types";

const icons = { lead_created: UserPlus, lead_assigned: UserPlus, call: Phone, note: MessageSquareText, stage_change: RefreshCw, task_completed: CheckCircle2 };

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  return <div className="divide-y divide-[#edf0ed]">{activities.map((activity) => { const Icon = icons[activity.activity_type as keyof typeof icons] ?? FileText; return <div key={activity.id} className="flex gap-3 px-5 py-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ed] text-[#448349]"><Icon className="size-3.5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-xs font-semibold text-[#344037]">{activity.subject}</p><time className="text-[9px] text-[#969e97]">{new Date(activity.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></div><p className="mt-1 text-[11px] leading-5 text-[#737d75]">{activity.description}</p><p className="mt-1 text-[9px] font-medium text-[#8c958e]">{activity.user_name}</p></div></div>; })}</div>;
}
