import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn, titleCase } from "@/lib/utils";

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60", variant === "primary" && "bg-[#448349] text-white shadow-sm shadow-[#315f38]/15 hover:bg-[#3a7745]", variant === "secondary" && "border border-[#dce3dc] bg-white text-[#4e5850] shadow-sm hover:bg-[#f7f9f7]", variant === "ghost" && "text-[#59635c] hover:bg-[#edf2ed]", variant === "danger" && "bg-[#b85f45] text-white hover:bg-[#a7523b]", className)} {...props} />;
}

export function LinkButton({ className, variant = "primary", ...props }: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <Link className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors", variant === "primary" && "bg-[#448349] text-white shadow-sm shadow-[#315f38]/15 hover:bg-[#3a7745]", variant === "secondary" && "border border-[#dce3dc] bg-white text-[#4e5850] shadow-sm hover:bg-[#f7f9f7]", variant === "ghost" && "text-[#59635c] hover:bg-[#edf2ed]", className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-[#e1e6e1] bg-white shadow-[0_1px_3px_rgba(22,40,24,.04)]", className)}>{children}</section>;
}

export function PageIntro({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-[24px] font-semibold tracking-[-0.035em] text-[#172019]">{title}</h2><p className="mt-1 max-w-2xl text-sm text-[#727b74]">{description}</p></div>{actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}</div>;
}

const badgeStyles: Record<string, string> = {
  new: "bg-[#edf4ed] text-[#39703f]", contacted: "bg-[#eef2f6] text-[#50657b]", qualified: "bg-[#e7f2e8] text-[#2f7038]", site_visit: "bg-[#e9f2eb] text-[#44734b]", quotation: "bg-[#e3f0e5] text-[#397343]", negotiation: "bg-[#dcebdc] text-[#286636]", won: "bg-[#d9ecdd] text-[#21612e]", lost: "bg-[#f7eae6] text-[#a04e35]",
  low: "bg-[#f1f3f1] text-[#747d75]", medium: "bg-[#eef2e9] text-[#67794f]", high: "bg-[#fff2d9] text-[#9a641b]", urgent: "bg-[#f9e8e3] text-[#aa5036]",
  pending: "bg-[#f1f3f1] text-[#69726b]", in_progress: "bg-[#ecf1f6] text-[#526a82]", completed: "bg-[#e8f3e9] text-[#34703b]", cancelled: "bg-[#f1f1f0] text-[#777]",
};

export function Badge({ value, className }: { value: string; className?: string }) {
  return <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-semibold", badgeStyles[value] ?? "bg-[#eff2ef] text-[#606961]", className)}>{titleCase(value)}</span>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#4a554c]">{label}</span>{children}{error ? <span className="mt-1 block text-[10px] text-[#b04e34]">{error}</span> : hint ? <span className="mt-1 block text-[10px] text-[#8a938b]">{hint}</span> : null}</label>;
}

export const inputClass = "h-11 w-full rounded-lg border border-[#dce3dc] bg-white px-3 text-sm text-[#28332b] placeholder:text-[#a0a7a1] focus:border-[#82a886] focus:ring-2 focus:ring-[#b9d8bc]/50";
export const selectClass = `${inputClass} appearance-none pr-9`;
export const textareaClass = "min-h-28 w-full resize-y rounded-lg border border-[#dce3dc] bg-white px-3 py-2.5 text-sm text-[#28332b] placeholder:text-[#a0a7a1] focus:border-[#82a886] focus:ring-2 focus:ring-[#b9d8bc]/50";

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="grid min-h-72 place-items-center px-6 py-12 text-center"><div><div className="mx-auto grid size-11 place-items-center rounded-xl bg-[#edf4ed] text-[#448349]">{icon}</div><h3 className="mt-4 text-sm font-semibold text-[#29352c]">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#7d867f]">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div></div>;
}
