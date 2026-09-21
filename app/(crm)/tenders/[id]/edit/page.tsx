import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { TenderForm } from "@/components/tenders/tender-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getPhase2FormOptions, getTender, getTenderDetails } from "@/lib/phase2-data";

export default async function EditTenderPage({ params }: PageProps<"/tenders/[id]/edit">) { const { id } = await params; const [profile, options, tender, details] = await Promise.all([requireProfile(), getPhase2FormOptions(), getTender(id), getTenderDetails(id)]); if (!tender) notFound(); return <div className="mx-auto max-w-5xl space-y-6"><Link href={`/tenders/${id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to tender</Link><PageIntro title="Edit tender" description={tender.title} /><Card className="p-5 sm:p-7"><TenderForm tender={tender} checklist={details.checklist} profiles={options.profiles} contacts={options.contacts} currentUserId={profile.id} /></Card></div>; }
