import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAdapterForWebhookObject, getChannelAdapter } from "@/lib/inbox/channels";
import { verifyMetaSignature } from "@/lib/inbox/channels/meta";
import { parseMessagingWebhook } from "@/lib/inbox/channels/messenger";
import { parseWhatsAppWebhook } from "@/lib/inbox/channels/whatsapp";
import { replyWindow } from "@/lib/inbox/window";

// Payload shapes follow Meta's published webhook formats. All identifiers are fictional.
const value = (extra: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "961 1 000 000", phone_number_id: "PN-1" }, ...extra } }] }],
});

describe("Meta webhook signature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts only a signature made with a configured app secret over the raw body", () => {
    expect(verifyMetaSignature(body, sign("secret"), ["secret"])).toBe(true);
    expect(verifyMetaSignature(body, sign("secret"), [undefined, "secret"])).toBe(true);
    expect(verifyMetaSignature(body, sign("other"), ["secret"])).toBe(false);
    expect(verifyMetaSignature(`${body} `, sign("secret"), ["secret"])).toBe(false);
  });

  it("rejects missing, malformed or unconfigured signatures", () => {
    expect(verifyMetaSignature(body, null, ["secret"])).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", ["secret"])).toBe(false);
    expect(verifyMetaSignature(body, sign("secret").replace("sha256=", "sha1="), ["secret"])).toBe(false);
    expect(verifyMetaSignature(body, sign("secret"), [undefined])).toBe(false);
  });
});

describe("WhatsApp webhook parsing", () => {
  it("normalizes an inbound text message with the sender's profile name", () => {
    const events = parseWhatsAppWebhook(value({ contacts: [{ wa_id: "9613555001", profile: { name: "Test Customer" } }], messages: [{ from: "9613555001", id: "wamid.1", timestamp: "1790000000", type: "text", text: { body: "Hello" }, context: { id: "wamid.0" } }] }));
    expect(events).toEqual([expect.objectContaining({ kind: "message", channel: "whatsapp", direction: "inbound", account_external_id: "PN-1", account_identifier: "+9611000000", customer_external_id: "9613555001", customer_phone: "+9613555001", customer_name: "Test Customer", external_message_id: "wamid.1", message_type: "text", body: "Hello", reply_to_external_id: "wamid.0", occurred_at: new Date(1790000000000).toISOString(), attachments: [] })]);
  });

  it("captures media ids, captions and file names for later download", () => {
    const [image, document] = parseWhatsAppWebhook(value({ messages: [
      { from: "9613555001", id: "wamid.2", timestamp: "1790000001", type: "image", image: { id: "MEDIA-1", mime_type: "image/jpeg", sha256: "abc", caption: "Site photo" } },
      { from: "9613555001", id: "wamid.3", timestamp: "1790000002", type: "document", document: { id: "MEDIA-2", mime_type: "application/pdf", filename: "plans.pdf" } },
    ] }));
    expect(image).toMatchObject({ message_type: "image", body: "Site photo", attachments: [{ external_media_id: "MEDIA-1", mime_type: "image/jpeg", sha256: "abc" }] });
    expect(document).toMatchObject({ message_type: "document", attachments: [{ external_media_id: "MEDIA-2", file_name: "plans.pdf" }] });
  });

  it("keeps unknown message types visible instead of dropping them", () => {
    const [event] = parseWhatsAppWebhook(value({ messages: [{ from: "9613555001", id: "wamid.4", timestamp: "1790000003", type: "order" }] }));
    expect(event).toMatchObject({ message_type: "unsupported", metadata: { original_type: "order" } });
  });

  it("maps delivery receipts and failures", () => {
    const events = parseWhatsAppWebhook(value({ statuses: [
      { id: "wamid.9", status: "delivered", timestamp: "1790000010", recipient_id: "9613555001" },
      { id: "wamid.9", status: "failed", timestamp: "1790000011", errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours have passed" } }] },
      { id: "wamid.9", status: "deleted", timestamp: "1790000012" },
    ] }));
    expect(events).toEqual([
      expect.objectContaining({ kind: "status", status: "delivered", external_message_id: "wamid.9", account_external_id: "PN-1" }),
      expect.objectContaining({ kind: "status", status: "failed", error_code: "131047", error_message: "More than 24 hours have passed" }),
    ]);
  });

  it("records messages sent from the WhatsApp Business app as outbound (coexistence)", () => {
    const [event] = parseWhatsAppWebhook(value({ message_echoes: [{ from: "9611000000", to: "9613555001", id: "wamid.5", timestamp: "1790000020", type: "text", text: { body: "Sent from the phone" } }] }));
    expect(event).toMatchObject({ direction: "outbound", customer_external_id: "9613555001", body: "Sent from the phone", metadata: { source: "whatsapp_business_app" } });
  });

  it("ignores payloads without a phone number id", () => {
    expect(parseWhatsAppWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from: "1", id: "x", type: "text" }] } }] }] })).toEqual([]);
    expect(parseWhatsAppWebhook(null)).toEqual([]);
  });
});

describe("Messenger and Instagram webhook parsing", () => {
  it("normalizes inbound messages, echoes and delivery receipts", () => {
    const events = parseMessagingWebhook("messenger", { object: "page", entry: [{ id: "PAGE-1", messaging: [
      { sender: { id: "PSID-1" }, recipient: { id: "PAGE-1" }, timestamp: 1790000000000, message: { mid: "m_1", text: "Hi" } },
      { sender: { id: "PAGE-1" }, recipient: { id: "PSID-1" }, timestamp: 1790000001000, message: { mid: "m_2", text: "Hello", is_echo: true } },
      { sender: { id: "PSID-1" }, recipient: { id: "PAGE-1" }, timestamp: 1790000002000, delivery: { mids: ["m_2"], watermark: 1790000002000 } },
      { sender: { id: "PSID-1" }, recipient: { id: "PAGE-1" }, timestamp: 1790000003000, message: { mid: "m_3", attachments: [{ type: "image", payload: { url: "https://scontent.xx.fbcdn.net/a.jpg" } }] } },
    ] }] });
    expect(events[0]).toMatchObject({ channel: "messenger", direction: "inbound", customer_external_id: "PSID-1", account_external_id: "PAGE-1", body: "Hi" });
    expect(events[1]).toMatchObject({ direction: "outbound", customer_external_id: "PSID-1" });
    expect(events[2]).toMatchObject({ kind: "status", status: "delivered", external_message_id: "m_2" });
    expect(events[3]).toMatchObject({ message_type: "image", attachments: [{ external_url: "https://scontent.xx.fbcdn.net/a.jpg" }] });
  });
});

describe("channel registry", () => {
  it("routes Meta webhook objects to their adapters and has no TikTok adapter", () => {
    expect(getAdapterForWebhookObject("whatsapp_business_account")?.kind).toBe("whatsapp");
    expect(getAdapterForWebhookObject("page")?.kind).toBe("messenger");
    expect(getAdapterForWebhookObject("instagram")?.kind).toBe("instagram");
    expect(getAdapterForWebhookObject("unknown")).toBeNull();
    expect(getChannelAdapter("tiktok")).toBeNull();
  });
});

describe("reply window", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("is open within 24 hours of the customer's last message and closed afterwards", () => {
    expect(replyWindow("whatsapp", "2026-10-02T09:00:00Z", now)).toEqual({ open: true, expiresAt: "2026-10-03T09:00:00.000Z" });
    expect(replyWindow("whatsapp", "2026-10-01T11:59:00Z", now).open).toBe(false);
    expect(replyWindow("whatsapp", null, now).open).toBe(false);
    expect(replyWindow("tiktok", "2026-10-02T09:00:00Z", now).open).toBe(false);
  });
});
