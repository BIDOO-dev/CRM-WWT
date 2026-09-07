import { Plus } from "lucide-react";
import { ContactDirectory } from "@/components/contacts/contact-directory";
import { LinkButton, PageIntro } from "@/components/ui/primitives";
import { getContacts } from "@/lib/data";

export default async function ContactsPage() { const contacts = await getContacts(); return <div className="space-y-6"><PageIntro title="Contacts" description="One customer record per person, matched by phone and connected to every request." actions={<LinkButton href="/contacts/new"><Plus className="size-4" /> New contact</LinkButton>} /><ContactDirectory contacts={contacts} /></div>; }
