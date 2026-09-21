import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TenderForm } from "@/components/tenders/tender-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getPhase2FormOptions } from "@/lib/phase2-data";

export default async function NewTenderPage() { const [profile, options] = await Promise.all([requireProfile(), getPhase2FormOptions()]); return <div className="mx-auto max-w-5xl space-y-6"><Link href="/tenders" className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to tenders</Link><PageIntro title="Create tender" description="Capture the bid opportunity, deadline and editable submission checklist." /><Card className="p-5 sm:p-7"><TenderForm profiles={options.profiles} contacts={options.contacts} currentUserId={profile.id} /></Card></div>; }
