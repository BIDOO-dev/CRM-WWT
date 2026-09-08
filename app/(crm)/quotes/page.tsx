import { FutureModule } from "@/components/future-module";
import { LeadsTable } from "@/components/leads/leads-table";
import { getLeads, getProfiles } from "@/lib/data";

export default async function QuotesPage() {
  const [leads, profiles] = await Promise.all([getLeads(), getProfiles()]);
  return (
    <div className="space-y-6">
      <FutureModule name="Quotes" description="Create, review and track commercial quotations from qualified leads." capabilities={["Quote templates", "Service line items", "Version history", "Approval workflow", "PDF generation", "Customer acceptance"]} />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[#29352c]">Leads at quotation</h2>
          <p className="mt-1 text-[11px] text-[#89918a]">Live Supabase records currently in the Quotation pipeline stage.</p>
        </div>
        <LeadsTable leads={leads} profiles={profiles} nowIso={new Date().toISOString()} fixedStatus="quotation" emptyTitle="No quotation leads found." />
      </section>
    </div>
  );
}
