import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createMigratedDatabase, queryAs, type Actor } from "./helpers/supabase-pglite";

// Executes every migration against a real Postgres engine and exercises the
// inbox rules end to end. All people and numbers below are fictional.
const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  rep: "00000000-0000-4000-8000-000000000003",
  outsider: "00000000-0000-4000-8000-000000000004",
};
const service: Actor = { role: "service_role" };
const as = (id: string): Actor => ({ role: "authenticated", id });

let db: PGlite;
let contactId: string;
let leadId: string;

function inbound(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    channel: "whatsapp", account_external_id: "PN-1", account_display_name: "WWT Sales", account_identifier: "+9611000000",
    customer_external_id: "9613555001", customer_phone: "9613555001", customer_name: "Test Customer",
    external_message_id: "wamid.A1", message_type: "text", body: "Hello, I need a treatment plant", occurred_at: "2026-10-01T09:00:00Z",
    ...overrides,
  });
}

async function ingest(overrides: Record<string, unknown> = {}) {
  const rows = await queryAs<{ result: Record<string, unknown> }>(db, service, "select public.ingest_channel_message($1::jsonb) as result", [inbound(overrides)]);
  return rows[0].result;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.exec(`
    insert into auth.users(id, email, raw_user_meta_data) values
      ('${ids.admin}', 'admin@wwt.test', '{"full_name":"Admin User"}'),
      ('${ids.manager}', 'manager@wwt.test', '{"full_name":"Manager User"}'),
      ('${ids.rep}', 'rep@wwt.test', '{"full_name":"Rep User"}'),
      ('${ids.outsider}', 'outsider@wwt.test', '{"full_name":"Outside Rep"}');
    update public.profiles set role = 'admin' where id = '${ids.admin}';
    update public.profiles set role = 'sales_manager' where id = '${ids.manager}';
    update public.profiles set manager_id = '${ids.manager}' where id = '${ids.rep}';
  `);
  const created = await queryAs<{ result: { contact_id: string; lead_id: string } }>(db, as(ids.rep),
    "select public.create_lead_with_contact($1::jsonb, $2::uuid) as result",
    [JSON.stringify({ full_name: "Test Customer", phone: "03 555 001", source: "manual", customer_need: "Compact plant", status: "new", priority: "medium", assigned_to: ids.rep, received_at: "2026-09-01T08:00:00Z", slug: "test-customer" }), ids.rep]);
  contactId = created[0].result.contact_id;
  leadId = created[0].result.lead_id;
}, 60000);

describe("Phase 3 inbox database behaviour", () => {
  it("applies every migration and seeds the channel catalogue with TikTok disabled", async () => {
    const channels = await db.query<{ kind: string; is_enabled: boolean }>("select kind, is_enabled from public.communication_channels order by kind");
    expect(channels.rows.map((row) => row.kind)).toEqual(["whatsapp", "instagram", "messenger", "tiktok"]);
    expect(channels.rows.find((row) => row.kind === "tiktok")?.is_enabled).toBe(false);
  });

  it("matches an inbound WhatsApp message to the existing contact and open lead by normalized phone", async () => {
    const result = await ingest();
    expect(result).toMatchObject({ duplicate: false, new_conversation: true, contact_id: contactId, lead_id: leadId, lead_created: false });
    const conversation = await db.query<Record<string, unknown>>("select assigned_to, contact_id, last_message_preview, last_inbound_at from public.conversations where id = $1", [result.conversation_id]);
    expect(conversation.rows[0]).toMatchObject({ assigned_to: ids.rep, contact_id: contactId, last_message_preview: "Hello, I need a treatment plant" });
    const contacts = await db.query<{ count: number }>("select count(*)::int as count from public.contacts");
    expect(contacts.rows[0].count).toBe(1);
  });

  it("updates last contact and writes one timeline entry for the conversation session", async () => {
    await ingest({ external_message_id: "wamid.A2", body: "Are you there?", occurred_at: "2026-10-01T09:05:00Z" });
    const lead = await db.query<{ last_contacted_at: Date }>("select last_contacted_at from public.leads where id = $1", [leadId]);
    expect(new Date(lead.rows[0].last_contacted_at).toISOString()).toBe("2026-10-01T09:05:00.000Z");
    const activities = await db.query<{ count: number }>("select count(*)::int as count from public.activities where activity_type = 'whatsapp' and lead_id = $1", [leadId]);
    expect(activities.rows[0].count).toBe(1);
  });

  it("ignores a redelivered provider message", async () => {
    const result = await ingest();
    expect(result.duplicate).toBe(true);
    const messages = await db.query<{ count: number }>("select count(*)::int as count from public.messages where external_message_id = 'wamid.A1'");
    expect(messages.rows[0].count).toBe(1);
  });

  it("keeps an unknown sender unassigned without creating a contact or lead", async () => {
    const result = await ingest({ customer_external_id: "9613555002", customer_phone: "9613555002", customer_name: "New Person", external_message_id: "wamid.B1" });
    expect(result).toMatchObject({ contact_id: null, lead_id: null, lead_created: false });
    const conversation = await db.query<{ assigned_to: string | null }>("select assigned_to from public.conversations where id = $1", [result.conversation_id]);
    expect(conversation.rows[0].assigned_to).toBeNull();
    const counts = await db.query<{ contacts: number; leads: number }>("select (select count(*)::int from public.contacts) as contacts, (select count(*)::int from public.leads) as leads");
    expect(counts.rows[0]).toEqual({ contacts: 1, leads: 1 });
  });

  it("scopes conversations by role: owner, team manager, admin and the manager-only unassigned queue", async () => {
    const visible = async (id: string) => (await queryAs<{ external_thread_id: string }>(db, as(id), "select external_thread_id from public.conversations_view order by external_thread_id")).map((row) => row.external_thread_id);
    expect(await visible(ids.rep)).toEqual(["9613555001"]);
    expect(await visible(ids.outsider)).toEqual([]);
    expect(await visible(ids.manager)).toEqual(["9613555001", "9613555002"]);
    expect(await visible(ids.admin)).toEqual(["9613555001", "9613555002"]);
    expect(await queryAs(db, as(ids.outsider), "select id from public.messages")).toEqual([]);
  });

  it("tracks unread state per employee", async () => {
    const before = await queryAs<{ is_unread: boolean }>(db, as(ids.rep), "select is_unread from public.conversations_view");
    expect(before[0].is_unread).toBe(true);
    await queryAs(db, as(ids.rep), "insert into public.conversation_reads(conversation_id, user_id, last_read_at) select id, $1::uuid, now() from public.conversations on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at", [ids.rep]);
    const after = await queryAs<{ is_unread: boolean }>(db, as(ids.rep), "select is_unread from public.conversations_view");
    expect(after[0].is_unread).toBe(false);
  });

  it("lets only managers and admins reassign, and records the history", async () => {
    await expect(queryAs(db, as(ids.rep), "update public.conversations set assigned_to = null where external_thread_id = '9613555001'")).rejects.toThrow(/administrator or sales manager/i);
    await queryAs(db, as(ids.manager), "update public.conversations set assigned_to = $1 where external_thread_id = '9613555002'", [ids.rep]);
    const history = await db.query<{ assigned_to: string; assigned_by: string }>("select a.assigned_to, a.assigned_by from public.conversation_assignments a join public.conversations c on c.id = a.conversation_id where c.external_thread_id = '9613555002'");
    expect(history.rows).toEqual([{ assigned_to: ids.rep, assigned_by: ids.manager }]);
    await expect(queryAs(db, as(ids.manager), "update public.conversations set assigned_to = $1 where external_thread_id = '9613555002'", [ids.outsider])).rejects.toThrow(/row-level security/i);
  });

  it("allows an employee to store an outbound message only in a conversation they can see", async () => {
    const insert = "insert into public.messages(conversation_id, channel, channel_account_id, direction, message_type, body, sender_profile_id, status) select id, channel, channel_account_id, 'outbound', 'text', 'On my way', $1::uuid, 'queued' from public.conversations where external_thread_id = '9613555001' returning id";
    const own = await queryAs<{ id: string }>(db, as(ids.rep), insert, [ids.rep]);
    expect(own).toHaveLength(1);
    await queryAs(db, as(ids.rep), "update public.messages set status = 'sent', external_message_id = 'wamid.OUT1', sent_at = now() where id = $1", [own[0].id]);
    await expect(queryAs(db, as(ids.rep), "update public.messages set body = 'edited' where id = $1", [own[0].id])).rejects.toThrow(/permission denied/i);
    expect(await queryAs(db, as(ids.outsider), insert, [ids.outsider])).toEqual([]);
    await expect(queryAs(db, as(ids.rep), "insert into public.messages(conversation_id, channel, channel_account_id, direction, body, sender_profile_id, status) select id, channel, channel_account_id, 'inbound', 'forged', $1::uuid, 'received' from public.conversations where external_thread_id = '9613555001'", [ids.rep])).rejects.toThrow(/row-level security/i);
  });

  it("only moves delivery status forward", async () => {
    const status = (value: string) => queryAs<{ changed: boolean }>(db, service, "select public.record_message_status($1::jsonb) as changed", [JSON.stringify({ channel: "whatsapp", account_external_id: "PN-1", external_message_id: "wamid.OUT1", status: value })]);
    expect((await status("read"))[0].changed).toBe(true);
    expect((await status("delivered"))[0].changed).toBe(false);
    expect((await status("failed"))[0].changed).toBe(false);
    const message = await db.query<{ status: string; delivered_at: Date | null }>("select status, delivered_at from public.messages where external_message_id = 'wamid.OUT1'");
    expect(message.rows[0].status).toBe("read");
    expect(message.rows[0].delivered_at).not.toBeNull();
  });

  it("restricts ingestion and raw webhook events to the service role", async () => {
    await expect(queryAs(db, as(ids.admin), "select public.ingest_channel_message($1::jsonb)", [inbound({ external_message_id: "wamid.X" })])).rejects.toThrow(/permission denied/i);
    await expect(queryAs(db, as(ids.admin), "select id from public.webhook_events")).rejects.toThrow(/permission denied/i);
    await expect(queryAs(db, { role: "anon" }, "select id from public.conversations")).rejects.toThrow(/permission denied/i);
  });

  it("links an unmatched conversation to a contact and reuses that identity afterwards", async () => {
    const conversation = await db.query<{ id: string }>("select id from public.conversations where external_thread_id = '9613555002'");
    await queryAs(db, as(ids.rep), "select public.link_conversation($1::uuid, $2::uuid, $3::uuid)", [conversation.rows[0].id, contactId, leadId]);
    const linked = await db.query<{ contact_id: string; lead_id: string }>("select contact_id, lead_id from public.conversations where id = $1", [conversation.rows[0].id]);
    expect(linked.rows[0]).toEqual({ contact_id: contactId, lead_id: leadId });
    const match = await queryAs<{ match: string }>(db, service, "select public.match_contact_for_identity('whatsapp', '9613555002', null, null) as match");
    expect(match[0].match).toBe(contactId);
    await expect(queryAs(db, as(ids.outsider), "select public.link_conversation($1::uuid, $2::uuid, null)", [conversation.rows[0].id, contactId])).rejects.toThrow(/not accessible/i);
  });

  it("creates a lead automatically only when the account opts in, and never duplicates it", async () => {
    await db.query("update public.channel_accounts set auto_create_leads = true, default_assignee_id = $1 where external_account_id = 'PN-1'", [ids.rep]);
    const first = await ingest({ customer_external_id: "9613555003", customer_phone: "9613555003", customer_name: "Auto Lead", external_message_id: "wamid.C1" });
    expect(first.lead_created).toBe(true);
    const second = await ingest({ customer_external_id: "9613555003", customer_phone: "9613555003", customer_name: "Auto Lead", external_message_id: "wamid.C2", occurred_at: "2026-10-01T10:00:00Z" });
    expect(second).toMatchObject({ lead_created: false, lead_id: first.lead_id, contact_id: first.contact_id });
    const lead = await db.query<{ source: string; assigned_to: string; receiving_whatsapp_number: string }>("select source, assigned_to, receiving_whatsapp_number from public.leads where id = $1", [first.lead_id]);
    expect(lead.rows[0]).toEqual({ source: "whatsapp", assigned_to: ids.rep, receiving_whatsapp_number: "+9611000000" });
    const audit = await db.query<{ count: number }>("select count(*)::int as count from public.activities where activity_type = 'lead_created' and lead_id = $1", [first.lead_id]);
    expect(audit.rows[0].count).toBe(1);
  });
});
