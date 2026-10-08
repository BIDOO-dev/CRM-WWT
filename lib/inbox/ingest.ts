import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelAdapter, ChannelAttachment, ChannelEvent } from "@/lib/inbox/channels/types";

export type MediaJob = { attachmentId: string; conversationId: string; attachment: ChannelAttachment };

const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "audio/aac": "aac", "audio/amr": "amr", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf", "text/plain": "txt",
};

export function safeFileName(value: string) {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, "-").slice(0, 120) || "file";
}

/**
 * Stores normalized channel events with the service-role client. Each message goes
 * through one transactional RPC that de-duplicates, matches the CRM contact and
 * lead, and assigns an owner. Returns the media that still has to be copied.
 */
export async function processChannelEvents(admin: SupabaseClient, adapter: ChannelAdapter, events: ChannelEvent[]) {
  const mediaJobs: MediaJob[] = [];
  let stored = 0;
  let duplicates = 0;

  for (const event of events) {
    if (event.kind === "status") {
      const { kind, ...payload } = event;
      void kind;
      const { error } = await admin.rpc("record_message_status", { payload });
      if (error) throw new Error(`Status update failed: ${error.message}`);
      continue;
    }

    const { kind, ...payload } = event;
    void kind;
    if (!payload.customer_name && payload.direction === "inbound" && adapter.resolveCustomerName) {
      const known = await admin.from("conversations").select("display_name").eq("channel", payload.channel).eq("external_thread_id", payload.customer_external_id).limit(1).maybeSingle();
      payload.customer_name = known.data?.display_name ?? (await adapter.resolveCustomerName(payload.customer_external_id)) ?? undefined;
    }

    const { data, error } = await admin.rpc("ingest_channel_message", { payload });
    if (error) throw new Error(`Message ingestion failed: ${error.message}`);
    const result = data as { duplicate?: boolean; conversation_id?: string; attachments?: Array<{ id: string } & ChannelAttachment> } | null;
    if (result?.duplicate) { duplicates += 1; continue; }
    stored += 1;
    for (const attachment of result?.attachments ?? []) {
      if (result?.conversation_id) mediaJobs.push({ attachmentId: attachment.id, conversationId: result.conversation_id, attachment });
    }
  }
  return { stored, duplicates, mediaJobs };
}

/** Copies provider media into the private inbox bucket. Failures are recorded, never thrown. */
export async function storeInboundMedia(admin: SupabaseClient, adapter: ChannelAdapter, jobs: MediaJob[]) {
  for (const job of jobs) {
    try {
      const media = adapter.downloadMedia ? await adapter.downloadMedia(job.attachment) : null;
      if (!media || !media.bytes.byteLength) throw new Error("Media could not be downloaded.");
      const name = safeFileName(job.attachment.file_name || `attachment.${extensions[media.mimeType] ?? "bin"}`);
      const storagePath = `${job.conversationId}/${job.attachmentId}-${name}`;
      const uploaded = await admin.storage.from("inbox-media").upload(storagePath, media.bytes, { contentType: media.mimeType, upsert: true });
      if (uploaded.error) throw new Error(uploaded.error.message);
      await admin.from("message_attachments").update({ storage_path: storagePath, mime_type: media.mimeType, file_name: job.attachment.file_name || name, size_bytes: media.bytes.byteLength, media_status: "stored" }).eq("id", job.attachmentId);
    } catch (error) {
      console.error("Inbox media copy failed", { attachmentId: job.attachmentId, reason: error instanceof Error ? error.message : "unknown" });
      await admin.from("message_attachments").update({ media_status: "failed" }).eq("id", job.attachmentId);
    }
  }
}
