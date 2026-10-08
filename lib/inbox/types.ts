import type { LeadStatus } from "@/lib/types";

export type ChannelKind = "whatsapp" | "instagram" | "messenger" | "tiktok";
export type ConversationStatus = "open" | "pending" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "received" | "queued" | "sent" | "delivered" | "read" | "failed";
export type MessageType = "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contacts" | "interactive" | "template" | "reaction" | "system" | "unsupported";
export type AiInsightKind = "summary" | "suggested_reply" | "requirements" | "intent" | "follow_up" | "next_action" | "qualification";

export const channelLabels: Record<ChannelKind, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", tiktok: "TikTok" };

export interface ConversationSummary {
  id: string;
  channel: ChannelKind;
  channel_account_id: string;
  account_name: string;
  account_identifier?: string | null;
  external_thread_id: string;
  external_handle?: string | null;
  display_name?: string | null;
  status: ConversationStatus;
  assigned_to?: string | null;
  assigned_name?: string | null;
  contact_id?: string | null;
  contact_slug?: string | null;
  contact_name?: string | null;
  lead_id?: string | null;
  lead_slug?: string | null;
  lead_status?: LeadStatus | null;
  lead_need?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_direction?: MessageDirection | null;
  last_inbound_at?: string | null;
  created_at: string;
  is_unread: boolean;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  media_status: "pending" | "stored" | "failed";
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  message_type: MessageType;
  body?: string | null;
  status: MessageStatus;
  error_message?: string | null;
  sender_profile_id?: string | null;
  sender_name?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  created_at: string;
  attachments: MessageAttachment[];
}

export interface ConversationNote {
  id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

export interface AiInsight {
  id: string;
  kind: AiInsightKind;
  content: Record<string, unknown>;
  model?: string | null;
  created_at: string;
}

export interface ChannelAccount {
  id: string;
  channel: ChannelKind;
  external_account_id: string;
  display_name: string;
  display_identifier?: string | null;
  is_active: boolean;
  default_assignee_id?: string | null;
  auto_create_leads: boolean;
}

export function conversationTitle(conversation: Pick<ConversationSummary, "contact_name" | "display_name" | "external_handle" | "external_thread_id">) {
  return conversation.contact_name || conversation.display_name || conversation.external_handle || conversation.external_thread_id;
}
