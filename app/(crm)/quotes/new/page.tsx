import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { QuotationForm } from "@/components/quotes/quotation-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getPhase2FormOptions, getPhase2PageClock } from "@/lib/phase2-data";

export default async function NewQuotationPage({ searchParams }: PageProps<"/quotes/new">) { const [profile, options, params] = await Promise.all([requireProfile(), getPhase2FormOptions(), searchParams]); const clock = getPhase2PageClock(); return <div className="mx-auto max-w-6xl space-y-6"><Link href="/quotes" className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to quotations</Link><PageIntro title="Create quotation" description="Build a priced commercial offer linked to the customer, lead and site visit." /><Card className="p-5 sm:p-7"><QuotationForm profiles={options.profiles} contacts={options.contacts} leads={options.leads} siteVisits={options.siteVisits} currentUserId={profile.id} initialSiteVisitId={typeof params.siteVisit === "string" ? params.siteVisit : undefined} initialLeadId={typeof params.lead === "string" ? params.lead : undefined} defaultIssueDate={clock.issueDate} defaultExpirationDate={clock.expirationDate} /></Card></div>; }
