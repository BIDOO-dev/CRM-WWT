import { asArray, asRecord, graphRequest, graphUrl, isoFromEpoch, sendFailure, text } from "@/lib/inbox/channels/meta";
import type { ChannelAdapter, ChannelAttachment, ChannelEvent } from "@/lib/inbox/channels/types";
import type { ChannelKind, MessageType } from "@/lib/inbox/types";

const attachmentTypes: Record<string, MessageType> = { image: "image", video: "video", audio: "audio", file: "document" };

/**
 * Messenger and Instagram share Meta's `messaging` webhook shape, so one parser
 * serves both. `is_echo` marks messages sent by the page or account itself.
 */
export function parseMessagingWebhook(channel: Extract<ChannelKind, "messenger" | "instagram">, payload: unknown): ChannelEvent[] {
  const events: ChannelEvent[] = [];
  for (const entry of asArray(asRecord(payload).entry)) {
    const accountId = text(entry.id);
    if (!accountId) continue;
    for (const item of asArray(entry.messaging)) {
      const sender = text(asRecord(item.sender).id);
      const recipient = text(asRecord(item.recipient).id);
      const message = asRecord(item.message);
      const mid = text(message.mid);
      if (mid && sender && recipient) {
        const echo = message.is_echo === true;
        const customer = echo ? recipient : sender;
        const raw = asArray(message.attachments);
        const attachments: ChannelAttachment[] = raw.filter((attachment) => attachmentTypes[text(attachment.type) ?? ""]).map((attachment) => ({ external_url: text(asRecord(attachment.payload).url) })).filter((attachment) => attachment.external_url);
        const firstType = attachmentTypes[text(raw[0]?.type) ?? ""];
        const deleted = message.is_deleted === true;
        events.push({
          kind: "message", channel, direction: echo ? "outbound" : "inbound", account_external_id: accountId,
          customer_external_id: customer, external_message_id: mid,
          message_type: deleted ? "system" : text(message.text) ? "text" : firstType ?? (raw.length ? "unsupported" : "text"),
          body: deleted ? "The customer deleted this message." : text(message.text) ?? (raw.length && !firstType ? "This attachment type is not supported in the CRM yet." : undefined),
          occurred_at: isoFromEpoch(item.timestamp, "ms"), reply_to_external_id: text(asRecord(message.reply_to).mid),
          metadata: echo ? { source: `${channel}_app` } : undefined, attachments,
        });
      }
      for (const deliveredId of Array.isArray(asRecord(item.delivery).mids) ? (asRecord(item.delivery).mids as unknown[]) : []) {
        const id = text(deliveredId);
        if (id) events.push({ kind: "status", channel, account_external_id: accountId, external_message_id: id, status: "delivered", occurred_at: isoFromEpoch(item.timestamp, "ms") });
      }
    }
  }
  return events;
}

export function createMessagingAdapter(options: { kind: "messenger" | "instagram"; webhookObject: string; tokenEnv: string; host: () => string; profileFields: string }): ChannelAdapter {
  const required = ["META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", options.tokenEnv];
  return {
    kind: options.kind,
    webhookObject: options.webhookObject,
    missingEnv: () => required.filter((name) => !process.env[name]),
    parseWebhook: (payload) => parseMessagingWebhook(options.kind, payload),

    async sendText({ to, text: body }) {
      const token = process.env[options.tokenEnv];
      if (!token) return { ok: false, code: "not_configured", message: `${options.tokenEnv} is not configured on the server.` };
      const result = await graphRequest<{ message_id?: string }>(graphUrl("me/messages", options.host()), token, {
        method: "POST", body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text: body } }),
      });
      if (!result.ok) return sendFailure(result);
      return result.data.message_id ? { ok: true, externalMessageId: result.data.message_id } : { ok: false, message: "Meta accepted the request but returned no message id." };
    },

    // Attachment URLs are public but short-lived CDN links, so they are copied on arrival.
    async downloadMedia(attachment) {
      if (!attachment.external_url || !/^https:\/\/[^/]+\.(fbcdn\.net|fbsbx\.com|cdninstagram\.com)\//.test(attachment.external_url)) return null;
      const response = await fetch(attachment.external_url, { cache: "no-store" });
      if (!response.ok) return null;
      return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
    },

    async resolveCustomerName(customerExternalId) {
      const token = process.env[options.tokenEnv];
      if (!token) return null;
      const result = await graphRequest<{ first_name?: string; last_name?: string; name?: string; username?: string }>(`${graphUrl(customerExternalId, options.host())}?fields=${options.profileFields}`, token);
      if (!result.ok) return null;
      return [result.data.first_name, result.data.last_name].filter(Boolean).join(" ") || result.data.name || result.data.username || null;
    },
  };
}

export const messengerAdapter = createMessagingAdapter({ kind: "messenger", webhookObject: "page", tokenEnv: "MESSENGER_PAGE_ACCESS_TOKEN", host: () => "graph.facebook.com", profileFields: "first_name,last_name" });

// Instagram accounts connected with Instagram Login use graph.instagram.com; accounts
// connected through a Facebook Page use graph.facebook.com. INSTAGRAM_GRAPH_HOST selects it.
export const instagramAdapter = createMessagingAdapter({ kind: "instagram", webhookObject: "instagram", tokenEnv: "INSTAGRAM_ACCESS_TOKEN", host: () => process.env.INSTAGRAM_GRAPH_HOST || "graph.facebook.com", profileFields: "name,username" });
