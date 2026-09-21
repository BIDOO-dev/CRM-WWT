import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SiteVisitForm } from "@/components/site-visits/site-visit-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getPhase2FormOptions } from "@/lib/phase2-data";

export default async function NewSiteVisitPage({ searchParams }: PageProps<"/site-visits/new">) {
  const [profile, options, params] = await Promise.all([requireProfile(), getPhase2FormOptions(), searchParams]);
  return <div className="mx-auto max-w-4xl space-y-6"><Link href="/site-visits" className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to site visits</Link><PageIntro title="Schedule a site visit" description="Link the field assessment to the existing contact and lead." /><Card className="p-5 sm:p-7"><SiteVisitForm profiles={options.profiles} contacts={options.contacts} leads={options.leads} currentUserId={profile.id} initialLeadId={typeof params.lead === "string" ? params.lead : undefined} /></Card></div>;
}
