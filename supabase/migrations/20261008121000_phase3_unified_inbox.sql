-- WWT CRM Phase 3A unified inbox.
-- Adds omnichannel conversations, messages, assignment history, internal notes,
-- private media storage and the service-role ingestion RPCs used by channel webhooks.
-- Purely additive: no existing table, column or policy is dropped or renamed.

do $$ begin
  create type public.channel_kind as enum ('whatsapp', 'instagram', 'messenger', 'tiktok');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversation_status as enum ('open', 'pending', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_status as enum ('received', 'queued', 'sent', 'delivered', 'read', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_type as enum ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts', 'interactive', 'template', 'reaction', 'system', 'unsupported');
exception when duplicate_object then null; end $$;

-- Webhook writes have no signed-in user. Restore the Phase 1 actor fallback so
-- service-role lead/task writes still produce a valid audit row.
create or replace function public.audit_crm_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare actor uuid := coalesce(auth.uid(), new.created_by, new.assigned_to);
begin
  if tg_table_name = 'leads' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, user_id)
    values ('lead_created', 'Lead created', new.customer_need || ' was added to the CRM.', new.contact_id, new.id, actor);
  elsif tg_table_name = 'leads' and tg_op = 'UPDATE' then
    if old.assigned_to is distinct from new.assigned_to then
      insert into public.activities(activity_type, subject, description, contact_id, lead_id, user_id, metadata)
      values ('lead_assigned', 'Lead assigned', 'Lead assignment changed.', new.contact_id, new.id, actor, jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
    end if;
    if old.status is distinct from new.status then
      insert into public.activities(activity_type, subject, description, contact_id, lead_id, user_id, metadata)
      values ('stage_change', 'Lead stage changed', 'Stage changed from ' || old.status || ' to ' || new.status || '.', new.contact_id, new.id, actor, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if old.customer_need is distinct from new.customer_need then
      insert into public.activities(activity_type, subject, description, contact_id, lead_id, user_id)
      values ('note', 'Customer need updated', new.customer_need, new.contact_id, new.id, actor);
    end if;
  elsif tg_table_name = 'opportunities' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, company_id, contact_id, opportunity_id, user_id)
    values ('system', 'Legacy opportunity created', new.name || ' entered the legacy opportunity archive.', new.company_id, new.primary_contact_id, new.id, actor);
  elsif tg_table_name = 'opportunities' and tg_op = 'UPDATE' and old.stage is distinct from new.stage then
    insert into public.activities(activity_type, subject, description, company_id, contact_id, opportunity_id, user_id, metadata)
    values ('stage_change', 'Legacy opportunity stage changed', 'Stage changed from ' || old.stage || ' to ' || new.stage || '.', new.company_id, new.primary_contact_id, new.id, actor, jsonb_build_object('from', old.stage, 'to', new.stage));
  elsif tg_table_name = 'tasks' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, company_id, contact_id, lead_id, opportunity_id, user_id)
    values ('task_created', 'Task created', new.title, new.company_id, new.contact_id, new.lead_id, new.opportunity_id, actor);
  elsif tg_table_name = 'tasks' and tg_op = 'UPDATE' and new.status = 'completed' and old.status <> 'completed' then
    insert into public.activities(activity_type, subject, description, company_id, contact_id, lead_id, opportunity_id, user_id)
    values ('task_completed', 'Task completed', new.title, new.company_id, new.contact_id, new.lead_id, new.opportunity_id, actor);
  end if;
  return new;
end;
$$;

create table if not exists public.communication_channels (
  kind public.channel_kind primary key,
  label text not null,
  is_enabled boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.communication_channels(kind, label, is_enabled, notes) values
  ('whatsapp', 'WhatsApp', true, 'WhatsApp Business Platform (Meta Cloud API).'),
  ('instagram', 'Instagram', false, 'Instagram Messaging API. Requires Meta App Review before enabling.'),
  ('messenger', 'Facebook Messenger', false, 'Messenger Platform. Requires Meta App Review before enabling.'),
  ('tiktok', 'TikTok', false, 'Reserved. No generally available direct-message API; no adapter is implemented.')
on conflict (kind) do nothing;

-- One row per connected WWT number, page or account. Credentials never live here;
-- access tokens stay in server-side environment variables.
create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  channel public.channel_kind not null references public.communication_channels(kind) on delete restrict,
  external_account_id text not null,
  display_name text not null,
  display_identifier text,
  is_active boolean not null default true,
  default_assignee_id uuid references public.profiles(id) on delete set null,
  auto_create_leads boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_account_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  channel public.channel_kind not null references public.communication_channels(kind) on delete restrict,
  channel_account_id uuid not null references public.channel_accounts(id) on delete restrict,
  external_thread_id text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.conversation_status not null default 'open',
  display_name text,
  external_handle text,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction public.message_direction,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_account_id, external_thread_id)
);

-- External identities taking part in a conversation. A participant linked to a
-- contact is the identity map that lets later social messages reuse that contact.
create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel public.channel_kind not null,
  external_id text not null,
  display_name text,
  phone text,
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  email text,
  profile_image_url text,
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, external_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel public.channel_kind not null,
  channel_account_id uuid not null references public.channel_accounts(id) on delete restrict,
  external_message_id text,
  direction public.message_direction not null,
  message_type public.message_type not null default 'text',
  body text,
  sender_external_id text,
  recipient_external_id text,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  status public.message_status not null,
  error_code text,
  error_message text,
  reply_to_external_id text,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_media_id text,
  external_url text,
  storage_path text unique,
  mime_type text,
  file_name text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  media_status text not null default 'pending' check (media_status in ('pending', 'stored', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- Internal notes are stored apart from messages so they can never be sent to a customer.
create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- AI output is stored as a draft/insight only. Nothing in this table is ever sent automatically.
create table if not exists public.conversation_ai_insights (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('summary', 'suggested_reply', 'requirements', 'intent', 'follow_up', 'next_action', 'qualification')),
  content jsonb not null,
  model text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Raw signed webhook deliveries, kept for replay and troubleshooting. Service role only.
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  object_type text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists messages_external_unique_idx on public.messages(channel_account_id, external_message_id) where external_message_id is not null;
create index if not exists messages_conversation_time_idx on public.messages(conversation_id, created_at);
create index if not exists messages_contact_idx on public.messages(contact_id, created_at desc) where contact_id is not null;
create index if not exists messages_lead_idx on public.messages(lead_id, created_at desc) where lead_id is not null;
create index if not exists conversations_assigned_idx on public.conversations(assigned_to, status, last_message_at desc);
create index if not exists conversations_unassigned_idx on public.conversations(last_message_at desc) where assigned_to is null;
create index if not exists conversations_last_message_idx on public.conversations(last_message_at desc nulls last);
create index if not exists conversations_contact_idx on public.conversations(contact_id) where contact_id is not null;
create index if not exists conversations_lead_idx on public.conversations(lead_id) where lead_id is not null;
create index if not exists conversation_participants_identity_idx on public.conversation_participants(channel, external_id);
create index if not exists conversation_participants_phone_idx on public.conversation_participants(phone_normalized) where phone_normalized is not null;
create index if not exists conversation_participants_contact_idx on public.conversation_participants(contact_id) where contact_id is not null;
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists message_attachments_conversation_idx on public.message_attachments(conversation_id, created_at desc);
create index if not exists conversation_assignments_conversation_idx on public.conversation_assignments(conversation_id, created_at desc);
create index if not exists conversation_notes_conversation_idx on public.conversation_notes(conversation_id, created_at);
create index if not exists conversation_ai_insights_conversation_idx on public.conversation_ai_insights(conversation_id, kind, created_at desc);
create index if not exists webhook_events_received_idx on public.webhook_events(received_at desc);
create index if not exists contacts_email_lower_idx on public.contacts(lower(email)) where email is not null;

drop trigger if exists channel_accounts_updated on public.channel_accounts;
create trigger channel_accounts_updated before update on public.channel_accounts for each row execute function public.set_updated_at();
drop trigger if exists conversations_updated on public.conversations;
create trigger conversations_updated before update on public.conversations for each row execute function public.set_updated_at();
drop trigger if exists conversation_participants_updated on public.conversation_participants;
create trigger conversation_participants_updated before update on public.conversation_participants for each row execute function public.set_updated_at();
drop trigger if exists communication_channels_updated on public.communication_channels;
create trigger communication_channels_updated before update on public.communication_channels for each row execute function public.set_updated_at();

-- Visibility: administrators see everything; the unassigned queue is limited to
-- administrators and sales managers; everyone else needs ownership of the
-- conversation or of its linked contact/lead under the existing CRM scope.
create or replace function private.can_access_conversation(assignee uuid, linked_contact uuid, linked_lead uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select private.current_role() = 'admin'
    or (assignee is null and private.current_role() = 'sales_manager')
    or (assignee is not null and private.can_view_owner(assignee))
    or (linked_contact is not null and private.can_view_contact(linked_contact))
    or (linked_lead is not null and exists(select 1 from public.leads l where l.id = linked_lead and private.can_view_owner(l.assigned_to)));
$$;

create or replace function private.can_view_conversation(target uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target and private.can_access_conversation(c.assigned_to, c.contact_id, c.lead_id)
  );
$$;

create or replace function private.can_access_inbox_media_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog
as $$
declare raw_id text := split_part(object_name, '/', 1);
begin
  if raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  return private.can_view_conversation(raw_id::uuid);
exception when others then return false;
end;
$$;

revoke all on function private.can_access_conversation(uuid, uuid, uuid), private.can_view_conversation(uuid), private.can_access_inbox_media_path(text) from public;
grant execute on function private.can_access_conversation(uuid, uuid, uuid), private.can_view_conversation(uuid), private.can_access_inbox_media_path(text) to authenticated, service_role;

alter table public.communication_channels enable row level security;
alter table public.channel_accounts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.conversation_assignments enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.conversation_ai_insights enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists communication_channels_select on public.communication_channels;
create policy communication_channels_select on public.communication_channels for select to authenticated using (private.is_active_user());
drop policy if exists communication_channels_update on public.communication_channels;
create policy communication_channels_update on public.communication_channels for update to authenticated using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

drop policy if exists channel_accounts_select on public.channel_accounts;
create policy channel_accounts_select on public.channel_accounts for select to authenticated using (private.is_active_user());
drop policy if exists channel_accounts_insert on public.channel_accounts;
create policy channel_accounts_insert on public.channel_accounts for insert to authenticated with check (private.current_role() = 'admin' and created_by = auth.uid());
drop policy if exists channel_accounts_update on public.channel_accounts;
create policy channel_accounts_update on public.channel_accounts for update to authenticated using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated using (private.can_access_conversation(assigned_to, contact_id, lead_id));
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update to authenticated
  using (private.can_access_conversation(assigned_to, contact_id, lead_id))
  with check (private.can_access_conversation(assigned_to, contact_id, lead_id));

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants for select to authenticated using (private.can_view_conversation(conversation_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (private.can_view_conversation(conversation_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (
  private.is_active_user() and direction = 'outbound' and sender_profile_id = auth.uid() and private.can_view_conversation(conversation_id)
);
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (direction = 'outbound' and sender_profile_id = auth.uid())
  with check (direction = 'outbound' and sender_profile_id = auth.uid());

drop policy if exists message_attachments_select on public.message_attachments;
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_view_conversation(conversation_id));
drop policy if exists message_attachments_insert on public.message_attachments;
create policy message_attachments_insert on public.message_attachments for insert to authenticated with check (
  private.can_view_conversation(conversation_id)
  and exists(select 1 from public.messages m where m.id = message_id and m.conversation_id = conversation_id and m.sender_profile_id = auth.uid())
);

drop policy if exists conversation_assignments_select on public.conversation_assignments;
create policy conversation_assignments_select on public.conversation_assignments for select to authenticated using (private.can_view_conversation(conversation_id));

drop policy if exists conversation_notes_select on public.conversation_notes;
create policy conversation_notes_select on public.conversation_notes for select to authenticated using (private.can_view_conversation(conversation_id));
drop policy if exists conversation_notes_insert on public.conversation_notes;
create policy conversation_notes_insert on public.conversation_notes for insert to authenticated with check (private.is_active_user() and author_id = auth.uid() and private.can_view_conversation(conversation_id));

drop policy if exists conversation_reads_select on public.conversation_reads;
create policy conversation_reads_select on public.conversation_reads for select to authenticated using (user_id = auth.uid());
drop policy if exists conversation_reads_insert on public.conversation_reads;
create policy conversation_reads_insert on public.conversation_reads for insert to authenticated with check (user_id = auth.uid() and private.can_view_conversation(conversation_id));
drop policy if exists conversation_reads_update on public.conversation_reads;
create policy conversation_reads_update on public.conversation_reads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and private.can_view_conversation(conversation_id));

drop policy if exists conversation_ai_insights_select on public.conversation_ai_insights;
create policy conversation_ai_insights_select on public.conversation_ai_insights for select to authenticated using (private.can_view_conversation(conversation_id));
drop policy if exists conversation_ai_insights_insert on public.conversation_ai_insights;
create policy conversation_ai_insights_insert on public.conversation_ai_insights for insert to authenticated with check (private.is_active_user() and created_by = auth.uid() and private.can_view_conversation(conversation_id));

-- webhook_events intentionally has no policies: only the service role may read or write it.

-- Only administrators and sales managers may assign or reassign. Every change is
-- written to the assignment history and, when linked, to the CRM timeline.
create or replace function public.enforce_conversation_assignment()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.assigned_to is distinct from new.assigned_to and auth.uid() is not null
     and coalesce(current_setting('wwt.linking_conversation', true), '') <> 'on'
     and coalesce(private.current_role()::text, '') not in ('admin', 'sales_manager') then
    raise exception 'Only an administrator or sales manager may assign a conversation' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.audit_conversation_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := coalesce(auth.uid(), new.assigned_to);
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      insert into public.conversation_assignments(conversation_id, assigned_to, assigned_by, reason)
      values (new.id, new.assigned_to, auth.uid(), 'Assigned when the conversation was created');
    end if;
  elsif old.assigned_to is distinct from new.assigned_to then
    insert into public.conversation_assignments(conversation_id, assigned_to, assigned_by, reason)
    values (new.id, new.assigned_to, auth.uid(), case when new.assigned_to is null then 'Returned to the unassigned queue' else 'Reassigned' end);
    if actor is not null and (new.contact_id is not null or new.lead_id is not null) then
      insert into public.activities(activity_type, subject, description, contact_id, lead_id, user_id, metadata)
      values ('conversation_assigned', 'Conversation assigned', initcap(new.channel::text) || ' conversation assignment changed.', new.contact_id, new.lead_id, actor,
        jsonb_build_object('conversation_id', new.id, 'from', old.assigned_to, 'to', new.assigned_to));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_enforce_assignment on public.conversations;
create trigger conversations_enforce_assignment before update of assigned_to on public.conversations for each row execute function public.enforce_conversation_assignment();
drop trigger if exists conversations_audit_assignment on public.conversations;
create trigger conversations_audit_assignment after insert or update of assigned_to on public.conversations for each row execute function public.audit_conversation_assignment();

-- Keep the conversation summary, the contact's last interaction and the lead's
-- last contact in step with every stored message. A timeline entry is written
-- once per conversation session (first message, or after 24 quiet hours) so the
-- permanent history stays readable.
create or replace function public.apply_message_to_conversation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  conv public.conversations%rowtype;
  occurred timestamptz := coalesce(new.sent_at, new.received_at, new.created_at);
  preview text := left(coalesce(nullif(trim(new.body), ''), '[' || new.message_type::text || ']'), 160);
  actor uuid;
begin
  select * into conv from public.conversations where id = new.conversation_id for update;
  if conv.id is null then return new; end if;

  if conv.contact_id is not null then
    actor := coalesce(new.sender_profile_id, conv.assigned_to, (select c.owner_id from public.contacts c where c.id = conv.contact_id));
    if actor is not null and (conv.last_message_at is null or occurred - conv.last_message_at > interval '24 hours') then
      insert into public.activities(activity_type, subject, description, contact_id, lead_id, user_id, occurred_at, metadata)
      values (
        case conv.channel when 'whatsapp' then 'whatsapp'::public.activity_type when 'instagram' then 'instagram'::public.activity_type when 'messenger' then 'messenger'::public.activity_type else 'system'::public.activity_type end,
        case when new.direction = 'inbound' then 'Message received' else 'Message sent' end,
        preview, conv.contact_id, conv.lead_id, actor, occurred,
        jsonb_build_object('conversation_id', conv.id, 'message_id', new.id, 'channel', conv.channel, 'direction', new.direction)
      );
    end if;
    update public.contacts set last_interaction_at = greatest(coalesce(last_interaction_at, occurred), occurred) where id = conv.contact_id;
  end if;

  if conv.lead_id is not null then
    update public.leads set last_contacted_at = greatest(coalesce(last_contacted_at, occurred), occurred) where id = conv.lead_id;
  end if;

  if conv.last_message_at is null or occurred >= conv.last_message_at then
    update public.conversations set
      last_message_at = occurred,
      last_message_preview = preview,
      last_message_direction = new.direction,
      last_inbound_at = case when new.direction = 'inbound' then occurred else last_inbound_at end,
      status = case when new.direction = 'inbound' and status = 'closed' then 'open'::public.conversation_status else status end
    where id = conv.id;
  elsif new.direction = 'inbound' then
    update public.conversations set last_inbound_at = greatest(coalesce(last_inbound_at, occurred), occurred) where id = conv.id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_apply_to_conversation on public.messages;
create trigger messages_apply_to_conversation after insert on public.messages for each row execute function public.apply_message_to_conversation();

-- Match an external sender to an existing contact: known channel identity first,
-- then normalized phone / WhatsApp number, then email. Never creates anything.
create or replace function public.match_contact_for_identity(target_channel public.channel_kind, external_identity text, raw_phone text, raw_email text)
returns uuid language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare
  found uuid;
  canonical_phone text := public.normalize_phone(raw_phone);
begin
  if external_identity is not null then
    select p.contact_id into found from public.conversation_participants p
    where p.channel = target_channel and p.external_id = external_identity and p.contact_id is not null
    order by p.updated_at desc limit 1;
    if found is not null then return found; end if;
  end if;
  if canonical_phone is not null then
    select c.id into found from public.contacts c
    where c.phone_normalized = canonical_phone or c.whatsapp_normalized = canonical_phone
    order by c.last_interaction_at desc nulls last, c.created_at limit 1;
    if found is not null then return found; end if;
  end if;
  if nullif(trim(raw_email), '') is not null then
    select c.id into found from public.contacts c
    where lower(c.email) = lower(trim(raw_email))
    order by c.last_interaction_at desc nulls last, c.created_at limit 1;
  end if;
  return found;
end;
$$;

-- Single transactional entry point for channel webhooks (service role only).
-- Registers the receiving account, de-duplicates on the provider message id,
-- finds or creates the conversation, matches the CRM contact and open lead,
-- assigns an owner and stores the message with its attachment placeholders.
create or replace function public.ingest_channel_message(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  target_channel public.channel_kind := (payload->>'channel')::public.channel_kind;
  msg_direction public.message_direction := coalesce(nullif(payload->>'direction', ''), 'inbound')::public.message_direction;
  customer_id text := payload->>'customer_external_id';
  customer_phone text := nullif(payload->>'customer_phone', '');
  customer_name text := nullif(trim(payload->>'customer_name'), '');
  occurred timestamptz := coalesce(nullif(payload->>'occurred_at', '')::timestamptz, now());
  account public.channel_accounts%rowtype;
  conv public.conversations%rowtype;
  existing_message uuid;
  matched_contact uuid;
  matched_lead uuid;
  owner uuid;
  new_message uuid;
  is_new boolean := false;
  created_lead boolean := false;
  contact_label text;
  attachment jsonb;
  attachment_ids jsonb := '[]'::jsonb;
  attachment_id uuid;
  lead_source text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Channel ingestion is restricted to the service role' using errcode = '42501'; end if;
  if customer_id is null or payload->>'account_external_id' is null then raise exception 'Channel message is missing its account or customer identity'; end if;

  insert into public.channel_accounts(channel, external_account_id, display_name, display_identifier)
  values (target_channel, payload->>'account_external_id', coalesce(nullif(payload->>'account_display_name', ''), initcap(target_channel::text) || ' account'), nullif(payload->>'account_identifier', ''))
  on conflict (channel, external_account_id) do update set
    display_identifier = coalesce(public.channel_accounts.display_identifier, excluded.display_identifier)
  returning * into account;

  if payload->>'external_message_id' is not null then
    select m.id into existing_message from public.messages m
    where m.channel_account_id = account.id and m.external_message_id = payload->>'external_message_id';
    if existing_message is not null then
      return jsonb_build_object('duplicate', true, 'message_id', existing_message);
    end if;
  end if;

  select * into conv from public.conversations c
  where c.channel_account_id = account.id and c.external_thread_id = customer_id for update;

  matched_contact := conv.contact_id;
  if matched_contact is null then
    matched_contact := public.match_contact_for_identity(target_channel, customer_id, customer_phone, nullif(payload->>'customer_email', ''));
  end if;

  matched_lead := conv.lead_id;
  if matched_lead is not null and exists(select 1 from public.leads l where l.id = matched_lead and l.status in ('won', 'lost')) then matched_lead := null; end if;
  if matched_lead is null and matched_contact is not null then
    select l.id into matched_lead from public.leads l
    where l.contact_id = matched_contact and l.status not in ('won', 'lost')
    order by l.received_at desc limit 1;
  end if;
  matched_lead := coalesce(matched_lead, conv.lead_id);

  -- Optional automation, off by default per account. It reuses the matched contact
  -- and only creates a lead when the contact has no open one.
  if account.auto_create_leads and msg_direction = 'inbound' and account.default_assignee_id is not null
     and (matched_lead is null or exists(select 1 from public.leads l where l.id = matched_lead and l.status in ('won', 'lost')))
     and exists(select 1 from public.profiles p where p.id = account.default_assignee_id and p.is_active)
     and (matched_contact is not null or customer_phone is not null) then
    contact_label := coalesce(customer_name, customer_phone, 'Unknown contact');
    if matched_contact is null then
      insert into public.contacts(slug, full_name, first_name, last_name, phone, whatsapp_number, owner_id, created_by)
      values (
        regexp_replace(lower(contact_label), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6),
        contact_label, nullif(split_part(contact_label, ' ', 1), ''),
        nullif(trim(substr(contact_label, length(split_part(contact_label, ' ', 1)) + 1)), ''),
        customer_phone, case when target_channel = 'whatsapp' then customer_phone else null end,
        account.default_assignee_id, account.default_assignee_id
      ) returning id into matched_contact;
    end if;
    lead_source := case target_channel when 'whatsapp' then 'whatsapp' else 'social_media' end;
    insert into public.leads(slug, contact_id, contact_name, phone, source, service_interest, message, status, priority,
      assigned_to, created_by, receiving_whatsapp_number, customer_need, received_at, last_contacted_at)
    select 'lead-' || substr(gen_random_uuid()::text, 1, 12), c.id, c.full_name, coalesce(c.phone, customer_phone), lead_source,
      'Needs qualification', nullif(payload->>'body', ''), 'new', 'medium',
      coalesce(c.owner_id, account.default_assignee_id), account.default_assignee_id,
      case when target_channel = 'whatsapp' then account.display_identifier else null end,
      'Needs qualification', occurred, occurred
    from public.contacts c where c.id = matched_contact
    returning id into matched_lead;
    created_lead := true;
  end if;

  if conv.id is null then
    owner := coalesce(
      (select l.assigned_to from public.leads l where l.id = matched_lead),
      (select c.owner_id from public.contacts c where c.id = matched_contact),
      account.default_assignee_id
    );
    if owner is not null and not exists(select 1 from public.profiles p where p.id = owner and p.is_active) then owner := null; end if;
    insert into public.conversations(channel, channel_account_id, external_thread_id, contact_id, lead_id, assigned_to, display_name, external_handle)
    values (target_channel, account.id, customer_id, matched_contact, matched_lead, owner, customer_name, coalesce(customer_phone, nullif(payload->>'customer_handle', '')))
    returning * into conv;
    is_new := true;
  else
    update public.conversations set
      contact_id = matched_contact,
      lead_id = matched_lead,
      display_name = coalesce(customer_name, display_name),
      external_handle = coalesce(external_handle, customer_phone, nullif(payload->>'customer_handle', ''))
    where id = conv.id
    returning * into conv;
  end if;

  insert into public.conversation_participants(conversation_id, channel, external_id, display_name, phone, email, contact_id)
  values (conv.id, target_channel, customer_id, customer_name, customer_phone, nullif(payload->>'customer_email', ''), matched_contact)
  on conflict (conversation_id, external_id) do update set
    display_name = coalesce(excluded.display_name, public.conversation_participants.display_name),
    phone = coalesce(excluded.phone, public.conversation_participants.phone),
    contact_id = coalesce(excluded.contact_id, public.conversation_participants.contact_id);

  insert into public.messages(conversation_id, channel, channel_account_id, external_message_id, direction, message_type, body,
    sender_external_id, recipient_external_id, status, reply_to_external_id, contact_id, lead_id, metadata, sent_at, received_at)
  values (
    conv.id, target_channel, account.id, payload->>'external_message_id', msg_direction,
    coalesce(nullif(payload->>'message_type', ''), 'text')::public.message_type, nullif(payload->>'body', ''),
    case when msg_direction = 'inbound' then customer_id else account.external_account_id end,
    case when msg_direction = 'inbound' then account.external_account_id else customer_id end,
    case when msg_direction = 'inbound' then 'received'::public.message_status else 'sent'::public.message_status end,
    nullif(payload->>'reply_to_external_id', ''), conv.contact_id, conv.lead_id, coalesce(payload->'metadata', '{}'::jsonb),
    occurred,
    case when msg_direction = 'inbound' then now() else null end
  ) returning id into new_message;

  for attachment in select * from jsonb_array_elements(coalesce(payload->'attachments', '[]'::jsonb)) loop
    insert into public.message_attachments(message_id, conversation_id, external_media_id, external_url, mime_type, file_name, size_bytes, sha256)
    values (new_message, conv.id, nullif(attachment->>'external_media_id', ''), nullif(attachment->>'external_url', ''), nullif(attachment->>'mime_type', ''),
      nullif(attachment->>'file_name', ''), nullif(attachment->>'size_bytes', '')::bigint, nullif(attachment->>'sha256', ''))
    returning id into attachment_id;
    attachment_ids := attachment_ids || jsonb_build_object('id', attachment_id, 'external_media_id', attachment->>'external_media_id', 'external_url', attachment->>'external_url', 'mime_type', attachment->>'mime_type', 'file_name', attachment->>'file_name');
  end loop;

  return jsonb_build_object('duplicate', false, 'message_id', new_message, 'conversation_id', conv.id, 'new_conversation', is_new,
    'contact_id', conv.contact_id, 'lead_id', conv.lead_id, 'lead_created', created_lead, 'attachments', attachment_ids);
end;
$$;

-- Delivery receipts can arrive out of order; a status only ever moves forward.
create or replace function public.record_message_status(payload jsonb)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  next_status public.message_status := (payload->>'status')::public.message_status;
  occurred timestamptz := coalesce(nullif(payload->>'occurred_at', '')::timestamptz, now());
  target public.messages%rowtype;
  current_rank integer;
  next_rank integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Status updates are restricted to the service role' using errcode = '42501'; end if;
  select m.* into target from public.messages m
  join public.channel_accounts a on a.id = m.channel_account_id
  where a.channel = (payload->>'channel')::public.channel_kind and a.external_account_id = payload->>'account_external_id'
    and m.external_message_id = payload->>'external_message_id'
  for update of m;
  if target.id is null then return false; end if;
  current_rank := case target.status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 1 else 0 end;
  next_rank := case next_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 1 else 0 end;
  if next_status = 'failed' and target.status in ('delivered', 'read') then return false; end if;
  if next_status <> 'failed' and next_rank <= current_rank and target.status <> 'failed' then return false; end if;
  update public.messages set
    status = next_status,
    sent_at = case when next_status = 'sent' then coalesce(sent_at, occurred) else sent_at end,
    delivered_at = case when next_status in ('delivered', 'read') then coalesce(delivered_at, occurred) else delivered_at end,
    read_at = case when next_status = 'read' then coalesce(read_at, occurred) else read_at end,
    failed_at = case when next_status = 'failed' then occurred else failed_at end,
    error_code = case when next_status = 'failed' then nullif(payload->>'error_code', '') else null end,
    error_message = case when next_status = 'failed' then nullif(payload->>'error_message', '') else null end
  where id = target.id;
  return true;
end;
$$;

-- Link a conversation to a CRM contact (and optionally one of its leads). Runs
-- for the signed-in employee and re-checks every record against their scope.
create or replace function public.link_conversation(target_conversation uuid, target_contact uuid, target_lead uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare conv public.conversations%rowtype; new_owner uuid;
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'Invalid CRM actor' using errcode = '42501'; end if;
  select * into conv from public.conversations where id = target_conversation for update;
  if conv.id is null or not private.can_access_conversation(conv.assigned_to, conv.contact_id, conv.lead_id) then raise exception 'Conversation is not accessible' using errcode = '42501'; end if;
  if target_contact is null or not private.can_view_contact(target_contact) then raise exception 'Contact is not accessible' using errcode = '42501'; end if;
  if target_lead is not null and not exists(select 1 from public.leads l where l.id = target_lead and l.contact_id = target_contact and private.can_view_owner(l.assigned_to)) then
    raise exception 'Lead does not belong to this contact or is not accessible' using errcode = '42501';
  end if;
  -- An unassigned conversation adopts the owner of the record it is linked to.
  new_owner := coalesce(conv.assigned_to, (select l.assigned_to from public.leads l where l.id = target_lead), (select c.owner_id from public.contacts c where c.id = target_contact));
  -- The transaction-local flag lets this vetted path set the first owner for a representative.
  perform set_config('wwt.linking_conversation', 'on', true);
  update public.conversations set contact_id = target_contact, lead_id = target_lead, assigned_to = new_owner where id = conv.id;
  perform set_config('wwt.linking_conversation', 'off', true);
  update public.conversation_participants set contact_id = target_contact where conversation_id = conv.id and external_id = conv.external_thread_id;
  update public.messages set contact_id = target_contact, lead_id = coalesce(target_lead, lead_id) where conversation_id = conv.id and contact_id is null;
  return jsonb_build_object('conversation_id', conv.id, 'contact_id', target_contact, 'lead_id', target_lead);
end;
$$;

drop view if exists public.conversations_view;
create view public.conversations_view with (security_invoker = true) as
select c.id, c.channel, c.channel_account_id, a.display_name as account_name, a.display_identifier as account_identifier,
  c.external_thread_id, c.external_handle, c.display_name, c.status, c.assigned_to, p.full_name as assigned_name,
  c.contact_id, ct.slug as contact_slug, ct.full_name as contact_name,
  c.lead_id, l.slug as lead_slug, l.status as lead_status, l.customer_need as lead_need,
  c.last_message_at, c.last_message_preview, c.last_message_direction, c.last_inbound_at, c.created_at, c.updated_at,
  (c.last_inbound_at is not null and c.last_inbound_at > coalesce(r.last_read_at, '-infinity'::timestamptz)) as is_unread
from public.conversations c
join public.channel_accounts a on a.id = c.channel_account_id
left join public.contacts ct on ct.id = c.contact_id
left join public.leads l on l.id = c.lead_id
left join public.profiles p on p.id = c.assigned_to
left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid();

-- Private bucket for inbound and outbound conversation media. Object names are
-- "<conversation_id>/<file>", so access follows conversation visibility.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('inbox-media', 'inbox-media', false, 26214400, array[
  'image/jpeg','image/png','image/webp','image/gif','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/amr','audio/opus',
  'video/mp4','video/3gpp','application/pdf','text/plain','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inbox_media_select on storage.objects;
create policy inbox_media_select on storage.objects for select to authenticated using (bucket_id = 'inbox-media' and private.can_access_inbox_media_path(name));
drop policy if exists inbox_media_insert on storage.objects;
create policy inbox_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'inbox-media' and private.is_active_user() and private.can_access_inbox_media_path(name));

revoke all on public.communication_channels, public.channel_accounts, public.conversations, public.conversation_participants, public.messages,
  public.message_attachments, public.conversation_assignments, public.conversation_notes, public.conversation_reads,
  public.conversation_ai_insights, public.webhook_events from anon, authenticated;
grant select on public.communication_channels, public.channel_accounts, public.conversations, public.conversation_participants, public.messages,
  public.message_attachments, public.conversation_assignments, public.conversation_notes, public.conversation_reads,
  public.conversation_ai_insights, public.conversations_view to authenticated;
grant update (is_enabled) on public.communication_channels to authenticated;
grant insert (channel, external_account_id, display_name, display_identifier, created_by) on public.channel_accounts to authenticated;
grant update (display_name, is_active, default_assignee_id, auto_create_leads) on public.channel_accounts to authenticated;
-- Employees may only change a conversation's status and owner directly; linking goes through link_conversation.
grant update (status, assigned_to) on public.conversations to authenticated;
grant insert on public.messages, public.message_attachments, public.conversation_notes, public.conversation_reads, public.conversation_ai_insights to authenticated;
-- After sending, the author records the provider result on their own outbound message.
grant update (status, external_message_id, sent_at, failed_at, error_code, error_message) on public.messages to authenticated;
grant update on public.conversation_reads to authenticated;
grant all on public.communication_channels, public.channel_accounts, public.conversations, public.conversation_participants, public.messages,
  public.message_attachments, public.conversation_assignments, public.conversation_notes, public.conversation_reads,
  public.conversation_ai_insights, public.webhook_events to service_role;

revoke all on function public.enforce_conversation_assignment(), public.audit_conversation_assignment(), public.apply_message_to_conversation() from public, anon, authenticated;
revoke all on function public.ingest_channel_message(jsonb), public.record_message_status(jsonb), public.match_contact_for_identity(public.channel_kind, text, text, text) from public, anon, authenticated;
grant execute on function public.ingest_channel_message(jsonb), public.record_message_status(jsonb), public.match_contact_for_identity(public.channel_kind, text, text, text) to service_role;
revoke all on function public.link_conversation(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_conversation(uuid, uuid, uuid) to authenticated;

-- Live updates in the Inbox. Realtime still applies the RLS policies above.
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end;
  end if;
end $$;
