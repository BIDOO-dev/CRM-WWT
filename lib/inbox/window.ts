import type { ChannelKind } from "@/lib/inbox/types";

// Meta only allows free-form replies for a limited time after the customer's last message.
const replyWindowHours: Record<ChannelKind, number | null> = { whatsapp: 24, messenger: 24, instagram: 24, tiktok: null };

export type ReplyWindow = { open: boolean; expiresAt: string | null; reason?: string };

export function replyWindow(channel: ChannelKind, lastInboundAt: string | null | undefined, nowMs: number): ReplyWindow {
  const hours = replyWindowHours[channel];
  if (hours === null) return { open: false, expiresAt: null, reason: "This channel does not support replies from the CRM." };
  if (!lastInboundAt) return { open: false, expiresAt: null, reason: "The customer has not messaged this number yet. A first message requires an approved template." };
  const expires = new Date(lastInboundAt).getTime() + hours * 3600000;
  if (Number.isNaN(expires)) return { open: false, expiresAt: null, reason: "The last customer message time is unknown." };
  if (expires <= nowMs) return { open: false, expiresAt: new Date(expires).toISOString(), reason: `The ${hours}-hour reply window has closed. The customer must message again, or an approved template is required.` };
  return { open: true, expiresAt: new Date(expires).toISOString() };
}
