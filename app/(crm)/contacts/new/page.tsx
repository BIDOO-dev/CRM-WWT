import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ContactForm } from "@/components/contacts/contact-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getProfiles } from "@/lib/data";

export default async function NewContactPage() { const [profile, profiles] = await Promise.all([requireProfile(), getProfiles()]); return <div className="mx-auto max-w-4xl space-y-6"><Link href="/contacts" className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to contacts</Link><PageIntro title="Create a contact" description="Create the person once; future requests will become separate leads on this record." /><Card className="p-5 sm:p-7"><ContactForm profiles={profiles} currentUserId={profile.id} /></Card></div>; }
