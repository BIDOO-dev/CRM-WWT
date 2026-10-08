import type { ChannelKind, MessageDirection, MessageType } from "@/lib/inbox/types";

export type ChannelAttachment = {
  external_media_id?: string;
  external_url?: string;
  mime_type?: string;
  file_name?: string;
  sha256?: string;
};

/** A message normalized from any provider webhook, in the shape `ingest_channel_message` expects. */
export type ChannelMessageEvent = {
  kind: "message";
  channel: ChannelKind;
  direction: MessageDirection;
  account_external_id: string;
  account_display_name?: string;
  account_identifier?: string;
  customer_external_id: string;
  customer_phone?: string;
  customer_name?: string;
  customer_handle?: string;
  external_message_id: string;
  message_type: MessageType;
  body?: string;
  occurred_at: string;
  reply_to_external_id?: string;
  metadata?: Record<string, unknown>;
  attachments: ChannelAttachment[];
};

export type ChannelStatusEvent = {
  kind: "status";
  channel: ChannelKind;
  account_external_id: string;
  external_message_id: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurred_at: string;
  error_code?: string;
  error_message?: string;
};

export type ChannelEvent = ChannelMessageEvent | ChannelStatusEvent;

export type SendResult = { ok: true; externalMessageId: string } | { ok: false; code?: string; message: string };

export type SendTextInput = { accountExternalId: string; to: string; text: string; replyToExternalId?: string };
export type SendMediaInput = { accountExternalId: string; to: string; bytes: Uint8Array; mimeType: string; fileName: string; caption?: string };
export type DownloadedMedia = { bytes: Uint8Array; mimeType: string };

/**
 * One implementation per channel. The Inbox, webhook route and server actions
 * only talk to this interface, so adding a channel never touches them.
 */
export interface ChannelAdapter {
  kind: ChannelKind;
  /** Value of the `object` field Meta sends for this product's webhooks. */
  webhookObject: string;
  /** Names of required environment variables that are currently unset. */
  missingEnv(): string[];
  parseWebhook(payload: unknown): ChannelEvent[];
  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia?(input: SendMediaInput): Promise<SendResult>;
  downloadMedia?(attachment: ChannelAttachment): Promise<DownloadedMedia | null>;
  resolveCustomerName?(customerExternalId: string): Promise<string | null>;
}
