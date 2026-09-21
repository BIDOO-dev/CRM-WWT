import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { SiteVisitForm } from "@/components/site-visits/site-visit-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getPhase2FormOptions, getSiteVisit } from "@/lib/phase2-data";

export default async function EditSiteVisitPage({ params }: PageProps<"/site-visits/[id]/edit">) { const { id } = await params; const [profile, options, visit] = await Promise.all([requireProfile(), getPhase2FormOptions(), getSiteVisit(id)]); if (!visit) notFound(); return <div className="mx-auto max-w-4xl space-y-6"><Link href={`/site-visits/${id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to visit</Link><PageIntro title="Edit site visit" description={visit.project_name} /><Card className="p-5 sm:p-7"><SiteVisitForm profiles={options.profiles} contacts={options.contacts} leads={options.leads} currentUserId={profile.id} visit={visit} /></Card></div>; }
