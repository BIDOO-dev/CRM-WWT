import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth";
import { getUnreadConversationCount } from "@/lib/inbox/data";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const inboxUnread = await getUnreadConversationCount();
  return <AppShell profile={profile} inboxUnread={inboxUnread}>{children}</AppShell>;
}
