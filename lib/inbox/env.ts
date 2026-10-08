import "server-only";

import { listChannelAdapters } from "@/lib/inbox/channels";
import type { ChannelKind } from "@/lib/inbox/types";

export type ChannelReadiness = { channel: ChannelKind; missing: string[] };

/** Reports which server variables are still missing. Only names are returned, never values. */
export function inboxReadiness() {
  const shared = ["SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
  const channels: ChannelReadiness[] = listChannelAdapters().map((adapter) => ({ channel: adapter.kind, missing: [...shared, ...adapter.missingEnv()] }));
  return {
    channels,
    whatsappBusinessAccountConfigured: Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
