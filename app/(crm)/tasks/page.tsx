import { TaskBoard } from "@/components/tasks/task-board";
import { PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getContacts, getLeads, getProfiles, getTasks } from "@/lib/data";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) { const [profile, tasks, profiles, contacts, leads, params] = await Promise.all([requireProfile(), getTasks(), getProfiles(), getContacts(), getLeads(), searchParams]); return <div className="space-y-6"><PageIntro title="Tasks" description="Keep every customer promise, call and follow-up visible to the right person." /><TaskBoard tasks={tasks} profiles={profiles} contacts={contacts} leads={leads} currentUserId={profile.id} nowIso={new Date().toISOString()} initialContact={typeof params.contact === "string" ? params.contact : undefined} initialLead={typeof params.lead === "string" ? params.lead : undefined} /></div>; }
