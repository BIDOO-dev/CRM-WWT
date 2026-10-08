import { createHmac, timingSafeEqual } from "node:crypto";
import type { SendResult } from "@/lib/inbox/channels/types";

export function graphVersion() {
  return process.env.META_GRAPH_API_VERSION || "v23.0";
}

export function graphUrl(path: string, host = "graph.facebook.com") {
  return `https://${host}/${graphVersion()}/${path.replace(/^\//, "")}`;
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the exact raw request body.
 * Returns false for a missing header, missing secret or any mismatch.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecrets: Array<string | undefined>) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = Buffer.from(signatureHeader.slice(7), "hex");
  if (provided.length !== 32) return false;
  return appSecrets.filter((secret): secret is string => Boolean(secret)).some((secret) => {
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    return timingSafeEqual(expected, provided);
  });
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } } };

export async function graphRequest<T>(url: string, token: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; code?: string; message: string }> {
  try {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers }, cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as T & GraphError;
    if (!response.ok || data.error) {
      const error = data.error;
      return { ok: false, code: error?.code ? String(error.code) : String(response.status), message: error?.error_data?.details || error?.message || `Meta API request failed (${response.status}).` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, code: "network", message: "Meta could not be reached. Check the connection and try again." };
  }
}

export function sendFailure(result: { code?: string; message: string }): SendResult {
  return { ok: false, code: result.code, message: result.message };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function text(value: unknown) {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : undefined;
}

/** Meta sends WhatsApp timestamps in seconds and Messenger/Instagram timestamps in milliseconds. */
export function isoFromEpoch(value: unknown, unit: "s" | "ms") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString();
  return new Date(unit === "s" ? numeric * 1000 : numeric).toISOString();
}
