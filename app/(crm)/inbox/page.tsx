import { DatabaseZap } from "lucide-react";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { Card, EmptyState } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { hasSupabaseEnv, isDemoMode } from "@/lib/config";
import { getProfiles } from "@/lib/data";
import { aiConfigured } from "@/lib/inbox/ai";
import { getConversation, getConversationCrm, getConversationMessages, getConversations } from "@/lib/inbox/data";
import { canManageAssignments } from "@/lib/permissions";
import { getPhase2PageClock } from "@/lib/phase2-data";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const [profile, params, list, profiles] = await Promise.all([requireProfile(), searchParams, getConversations(), getProfiles()]);
  if (!list.available) {
    return <Card><EmptyState icon={<DatabaseZap className="size-5" />} title="The Inbox is not set up on this database yet" description="The Phase 3 inbox migrations have not been applied to the connected Supabase project. Apply them, then reload this page. No other part of the CRM is affected." /></Card>;
  }
  const selectedId = typeof params.c === "string" ? params.c : undefined;
  const selected = selectedId ? list.conversations.find((item) => item.id === selectedId) ?? (await getConversation(selectedId)) : null;
  const [messages, crm] = selected ? await Promise.all([getConversationMessages(selected.id), getConversationCrm(selected)]) : [[], null];
  const clock = getPhase2PageClock();
  return (
    <InboxWorkspace
      conversations={list.conversations} selected={selected} messages={messages} crm={crm} profile={profile} profiles={profiles}
      canAssign={canManageAssignments(profile.role)} liveUpdates={!isDemoMode() && hasSupabaseEnv()} aiConfigured={aiConfigured()}
      nowMs={clock.nowMs} defaultIssueDate={clock.issueDate} defaultExpirationDate={clock.expirationDate}
    />
  );
}
