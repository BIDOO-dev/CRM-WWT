import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { PageIntro } from "@/components/ui/primitives";
import { getLeads } from "@/lib/data";

export default async function PipelinePage() {
  const leads = await getLeads();
  return <div className="space-y-6"><PageIntro title="Lead pipeline" description="Drag every customer request through WWT’s sales stages. Changes are recorded on the activity timeline." /><PipelineBoard leads={leads} /></div>;
}
