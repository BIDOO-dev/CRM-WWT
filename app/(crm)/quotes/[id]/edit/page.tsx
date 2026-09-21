import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { QuotationForm } from "@/components/quotes/quotation-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getPhase2FormOptions, getQuotation, getQuotationDetails } from "@/lib/phase2-data";

export default async function EditQuotationPage({ params }: PageProps<"/quotes/[id]/edit">) { const { id } = await params; const [profile, options, quotation, details] = await Promise.all([requireProfile(), getPhase2FormOptions(), getQuotation(id), getQuotationDetails(id)]); if (!quotation) notFound(); return <div className="mx-auto max-w-6xl space-y-6"><Link href={`/quotes/${id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to quotation</Link><PageIntro title={`Edit ${quotation.quote_number}`} description={quotation.status === "sent" ? "Saving creates a new version and preserves the sent quotation." : "Update the current draft and line items."} /><Card className="p-5 sm:p-7"><QuotationForm profiles={options.profiles} contacts={options.contacts} leads={options.leads} siteVisits={options.siteVisits} currentUserId={profile.id} quotation={quotation} initialItems={details.items} /></Card></div>; }
