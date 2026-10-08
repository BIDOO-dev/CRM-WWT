import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20261008121000_phase3_unified_inbox.sql"), "utf8").toLowerCase();
const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Phase 3 inbox architecture", () => {
  it.each(["communication_channels", "channel_accounts", "conversations", "conversation_participants", "messages", "message_attachments", "conversation_assignments", "conversation_notes", "conversation_reads", "conversation_ai_insights", "webhook_events"])("creates and enables RLS for %s", (table) => {
    expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it("is additive and leaves existing CRM tables intact", () => {
    expect(migration).not.toMatch(/drop table|drop column|rename column|rename to/);
    expect(migration).not.toMatch(/alter table public\.(contacts|leads|tasks|profiles|quotations|site_visits|tenders) /);
  });

  it("de-duplicates provider messages and keeps ingestion on the service role", () => {
    expect(migration).toContain("create unique index if not exists messages_external_unique_idx");
    expect(migration).toContain("channel ingestion is restricted to the service role");
    expect(migration).toContain("grant execute on function public.ingest_channel_message(jsonb), public.record_message_status(jsonb)");
    expect(migration).toContain("to service_role;");
  });

  it("keeps conversation media private", () => {
    expect(migration).toContain("values ('inbox-media', 'inbox-media', false");
    expect(migration).toContain("create policy inbox_media_select");
  });

  it("uses the service-role key only in server-only modules and never in client code", () => {
    expect(read("lib/supabase/admin.ts")).toContain('import "server-only"');
    const users = ["app/api/webhooks/meta/route.ts"];
    for (const file of ["components/inbox/inbox-workspace.tsx", "components/inbox/crm-panel.tsx", "components/settings/channel-settings.tsx", "app/actions/inbox.ts", "lib/inbox/data.ts", "lib/supabase/client.ts"]) {
      expect(read(file), file).not.toMatch(/SERVICE_ROLE|supabase\/admin|ACCESS_TOKEN["'`]?\]? *=|META_APP_SECRET/);
    }
    users.forEach((file) => expect(read(file)).toContain("verifyMetaSignature"));
    expect(read(".env.example")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|TOKEN|SERVICE_ROLE)/);
  });

  it("verifies the webhook signature before parsing or storing anything", () => {
    const route = read("app/api/webhooks/meta/route.ts");
    expect(route.indexOf("verifyMetaSignature(rawBody")).toBeGreaterThan(0);
    expect(route.indexOf("verifyMetaSignature(rawBody")).toBeLessThan(route.indexOf("JSON.parse(rawBody)"));
    expect(route.indexOf("verifyMetaSignature(rawBody")).toBeLessThan(route.indexOf("createSupabaseAdminClient()"));
  });

  it("lets channel webhooks through the session proxy and adds the Inbox route", () => {
    expect(read("lib/supabase/proxy.ts")).toContain('startsWith("/api/webhooks/")');
    expect(existsSync(resolve("app/(crm)/inbox/page.tsx"))).toBe(true);
    expect(read("components/app-shell.tsx")).toContain('{ label: "Inbox", href: "/inbox"');
  });

  it("never sends an AI draft: the AI module has no access to channel adapters", () => {
    expect(read("lib/inbox/ai.ts")).not.toMatch(/channels|sendText|sendMedia/);
  });
});
