import { after, NextResponse, type NextRequest } from "next/server";
import { getAdapterForWebhookObject } from "@/lib/inbox/channels";
import { verifyMetaSignature } from "@/lib/inbox/channels/meta";
import { processChannelEvents, storeInboundMedia } from "@/lib/inbox/ingest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// One callback URL for every Meta product (WhatsApp, Messenger, Instagram).
// The request is authenticated by Meta's signature, not by a CRM session.
export const maxDuration = 60;

/** Subscription handshake: Meta calls this once when the callback URL is saved. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ message: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const secrets = [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET];
  if (!secrets.some(Boolean) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ message: "Channel webhooks are not configured." }, { status: 503 });
  }

  // The signature covers the exact bytes Meta sent, so verify before parsing anything.
  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), secrets)) {
    return NextResponse.json({ message: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ message: "Invalid payload." }, { status: 400 }); }

  const admin = createSupabaseAdminClient();
  const objectType = typeof (payload as { object?: unknown })?.object === "string" ? (payload as { object: string }).object : null;
  const logged = await admin.from("webhook_events").insert({ provider: "meta", object_type: objectType, payload }).select("id").single();
  const eventId = logged.data?.id as string | undefined;
  const finish = async (status: "processed" | "ignored" | "failed", error?: string) => {
    if (eventId) await admin.from("webhook_events").update({ status, error: error ?? null, processed_at: new Date().toISOString() }).eq("id", eventId);
  };

  const adapter = getAdapterForWebhookObject(objectType);
  if (!adapter) { await finish("ignored", "No adapter for this webhook object."); return NextResponse.json({ ok: true }); }

  const channel = await admin.from("communication_channels").select("is_enabled").eq("kind", adapter.kind).maybeSingle();
  if (!channel.data?.is_enabled) { await finish("ignored", "Channel is disabled."); return NextResponse.json({ ok: true }); }

  try {
    const events = adapter.parseWebhook(payload);
    const result = await processChannelEvents(admin, adapter, events);
    await finish(events.length ? "processed" : "ignored");
    if (result.mediaJobs.length) after(() => storeInboundMedia(admin, adapter, result.mediaJobs));
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Message content is never logged. A non-200 makes Meta retry; ingestion is idempotent.
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error("Channel webhook processing failed", { eventId, channel: adapter.kind, reason });
    await finish("failed", reason);
    return NextResponse.json({ message: "Processing failed." }, { status: 500 });
  }
}
