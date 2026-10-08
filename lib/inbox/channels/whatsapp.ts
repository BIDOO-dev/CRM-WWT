import { asArray, asRecord, graphRequest, graphUrl, isoFromEpoch, sendFailure, text } from "@/lib/inbox/channels/meta";
import type { ChannelAdapter, ChannelAttachment, ChannelEvent, ChannelMessageEvent } from "@/lib/inbox/channels/types";
import type { MessageType } from "@/lib/inbox/types";

const mediaTypes = new Set(["image", "video", "audio", "document", "sticker"]);

function messageContent(message: Record<string, unknown>): { type: MessageType; body?: string; attachments: ChannelAttachment[]; metadata?: Record<string, unknown> } {
  const type = text(message.type) ?? "unsupported";
  if (type === "text") return { type: "text", body: text(asRecord(message.text).body), attachments: [] };
  if (mediaTypes.has(type)) {
    const media = asRecord(message[type]);
    return {
      type: type as MessageType,
      body: text(media.caption),
      attachments: [{ external_media_id: text(media.id), mime_type: text(media.mime_type)?.split(";")[0], file_name: text(media.filename), sha256: text(media.sha256) }],
      metadata: media.voice ? { voice: true } : undefined,
    };
  }
  if (type === "location") {
    const location = asRecord(message.location);
    return { type: "location", body: [text(location.name), text(location.address), `${location.latitude}, ${location.longitude}`].filter(Boolean).join(" · "), attachments: [], metadata: { location } };
  }
  if (type === "contacts") {
    const names = asArray(message.contacts).map((contact) => text(asRecord(contact.name).formatted_name)).filter(Boolean);
    return { type: "contacts", body: names.length ? `Shared contact: ${names.join(", ")}` : "Shared a contact", attachments: [], metadata: { contacts: message.contacts } };
  }
  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    const reply = asRecord(interactive.button_reply ?? interactive.list_reply);
    return { type: "interactive", body: text(reply.title), attachments: [], metadata: { interactive } };
  }
  if (type === "button") return { type: "interactive", body: text(asRecord(message.button).text), attachments: [] };
  if (type === "reaction") {
    const reaction = asRecord(message.reaction);
    return { type: "reaction", body: text(reaction.emoji), attachments: [], metadata: { reacted_to: text(reaction.message_id) } };
  }
  if (type === "system") return { type: "system", body: text(asRecord(message.system).body), attachments: [] };
  return { type: "unsupported", body: "This message type is not supported in the CRM yet. Open WhatsApp to view it.", attachments: [], metadata: { original_type: type } };
}

function toEvent(message: Record<string, unknown>, base: Pick<ChannelMessageEvent, "account_external_id" | "account_identifier" | "account_display_name">, direction: "inbound" | "outbound", names: Map<string, string>): ChannelMessageEvent | null {
  const id = text(message.id);
  const customer = direction === "inbound" ? text(message.from) : text(message.to);
  if (!id || !customer) return null;
  const content = messageContent(message);
  return {
    kind: "message", channel: "whatsapp", direction, ...base,
    customer_external_id: customer, customer_phone: `+${customer}`, customer_name: names.get(customer),
    external_message_id: id, message_type: content.type, body: content.body,
    occurred_at: isoFromEpoch(message.timestamp, "s"), reply_to_external_id: text(asRecord(message.context).id),
    metadata: { ...content.metadata, ...(direction === "outbound" ? { source: "whatsapp_business_app" } : {}) },
    attachments: content.attachments.filter((attachment) => attachment.external_media_id),
  };
}

export function parseWhatsAppWebhook(payload: unknown): ChannelEvent[] {
  const events: ChannelEvent[] = [];
  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(entry.changes)) {
      const value = asRecord(change.value);
      const metadata = asRecord(value.metadata);
      const accountId = text(metadata.phone_number_id);
      if (!accountId) continue;
      const displayNumber = text(metadata.display_phone_number);
      const base = { account_external_id: accountId, account_identifier: displayNumber ? `+${displayNumber.replace(/\D/g, "")}` : undefined, account_display_name: displayNumber ? `WhatsApp ${displayNumber}` : undefined };
      const names = new Map(asArray(value.contacts).map((contact) => [text(contact.wa_id) ?? "", text(asRecord(contact.profile).name) ?? ""] as const).filter(([id, name]) => id && name));

      for (const message of asArray(value.messages)) {
        const event = toEvent(message, base, "inbound", names);
        if (event) events.push(event);
      }
      // Coexistence: messages an employee sends from the WhatsApp Business app on the phone.
      for (const echo of asArray(value.message_echoes)) {
        const event = toEvent(echo, base, "outbound", names);
        if (event) events.push(event);
      }
      for (const status of asArray(value.statuses)) {
        const id = text(status.id);
        const state = text(status.status);
        if (!id || !state || !["sent", "delivered", "read", "failed"].includes(state)) continue;
        const error = asArray(status.errors)[0];
        events.push({
          kind: "status", channel: "whatsapp", account_external_id: accountId, external_message_id: id,
          status: state as "sent" | "delivered" | "read" | "failed", occurred_at: isoFromEpoch(status.timestamp, "s"),
          error_code: error ? text(error.code) : undefined,
          error_message: error ? text(asRecord(error.error_data).details) ?? text(error.message) ?? text(error.title) : undefined,
        });
      }
    }
  }
  return events;
}

function mediaKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export const whatsappAdapter: ChannelAdapter = {
  kind: "whatsapp",
  webhookObject: "whatsapp_business_account",
  missingEnv: () => ["META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN"].filter((name) => !process.env[name]),
  parseWebhook: parseWhatsAppWebhook,

  async sendText({ accountExternalId, to, text: body, replyToExternalId }) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return { ok: false, code: "not_configured", message: "WhatsApp is not connected yet. Add WHATSAPP_ACCESS_TOKEN on the server." };
    const result = await graphRequest<{ messages?: { id?: string }[] }>(graphUrl(`${accountExternalId}/messages`), token, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body }, ...(replyToExternalId ? { context: { message_id: replyToExternalId } } : {}) }),
    });
    if (!result.ok) return sendFailure(result);
    const id = result.data.messages?.[0]?.id;
    return id ? { ok: true, externalMessageId: id } : { ok: false, message: "WhatsApp accepted the request but returned no message id." };
  },

  async sendMedia({ accountExternalId, to, bytes, mimeType, fileName, caption }) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return { ok: false, code: "not_configured", message: "WhatsApp is not connected yet. Add WHATSAPP_ACCESS_TOKEN on the server." };
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", mimeType);
    form.set("file", new Blob([bytes as BlobPart], { type: mimeType }), fileName);
    const uploaded = await graphRequest<{ id?: string }>(graphUrl(`${accountExternalId}/media`), token, { method: "POST", body: form });
    if (!uploaded.ok) return sendFailure(uploaded);
    if (!uploaded.data.id) return { ok: false, message: "WhatsApp did not return a media id." };
    const kind = mediaKind(mimeType);
    const media: Record<string, unknown> = { id: uploaded.data.id };
    if (caption && kind !== "audio") media.caption = caption;
    if (kind === "document") media.filename = fileName;
    const result = await graphRequest<{ messages?: { id?: string }[] }>(graphUrl(`${accountExternalId}/messages`), token, {
      method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: kind, [kind]: media }),
    });
    if (!result.ok) return sendFailure(result);
    const id = result.data.messages?.[0]?.id;
    return id ? { ok: true, externalMessageId: id } : { ok: false, message: "WhatsApp accepted the request but returned no message id." };
  },

  // Media URLs from Meta expire within minutes, so the file is copied into private storage on arrival.
  async downloadMedia(attachment) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token || !attachment.external_media_id) return null;
    const lookup = await graphRequest<{ url?: string; mime_type?: string }>(graphUrl(attachment.external_media_id), token);
    if (!lookup.ok || !lookup.data.url) return null;
    const response = await fetch(lookup.data.url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return null;
    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: (lookup.data.mime_type ?? attachment.mime_type ?? "application/octet-stream").split(";")[0] };
  },
};
