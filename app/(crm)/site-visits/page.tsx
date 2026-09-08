import { FutureModule } from "@/components/future-module";
import { LeadsTable } from "@/components/leads/leads-table";
import { getLeads, getProfiles } from "@/lib/data";

export default async function SiteVisitsPage() {
  const [leads, profiles] = await Promise.all([getLeads(), getProfiles()]);
  return (
    <div className="space-y-6">
      <FutureModule name="Site Visits" description="Structured assessment visits connected to contacts and leads." capabilities={["Mobile visit forms", "Photos and evidence", "Waste-stream observations", "Customer sign-off", "Follow-up actions", "Operational handoff"]} />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[#29352c]">Leads at site visit</h2>
          <p className="mt-1 text-[11px] text-[#89918a]">Live Supabase records currently in the Site Visit pipeline stage.</p>
        </div>
        <LeadsTable leads={leads} profiles={profiles} nowIso={new Date().toISOString()} fixedStatus="site_visit" emptyTitle="No site visit leads found." />
      </section>
    </div>
  );
}
