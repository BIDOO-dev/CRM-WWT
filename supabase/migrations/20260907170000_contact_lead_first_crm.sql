-- WWT CRM contact + lead-first refactor.
-- Company data is retained as a legacy archive so this migration never destroys an existing customer history.

drop view if exists public.leads_view;
drop view if exists public.contacts_view;
drop view if exists public.tasks_view;
drop function if exists public.convert_lead(jsonb, uuid);

create or replace function public.normalize_phone(raw_phone text) returns text
language sql immutable set search_path = public as $$
  with cleaned as (
    select regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g') as digits
  )
  select case
    when digits = '' then null
    when digits like '00%' then '+' || substr(digits, 3)
    when digits like '961%' then '+' || digits
    when digits like '0%' then '+961' || substr(digits, 2)
    when length(digits) between 7 and 8 then '+961' || digits
    else '+' || digits
  end
  from cleaned;
$$;

alter table public.contacts
  add column if not exists full_name text,
  add column if not exists location_text text,
  add column if not exists organization_name text,
  add column if not exists owner_id uuid references public.profiles(id) on delete restrict,
  add column if not exists last_interaction_at timestamptz;

update public.contacts ct
set full_name = coalesce(nullif(trim(concat_ws(' ', ct.first_name, ct.last_name)), ''), ct.phone, 'Unknown contact'),
    organization_name = coalesce(ct.organization_name, co.name),
    location_text = coalesce(ct.location_text, concat_ws(', ', nullif(co.city, ''), nullif(co.governorate, ''))),
    owner_id = coalesce(ct.owner_id, co.owner_id, ct.created_by)
from public.companies co
where co.id = ct.company_id;

update public.contacts
set full_name = coalesce(nullif(full_name, ''), phone, 'Unknown contact'),
    owner_id = coalesce(owner_id, created_by)
where full_name is null or owner_id is null;

alter table public.contacts
  alter column company_id drop not null,
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column full_name set not null,
  alter column owner_id set not null;

alter table public.contacts
  add column if not exists phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  add column if not exists whatsapp_normalized text generated always as (public.normalize_phone(whatsapp_number)) stored;

create index if not exists contacts_phone_normalized_idx on public.contacts(phone_normalized) where phone_normalized is not null;
create index if not exists contacts_whatsapp_normalized_idx on public.contacts(whatsapp_normalized) where whatsapp_normalized is not null;
comment on column public.contacts.phone_normalized is 'Canonical lookup key for future WhatsApp ingestion and duplicate detection. Intentionally non-unique until legacy duplicates are reviewed.';

drop index if exists public.leads_follow_up_idx;
create type public.lead_status_v2 as enum ('new', 'contacted', 'qualified', 'site_visit', 'quotation', 'negotiation', 'won', 'lost');
alter table public.leads alter column status drop default;
alter table public.leads alter column status type public.lead_status_v2 using (
  case status::text
    when 'unqualified' then 'lost'
    when 'converted' then 'won'
    else status::text
  end::public.lead_status_v2
);
drop type public.lead_status;
alter type public.lead_status_v2 rename to lead_status;
alter table public.leads alter column status set default 'new'::public.lead_status;

alter table public.leads
  add column if not exists receiving_whatsapp_number text,
  add column if not exists campaign_source text,
  add column if not exists customer_need text,
  add column if not exists notes text,
  add column if not exists received_at timestamptz;

update public.leads
set customer_need = coalesce(nullif(customer_need, ''), nullif(service_interest, ''), 'Needs qualification'),
    received_at = coalesce(received_at, created_at);

insert into public.contacts (slug, full_name, first_name, last_name, phone, email, location_text, organization_name, owner_id, created_by, created_at, last_interaction_at)
select 'legacy-lead-' || l.id::text,
       coalesce(nullif(trim(l.contact_name), ''), nullif(l.phone, ''), 'Unknown contact'),
       nullif(split_part(trim(l.contact_name), ' ', 1), ''),
       nullif(trim(substr(trim(l.contact_name), length(split_part(trim(l.contact_name), ' ', 1)) + 1)), ''),
       l.phone,
       l.email,
       l.location_text,
       nullif(l.company_name, ''),
       l.assigned_to,
       l.created_by,
       l.created_at,
       coalesce(l.last_contacted_at, l.created_at)
from public.leads l
where l.contact_id is null
on conflict (slug) do nothing;

update public.leads l
set contact_id = c.id
from public.contacts c
where l.contact_id is null and c.slug = 'legacy-lead-' || l.id::text;

update public.leads l
set phone = coalesce(l.phone, c.phone),
    contact_name = coalesce(nullif(l.contact_name, ''), c.full_name)
from public.contacts c
where c.id = l.contact_id;

alter table public.leads
  alter column company_id drop not null,
  alter column company_name drop not null,
  alter column contact_id set not null,
  alter column customer_need set not null,
  alter column received_at set not null,
  alter column received_at set default now();

alter table public.leads
  add column if not exists phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  add column if not exists receiving_whatsapp_normalized text generated always as (public.normalize_phone(receiving_whatsapp_number)) stored;

alter table public.opportunities alter column company_id drop not null;
create index if not exists leads_receiving_whatsapp_idx on public.leads(receiving_whatsapp_normalized, received_at desc) where receiving_whatsapp_normalized is not null;
create index if not exists leads_contact_received_idx on public.leads(contact_id, received_at desc);
create index leads_follow_up_idx on public.leads(next_follow_up_at) where status not in ('won', 'lost');

drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;

create or replace function public.can_view_contact(contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin' or exists (
    select 1 from public.contacts c where c.id = contact and (
      public.can_view_owner(c.owner_id) or c.created_by = auth.uid() or
      exists(select 1 from public.leads l where l.contact_id = c.id and public.can_view_owner(l.assigned_to))
    )
  );
$$;

create policy contacts_select on public.contacts for select to authenticated using (public.can_view_contact(id));
create policy contacts_insert on public.contacts for insert to authenticated with check (
  public.is_active_user() and created_by = auth.uid() and (owner_id = auth.uid() or public.current_role() in ('admin', 'sales_manager'))
);
create policy contacts_update on public.contacts for update to authenticated using (public.can_view_contact(id)) with check (
  public.can_view_contact(id) and (owner_id = auth.uid() or public.current_role() in ('admin', 'sales_manager'))
);

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  user_id = auth.uid() or public.current_role() = 'admin' or
  (contact_id is not null and public.can_view_contact(contact_id)) or
  (lead_id is not null and exists(select 1 from public.leads l where l.id = lead_id and public.can_view_owner(l.assigned_to))) or
  (company_id is not null and public.can_view_company(company_id)) or
  (opportunity_id is not null and exists(select 1 from public.opportunities o where o.id = opportunity_id and public.can_view_owner(o.assigned_to)))
);

create or replace function public.find_contact_by_phone(raw_phone text)
returns table(id uuid, slug text, full_name text, phone text)
language sql stable security invoker set search_path = public as $$
  select c.id, c.slug, c.full_name, c.phone
  from public.contacts c
  where c.phone_normalized = public.normalize_phone(raw_phone)
     or c.whatsapp_normalized = public.normalize_phone(raw_phone)
  order by c.last_interaction_at desc nulls last, c.created_at
  limit 5;
$$;

create or replace function public.create_lead_with_contact(payload jsonb, actor_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  target_contact uuid;
  target_assignee uuid := (payload->>'assigned_to')::uuid;
  canonical_phone text := public.normalize_phone(payload->>'phone');
  contact_label text := coalesce(nullif(trim(payload->>'full_name'), ''), nullif(trim(payload->>'phone'), ''), 'Unknown contact');
  contact_slug text;
  lead_slug text;
  new_lead_id uuid;
begin
  if not exists(select 1 from public.profiles where id = actor_id and is_active) then raise exception 'Invalid CRM actor'; end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    if actor_id is distinct from auth.uid() or not public.is_active_user() then raise exception 'Invalid CRM actor'; end if;
    if not (target_assignee = auth.uid() or public.current_role() in ('admin', 'sales_manager')) then raise exception 'Assignment is not permitted'; end if;
  end if;

  target_contact := nullif(payload->>'contact_id', '')::uuid;
  if target_contact is not null and not public.can_view_contact(target_contact) then raise exception 'Contact is not accessible'; end if;

  if target_contact is null then
    select c.id into target_contact
    from public.contacts c
    where canonical_phone is not null and (c.phone_normalized = canonical_phone or c.whatsapp_normalized = canonical_phone)
    order by c.last_interaction_at desc nulls last, c.created_at
    limit 1;
  end if;

  if target_contact is null then
    contact_slug := regexp_replace(lower(contact_label), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6);
    insert into public.contacts(slug, full_name, first_name, last_name, phone, whatsapp_number, email, location_text, organization_name, notes, owner_id, created_by)
    values (
      contact_slug,
      contact_label,
      nullif(split_part(contact_label, ' ', 1), ''),
      nullif(trim(substr(contact_label, length(split_part(contact_label, ' ', 1)) + 1)), ''),
      payload->>'phone',
      nullif(payload->>'whatsapp_number', ''),
      nullif(payload->>'contact_email', ''),
      nullif(payload->>'location_text', ''),
      nullif(payload->>'organization_name', ''),
      null,
      target_assignee,
      actor_id
    ) returning id into target_contact;
  end if;

  lead_slug := left(coalesce(nullif(payload->>'slug', ''), 'lead'), 62) || '-' || substr(gen_random_uuid()::text, 1, 6);
  insert into public.leads(
    slug, contact_id, company_name, contact_name, phone, email, location_text, source,
    service_interest, message, status, priority, assigned_to, created_by,
    last_contacted_at, next_follow_up_at, receiving_whatsapp_number, campaign_source,
    customer_need, notes, received_at
  ) values (
    lead_slug, target_contact, nullif(payload->>'organization_name', ''), contact_label,
    payload->>'phone', nullif(payload->>'contact_email', ''), nullif(payload->>'location_text', ''), payload->>'source',
    payload->>'customer_need', nullif(payload->>'original_message', ''), (payload->>'status')::public.lead_status,
    (payload->>'priority')::public.crm_priority, target_assignee, actor_id,
    nullif(payload->>'last_contacted_at', '')::timestamptz, nullif(payload->>'next_follow_up_at', '')::timestamptz,
    nullif(payload->>'receiving_whatsapp_number', ''), nullif(payload->>'campaign_source', ''),
    payload->>'customer_need', nullif(payload->>'notes', ''), (payload->>'received_at')::timestamptz
  ) returning id into new_lead_id;

  return jsonb_build_object('lead_id', new_lead_id, 'lead_slug', lead_slug, 'contact_id', target_contact);
end;
$$;

create or replace function public.audit_crm_change() returns trigger
language plpgsql security definer set search_path = public as $$
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
  elsif tg_table_name = 'tasks' and tg_op = 'UPDATE' and new.status = 'completed' and old.status <> 'completed' then
    insert into public.activities(activity_type, subject, description, company_id, contact_id, lead_id, opportunity_id, user_id)
    values ('task_completed', 'Task completed', new.title, new.company_id, new.contact_id, new.lead_id, new.opportunity_id, actor);
  end if;
  return new;
end;
$$;

create or replace function public.touch_contact_interaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    update public.contacts set last_interaction_at = greatest(coalesce(last_interaction_at, new.occurred_at), new.occurred_at) where id = new.contact_id;
  elsif new.lead_id is not null then
    update public.contacts c set last_interaction_at = greatest(coalesce(c.last_interaction_at, new.occurred_at), new.occurred_at)
    from public.leads l where l.id = new.lead_id and c.id = l.contact_id;
  end if;
  return new;
end;
$$;
drop trigger if exists activities_touch_contact on public.activities;
create trigger activities_touch_contact after insert on public.activities for each row execute function public.touch_contact_interaction();

update public.contacts c
set last_interaction_at = coalesce((select max(a.occurred_at) from public.activities a where a.contact_id = c.id), c.updated_at, c.created_at)
where c.last_interaction_at is null;

create view public.contacts_view with (security_invoker = true) as
select c.id, c.slug, c.full_name, c.phone, c.phone_normalized, c.whatsapp_number, c.whatsapp_normalized,
  c.email, c.location_text, c.organization_name, c.notes, c.owner_id, p.full_name as owner_name,
  c.created_at, c.last_interaction_at, count(l.id)::integer as lead_count
from public.contacts c
join public.profiles p on p.id = c.owner_id
left join public.leads l on l.contact_id = c.id
group by c.id, p.full_name;

create view public.leads_view with (security_invoker = true) as
select l.id, l.slug, l.contact_id, coalesce(c.full_name, l.contact_name, l.phone) as contact_name,
  coalesce(l.phone, c.phone) as phone, l.source, l.receiving_whatsapp_number, l.receiving_whatsapp_normalized,
  l.campaign_source, l.customer_need, l.location_text, l.status, l.priority, l.assigned_to,
  p.full_name as assigned_name, l.received_at, l.created_at, l.last_contacted_at, l.next_follow_up_at,
  l.notes, l.message as original_message, coalesce(c.email, l.email) as contact_email,
  coalesce(c.organization_name, l.company_name) as organization_name
from public.leads l
join public.contacts c on c.id = l.contact_id
join public.profiles p on p.id = l.assigned_to;

create view public.tasks_view with (security_invoker = true) as
select t.id, t.title, t.description, t.task_type, t.status, t.priority, t.due_at, t.assigned_to,
  p.full_name as assigned_name, t.contact_id, c.full_name as contact_name, t.lead_id,
  l.customer_need as lead_need, t.completed_at
from public.tasks t
join public.profiles p on p.id = t.assigned_to
left join public.contacts c on c.id = t.contact_id
left join public.leads l on l.id = t.lead_id;

create or replace function public.search_crm(search_term text)
returns table(type text, label text, detail text, href text)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'Contact', c.full_name, concat_ws(' · ', c.phone, c.organization_name), '/contacts/' || c.slug
    from public.contacts c
    where (c.full_name || ' ' || coalesce(c.phone, '') || ' ' || coalesce(c.phone_normalized, '') || ' ' || coalesce(c.organization_name, '')) ilike '%' || search_term || '%'
    limit 5
  ) contacts
  union all select * from (
    select 'Lead', coalesce(c.full_name, l.phone), l.customer_need, '/leads/' || l.slug
    from public.leads l join public.contacts c on c.id = l.contact_id
    where (c.full_name || ' ' || coalesce(l.phone, '') || ' ' || l.customer_need) ilike '%' || search_term || '%'
    limit 5
  ) leads;
$$;

grant select on public.contacts_view, public.leads_view, public.tasks_view to authenticated;
revoke all on function public.create_lead_with_contact(jsonb, uuid) from public, anon;
grant execute on function public.create_lead_with_contact(jsonb, uuid) to authenticated, service_role;
grant execute on function public.normalize_phone(text), public.find_contact_by_phone(text), public.search_crm(text) to authenticated;

comment on table public.companies is 'Legacy archive retained by the contact-first migration. The CRM application no longer creates or requires company records.';
comment on table public.opportunities is 'Legacy archive retained for migration safety. Leads now move through the active WWT pipeline.';
