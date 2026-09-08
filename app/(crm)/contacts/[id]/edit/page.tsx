import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contacts/contact-form";
import { Card, PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getContact, getProfiles } from "@/lib/data";

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  const { id } = await params;
  const [profile, profiles, contact] = await Promise.all([requireProfile(), getProfiles(), getContact(id)]);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/contacts/${contact.slug}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]">
        <ChevronLeft className="size-4" /> Back to contact
      </Link>
      <PageIntro title="Edit contact" description="Update the person’s details while keeping their leads and activity history intact." />
      <Card className="p-5 sm:p-7">
        <ContactForm profiles={profiles} currentUserId={profile.id} contact={contact} />
      </Card>
    </div>
  );
}
