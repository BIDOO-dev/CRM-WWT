-- WWT CRM Phase 1 — schema, authorization, audit trail and reporting views.
-- Apply with `supabase db reset` locally or through the Supabase migration workflow.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'sales_manager', 'sales_rep');
create type public.company_status as enum ('prospect', 'active_client', 'inactive_client', 'lost');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'unqualified', 'converted');
create type public.crm_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.opportunity_stage as enum ('new_opportunity', 'assessment', 'site_visit', 'quotation', 'negotiation', 'won', 'lost');
create type public.task_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
create type public.task_type as enum ('call', 'whatsapp', 'email', 'meeting', 'site_visit', 'follow_up', 'other');
create type public.activity_type as enum ('lead_created', 'lead_assigned', 'call', 'email', 'whatsapp', 'meeting', 'note', 'site_visit', 'quote_sent', 'stage_change', 'task_completed', 'system');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role public.user_role not null default 'sales_rep',
  manager_id uuid references public.profiles(id) on delete set null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  industry text,
  company_type text,
  website text,
  main_phone text,
  main_email text,
  country text not null default 'Lebanon',
  governorate text,
  city text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  employee_count integer check (employee_count is null or employee_count >= 0),
  notes text,
  status public.company_status not null default 'prospect',
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  job_title text,
  department text,
  email text,
  phone text,
  whatsapp_number text,
  is_primary boolean not null default false,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_name text not null,
  contact_name text,
  phone text,
  email text,
  location_text text,
  source text not null default 'manual',
  service_interest text,
  message text,
  status public.lead_status not null default 'new',
  priority public.crm_priority not null default 'medium',
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid unique references public.leads(id) on delete set null,
  name text not null,
  service_type text not null,
  description text,
  stage public.opportunity_stage not null default 'new_opportunity',
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  probability smallint not null default 20 check (probability between 0 and 100),
  expected_close_date date,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  loss_reason text,
  competitor text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_opportunity_context check (stage <> 'lost' or loss_reason is not null)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_type public.task_type not null default 'follow_up',
  status public.task_status not null default 'pending',
  priority public.crm_priority not null default 'medium',
  due_at timestamptz,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  activity_type public.activity_type not null,
  subject text not null,
  description text,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  country text not null default 'Lebanon',
  governorate text,
  city text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.waste_streams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  waste_type text not null,
  category text,
  estimated_quantity numeric(14,3) check (estimated_quantity is null or estimated_quantity >= 0),
  quantity_unit text,
  frequency text,
  current_disposal_method text,
  current_provider text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_owner_idx on public.companies(owner_id);
create index companies_name_idx on public.companies using gin (to_tsvector('simple', name || ' ' || coalesce(industry, '')));
create index contacts_company_idx on public.contacts(company_id);
create index contacts_phone_idx on public.contacts(phone);
create index contacts_whatsapp_idx on public.contacts(whatsapp_number);
create index leads_assigned_status_idx on public.leads(assigned_to, status);
create index leads_follow_up_idx on public.leads(next_follow_up_at) where status not in ('unqualified', 'converted');
create index leads_phone_idx on public.leads(phone);
create index opportunities_assigned_stage_idx on public.opportunities(assigned_to, stage);
create index opportunities_company_idx on public.opportunities(company_id);
create index opportunities_close_idx on public.opportunities(expected_close_date) where stage not in ('won', 'lost');
create index tasks_assigned_status_due_idx on public.tasks(assigned_to, status, due_at);
create index tasks_company_idx on public.tasks(company_id);
create index activities_company_time_idx on public.activities(company_id, occurred_at desc);
create index activities_lead_time_idx on public.activities(lead_id, occurred_at desc);
create index activities_opportunity_time_idx on public.activities(opportunity_id, occurred_at desc);
create index sites_company_idx on public.sites(company_id);
create index waste_streams_company_idx on public.waste_streams(company_id);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger companies_updated before update on public.companies for each row execute function public.set_updated_at();
create trigger contacts_updated before update on public.contacts for each row execute function public.set_updated_at();
create trigger leads_updated before update on public.leads for each row execute function public.set_updated_at();
create trigger opportunities_updated before update on public.opportunities for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger sites_updated before update on public.sites for each row execute function public.set_updated_at();
create trigger waste_streams_updated before update on public.waste_streams for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email, 'sales_rep')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.prevent_profile_privilege_escalation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and public.current_role() <> 'admin' and (
    new.role is distinct from old.role or
    new.manager_id is distinct from old.manager_id or
    new.is_active is distinct from old.is_active or
    new.email is distinct from old.email
  ) then
    raise exception 'Only an administrator may change role, manager, active state or login email';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_privileges before update on public.profiles for each row execute function public.prevent_profile_privilege_escalation();
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active);
$$;
create or replace function public.can_view_owner(owner uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin' or owner = auth.uid() or (
    public.current_role() = 'sales_manager' and exists(select 1 from public.profiles p where p.id = owner and (p.manager_id = auth.uid() or p.id = auth.uid()))
  );
$$;
create or replace function public.can_view_company(company uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin' or exists (
    select 1 from public.companies c where c.id = company and (
      public.can_view_owner(c.owner_id) or c.created_by = auth.uid() or
      exists(select 1 from public.leads l where l.company_id = c.id and public.can_view_owner(l.assigned_to)) or
      exists(select 1 from public.opportunities o where o.company_id = c.id and public.can_view_owner(o.assigned_to))
    )
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;
alter table public.sites enable row level security;
alter table public.waste_streams enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.current_role() = 'admin' or (public.current_role() = 'sales_manager' and (manager_id = auth.uid() or id = auth.uid())));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.current_role() = 'admin') with check (id = auth.uid() or public.current_role() = 'admin');

create policy companies_select on public.companies for select to authenticated using (public.can_view_company(id));
create policy companies_insert on public.companies for insert to authenticated with check (public.is_active_user() and created_by = auth.uid() and (owner_id = auth.uid() or public.current_role() in ('admin', 'sales_manager')));
create policy companies_update on public.companies for update to authenticated using (public.can_view_company(id)) with check (public.current_role() in ('admin', 'sales_manager') or owner_id = auth.uid());

create policy contacts_select on public.contacts for select to authenticated using (public.can_view_company(company_id));
create policy contacts_insert on public.contacts for insert to authenticated with check (public.is_active_user() and created_by = auth.uid() and public.can_view_company(company_id));
create policy contacts_update on public.contacts for update to authenticated using (public.can_view_company(company_id)) with check (public.can_view_company(company_id));

create policy leads_select on public.leads for select to authenticated using (public.can_view_owner(assigned_to));
create policy leads_insert on public.leads for insert to authenticated with check (public.is_active_user() and created_by = auth.uid() and (assigned_to = auth.uid() or public.current_role() in ('admin', 'sales_manager')));
create policy leads_update on public.leads for update to authenticated using (public.can_view_owner(assigned_to)) with check (public.can_view_owner(assigned_to));
create policy leads_delete on public.leads for delete to authenticated using (public.current_role() = 'admin');

create policy opportunities_select on public.opportunities for select to authenticated using (public.can_view_owner(assigned_to));
create policy opportunities_insert on public.opportunities for insert to authenticated with check (public.is_active_user() and created_by = auth.uid() and (assigned_to = auth.uid() or public.current_role() in ('admin', 'sales_manager')));
create policy opportunities_update on public.opportunities for update to authenticated using (public.can_view_owner(assigned_to)) with check (public.can_view_owner(assigned_to));

create policy tasks_select on public.tasks for select to authenticated using (public.can_view_owner(assigned_to) or created_by = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_active_user() and created_by = auth.uid() and (assigned_to = auth.uid() or public.current_role() in ('admin', 'sales_manager')));
create policy tasks_update on public.tasks for update to authenticated using (public.can_view_owner(assigned_to) or created_by = auth.uid()) with check (public.can_view_owner(assigned_to) or (created_by = auth.uid() and assigned_to = auth.uid()));

create policy activities_select on public.activities for select to authenticated using (
  user_id = auth.uid() or public.current_role() = 'admin' or
  (company_id is not null and public.can_view_company(company_id)) or
  (lead_id is not null and exists(select 1 from public.leads l where l.id = lead_id and public.can_view_owner(l.assigned_to))) or
  (opportunity_id is not null and exists(select 1 from public.opportunities o where o.id = opportunity_id and public.can_view_owner(o.assigned_to)))
);
create policy activities_insert on public.activities for insert to authenticated with check (public.is_active_user() and user_id = auth.uid());

create policy sites_select on public.sites for select to authenticated using (public.can_view_company(company_id));
create policy sites_write on public.sites for all to authenticated using (public.can_view_company(company_id)) with check (public.can_view_company(company_id));
create policy waste_streams_select on public.waste_streams for select to authenticated using (public.can_view_company(company_id));
create policy waste_streams_write on public.waste_streams for all to authenticated using (public.can_view_company(company_id)) with check (public.can_view_company(company_id) and created_by = auth.uid());

create or replace function public.audit_crm_change() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := coalesce(auth.uid(), new.created_by, new.assigned_to);
begin
  if tg_table_name = 'leads' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, company_id, lead_id, user_id) values ('lead_created', 'Lead created', new.company_name || ' was added to the CRM.', new.company_id, new.id, actor);
  elsif tg_table_name = 'leads' and tg_op = 'UPDATE' then
    if old.assigned_to is distinct from new.assigned_to then insert into public.activities(activity_type, subject, description, company_id, lead_id, user_id, metadata) values ('lead_assigned', 'Lead assigned', 'Lead assignment changed.', new.company_id, new.id, actor, jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to)); end if;
    if old.status is distinct from new.status then insert into public.activities(activity_type, subject, description, company_id, lead_id, user_id, metadata) values ('stage_change', 'Lead status changed', 'Status changed from ' || old.status || ' to ' || new.status || '.', new.company_id, new.id, actor, jsonb_build_object('from', old.status, 'to', new.status)); end if;
  elsif tg_table_name = 'opportunities' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, company_id, opportunity_id, user_id) values ('system', 'Opportunity created', new.name || ' entered the pipeline.', new.company_id, new.id, actor);
  elsif tg_table_name = 'opportunities' and tg_op = 'UPDATE' and old.stage is distinct from new.stage then
    insert into public.activities(activity_type, subject, description, company_id, opportunity_id, user_id, metadata) values ('stage_change', 'Pipeline stage changed', 'Stage changed from ' || old.stage || ' to ' || new.stage || '.', new.company_id, new.id, actor, jsonb_build_object('from', old.stage, 'to', new.stage));
  elsif tg_table_name = 'tasks' and tg_op = 'UPDATE' and new.status = 'completed' and old.status <> 'completed' then
    insert into public.activities(activity_type, subject, description, company_id, contact_id, lead_id, opportunity_id, user_id) values ('task_completed', 'Task completed', new.title, new.company_id, new.contact_id, new.lead_id, new.opportunity_id, actor);
  end if;
  return new;
end;
$$;
create trigger leads_audit after insert or update on public.leads for each row execute function public.audit_crm_change();
create trigger opportunities_audit after insert or update on public.opportunities for each row execute function public.audit_crm_change();
create trigger tasks_audit after update on public.tasks for each row execute function public.audit_crm_change();

create or replace function public.convert_lead(payload jsonb, actor_id uuid) returns jsonb language plpgsql security invoker set search_path = public as $$
declare source_lead public.leads%rowtype; target_company uuid; target_contact uuid; opportunity_id uuid; opportunity_slug text;
begin
  select * into source_lead from public.leads where id = (payload->>'lead_id')::uuid for update;
  if source_lead.id is null or not public.can_view_owner(source_lead.assigned_to) then raise exception 'Lead is not accessible'; end if;
  if source_lead.status = 'converted' then raise exception 'Lead was already converted'; end if;
  target_company := nullif(payload->>'company_id', '')::uuid;
  if target_company is null then
    insert into public.companies(slug, name, country, status, owner_id, created_by) values (regexp_replace(lower(payload->>'create_company_name'), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6), payload->>'create_company_name', 'Lebanon', 'prospect', (payload->>'assigned_to')::uuid, actor_id) returning id into target_company;
  end if;
  target_contact := nullif(payload->>'contact_id', '')::uuid;
  if target_contact is null and coalesce(source_lead.contact_name, '') <> '' then
    insert into public.contacts(slug, company_id, first_name, last_name, email, phone, created_by) values (regexp_replace(lower(source_lead.contact_name), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6), target_company, split_part(source_lead.contact_name, ' ', 1), trim(substr(source_lead.contact_name, length(split_part(source_lead.contact_name, ' ', 1)) + 1)), source_lead.email, source_lead.phone, actor_id) returning id into target_contact;
  end if;
  opportunity_slug := regexp_replace(lower(payload->>'opportunity_name'), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6);
  insert into public.opportunities(slug, company_id, primary_contact_id, lead_id, name, service_type, stage, estimated_value, currency, probability, expected_close_date, assigned_to, created_by)
  values (opportunity_slug, target_company, target_contact, source_lead.id, payload->>'opportunity_name', payload->>'service_type', (payload->>'stage')::public.opportunity_stage, (payload->>'estimated_value')::numeric, upper(payload->>'currency'), (payload->>'probability')::smallint, (payload->>'expected_close_date')::date, (payload->>'assigned_to')::uuid, actor_id) returning id into opportunity_id;
  update public.leads set status = 'converted', company_id = target_company, contact_id = target_contact where id = source_lead.id;
  return jsonb_build_object('opportunity_id', opportunity_id, 'opportunity_slug', opportunity_slug);
end;
$$;

create view public.leads_view with (security_invoker = true) as
select l.*, p.full_name as assigned_name from public.leads l join public.profiles p on p.id = l.assigned_to;

create view public.contacts_view with (security_invoker = true) as
select c.*, co.name as company_name from public.contacts c join public.companies co on co.id = c.company_id;

create view public.opportunities_view with (security_invoker = true) as
select o.*, c.name as company_name, trim(concat(ct.first_name, ' ', ct.last_name)) as contact_name, p.full_name as assigned_name,
  (select t.title from public.tasks t where t.opportunity_id = o.id and t.status in ('pending', 'in_progress') order by t.due_at nulls last limit 1) as next_task
from public.opportunities o join public.companies c on c.id = o.company_id left join public.contacts ct on ct.id = o.primary_contact_id join public.profiles p on p.id = o.assigned_to;

create view public.tasks_view with (security_invoker = true) as
select t.*, p.full_name as assigned_name, c.name as company_name, o.name as opportunity_name
from public.tasks t join public.profiles p on p.id = t.assigned_to left join public.companies c on c.id = t.company_id left join public.opportunities o on o.id = t.opportunity_id;

create view public.companies_summary with (security_invoker = true) as
select c.*, p.full_name as owner_name,
  coalesce(o.open_opportunities, 0)::integer as open_opportunities,
  coalesce(o.pipeline_value, 0)::numeric as pipeline_value,
  coalesce(o.won_value, 0)::numeric as won_value,
  coalesce(a.last_activity::text, c.updated_at::text) as last_activity
from public.companies c
left join public.profiles p on p.id = c.owner_id
left join lateral (
  select count(*) filter (where stage not in ('won', 'lost')) as open_opportunities,
    sum(estimated_value) filter (where stage not in ('won', 'lost')) as pipeline_value,
    sum(estimated_value) filter (where stage = 'won') as won_value
  from public.opportunities where company_id = c.id
) o on true
left join lateral (select max(occurred_at) as last_activity from public.activities where company_id = c.id) a on true;

create or replace function public.search_crm(search_term text) returns table(type text, label text, detail text, href text) language sql stable security invoker set search_path = public as $$
  select * from (
    select 'Company', c.name, concat_ws(' · ', c.industry, c.city), '/companies/' || c.slug from public.companies c where (c.name || ' ' || coalesce(c.industry, '') || ' ' || coalesce(c.city, '')) ilike '%' || search_term || '%' limit 4
  ) companies
  union all select * from (
    select 'Contact', trim(ct.first_name || ' ' || ct.last_name), concat_ws(' · ', ct.job_title, c.name), '/contacts/' || ct.slug from public.contacts ct join public.companies c on c.id = ct.company_id where (ct.first_name || ' ' || ct.last_name || ' ' || c.name) ilike '%' || search_term || '%' limit 4
  ) contacts
  union all select * from (
    select 'Lead', l.company_name, l.service_interest, '/leads/' || l.slug from public.leads l where (l.company_name || ' ' || coalesce(l.contact_name, '') || ' ' || coalesce(l.service_interest, '')) ilike '%' || search_term || '%' limit 4
  ) leads
  union all select * from (
    select 'Opportunity', o.name, c.name, '/opportunities/' || o.slug from public.opportunities o join public.companies c on c.id = o.company_id where (o.name || ' ' || c.name) ilike '%' || search_term || '%' limit 4
  ) opportunities;
$$;

grant select on public.leads_view, public.contacts_view, public.opportunities_view, public.tasks_view, public.companies_summary to authenticated;
grant execute on function public.search_crm(text), public.convert_lead(jsonb, uuid) to authenticated;
