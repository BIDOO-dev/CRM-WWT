import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LeadForm } from "@/components/leads/lead-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getContacts, getProfiles } from "@/lib/data";

export default async function NewLeadPage({ searchParams }: PageProps<"/leads/new">) {
  const [profile, profiles, contacts, params] = await Promise.all([requireProfile(), getProfiles(), getContacts(), searchParams]);
  return <div className="mx-auto max-w-4xl space-y-6"><Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e] hover:text-[#448349]"><ChevronLeft className="size-4" /> Back to leads</Link><PageIntro title="Create a new lead" description="Reuse the contact by phone, then capture this specific customer request." /><Card className="p-5 sm:p-7"><LeadForm profiles={profiles} contacts={contacts} currentUserId={profile.id} initialContactId={typeof params.contact === "string" ? params.contact : undefined} /></Card></div>;
}
