import { Plus } from "lucide-react";
import { LeadsTable } from "@/components/leads/leads-table";
import { LinkButton, PageIntro } from "@/components/ui/primitives";
import { getLeads, getProfiles } from "@/lib/data";

export default async function LeadsPage() {
  const [leads, profiles] = await Promise.all([getLeads(), getProfiles()]);
  return <div className="space-y-6"><PageIntro title="Leads" description="Every customer request lives here—from first message through won or lost." actions={<LinkButton href="/leads/new"><Plus className="size-4" /> New lead</LinkButton>} /><LeadsTable leads={leads} profiles={profiles} /></div>;
}
