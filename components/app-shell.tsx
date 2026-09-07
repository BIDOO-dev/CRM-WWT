"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, CalendarCheck2, ClipboardCheck, ContactRound,
  FileText, Gauge, KanbanSquare, Leaf, LogOut, Menu, Settings, Target,
  TrendingUp, UsersRound, X,
} from "lucide-react";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { GlobalSearch } from "@/components/global-search";
import type { Profile } from "@/lib/types";
import { initials, titleCase } from "@/lib/utils";

const primaryNav = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Leads", href: "/leads", icon: Target },
  { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  { label: "Contacts", href: "/contacts", icon: ContactRound },
  { label: "Tasks", href: "/tasks", icon: ClipboardCheck },
];

const futureNav = [
  { label: "Site Visits", href: "/site-visits", icon: CalendarCheck2 },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Tenders", href: "/tenders", icon: UsersRound },
  { label: "Reports", href: "/reports", icon: TrendingUp },
];

function WwtMark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3" aria-label="WWT CRM home">
      <span className="grid size-10 place-items-center rounded-xl bg-[#448349] text-white shadow-sm shadow-green-950/20">
        <Leaf className="size-5" strokeWidth={2.3} />
      </span>
      <span>
        <span className="block text-[17px] font-bold tracking-[-0.03em] text-[#172019]">WWT CRM</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a847c]">Waste Water Treatment</span>
      </span>
    </Link>
  );
}

function NavContent({ profile, onNavigate }: { profile: Profile; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="px-5 pb-6 pt-5"><WwtMark /></div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Primary navigation">
        {primaryNav.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} onClick={onNavigate} className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${active ? "bg-[#e9f2e9] text-[#315f38]" : "text-[#59635c] hover:bg-[#f1f4f1] hover:text-[#233026]"}`}>
              <Icon className={`size-[18px] ${active ? "text-[#448349]" : "text-[#889188] group-hover:text-[#508d4c]"}`} strokeWidth={1.8} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
        <div className="px-3 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ba39c]">Workspace / Future modules</div>
        {futureNav.map((item) => { const Icon = item.icon; return (
          <Link key={item.label} href={item.href} onClick={onNavigate} className="group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[#59635c] transition-colors hover:bg-[#f1f4f1] hover:text-[#233026]">
            <Icon className="size-[18px] text-[#889188] group-hover:text-[#508d4c]" strokeWidth={1.8} /><span className="flex-1">{item.label}</span><span className="rounded-full border border-[#dfe5df] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#969e97]">Soon</span>
          </Link>
        );})}
      </nav>
      <div className="border-t border-[#edf0ed] p-3">
        <Link href="/settings" onClick={onNavigate} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[#59635c] hover:bg-[#f1f4f1]"><Settings className="size-[18px] text-[#889188]" strokeWidth={1.8} /> Settings</Link>
        <div className="mt-2 flex items-center gap-2 rounded-xl px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#315f38] text-xs font-bold text-white">{initials(profile.full_name)}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#29322b]">{profile.full_name}</span><span className="block text-[10px] text-[#89918a]">{titleCase(profile.role)}</span></span>
          <form action={logoutAction}><button type="submit" title="Sign out" aria-label="Sign out" className="grid size-8 place-items-center rounded-lg text-[#89918a] hover:bg-[#edf2ed] hover:text-[#315f38]"><LogOut className="size-4" /></button></form>
        </div>
      </div>
    </>
  );
}

const pageMeta: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Your commercial overview" },
  "/leads": { title: "Leads", subtitle: "Every incoming customer request" },
  "/pipeline": { title: "Pipeline", subtitle: "Move leads through the WWT sales process" },
  "/contacts": { title: "Contacts", subtitle: "People and their complete WWT history" },
  "/tasks": { title: "Tasks", subtitle: "Follow-ups and next actions" },
  "/site-visits": { title: "Site Visits" }, "/quotes": { title: "Quotes" }, "/tenders": { title: "Tenders" }, "/reports": { title: "Reports" }, "/settings": { title: "Settings" },
};

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const basePath = `/${pathname.split("/")[1]}`;
  const meta = pageMeta[basePath] ?? { title: "WWT CRM" };
  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#e4e9e4] bg-white lg:flex"><NavContent profile={profile} /></aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-[#172019]/35 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[285px] flex-col bg-white shadow-2xl"><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-3 top-4 grid size-9 place-items-center rounded-lg text-[#667069] hover:bg-[#f1f4f1]"><X className="size-5" /></button><NavContent profile={profile} onNavigate={() => setMobileOpen(false)} /></aside>
        </div>
      ) : null}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-[#e4e9e4] bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-lg border border-[#e1e6e1] text-[#4f5a51] lg:hidden"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1"><h1 className="truncate text-[19px] font-semibold tracking-[-0.025em] text-[#172019]">{meta.title}</h1>{meta.subtitle ? <p className="hidden text-[11px] text-[#8a938b] sm:block">{meta.subtitle}</p> : null}</div>
          <GlobalSearch />
          <button type="button" aria-label="Notifications" className="relative grid size-10 place-items-center rounded-lg border border-[#e1e6e1] text-[#667069] hover:bg-[#f7f9f7]"><Bell className="size-[18px]" strokeWidth={1.8} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#448349] ring-2 ring-white" /></button><span className="grid size-9 place-items-center rounded-full bg-[#315f38] text-[11px] font-bold text-white lg:hidden">{initials(profile.full_name)}</span>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
