import { instagramAdapter, messengerAdapter } from "@/lib/inbox/channels/messenger";
import type { ChannelAdapter } from "@/lib/inbox/channels/types";
import { whatsappAdapter } from "@/lib/inbox/channels/whatsapp";
import type { ChannelKind } from "@/lib/inbox/types";

// TikTok is intentionally absent: there is no generally available direct-message API to build against.
const adapters: Partial<Record<ChannelKind, ChannelAdapter>> = {
  whatsapp: whatsappAdapter,
  messenger: messengerAdapter,
  instagram: instagramAdapter,
};

export function getChannelAdapter(kind: ChannelKind) {
  return adapters[kind] ?? null;
}

export function getAdapterForWebhookObject(object: unknown) {
  return Object.values(adapters).find((adapter) => adapter.webhookObject === object) ?? null;
}

export function listChannelAdapters() {
  return Object.values(adapters);
}
