-- WWT CRM Phase 2 operational workspace.
-- Adds site visits, versioned quotations, tenders, private file storage,
-- reporting views and a transactional historical-lead import RPC.

do $$ begin
  create type public.site_visit_status as enum ('scheduled', 'completed', 'cancelled', 'rescheduled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quotation_status as enum ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tender_status as enum ('identified', 'reviewing', 'bid', 'no_bid', 'preparing', 'submitted', 'won', 'lost');
exception when duplicate_object then null; end $$;

-- Extend the existing Phase 1 audit trigger without replacing its history model.
create or replace function public.audit_crm_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare actor uuid := auth.uid();
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

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  assigned_employee_id uuid not null references public.profiles(id) on delete restrict,
  status public.site_visit_status not null default 'scheduled',
  scheduled_at timestamptz not null,
  site_location text not null,
  project_name text not null,
  contact_person text,
  phone text,
  project_type text,
  wastewater_requirement text,
  requested_capacity numeric(14,3) check (requested_capacity is null or requested_capacity >= 0),
  capacity_unit text,
  estimated_flow numeric(14,3) check (estimated_flow is null or estimated_flow >= 0),
  flow_unit text,
  number_of_users integer check (number_of_users is null or number_of_users >= 0),
  application_sector text,
  notes text,
  observations text,
  recommendation text,
  next_action text,
  follow_up_date date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_visit_files (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references public.site_visits(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.quotation_number_counters (
  quote_year integer primary key,
  last_number integer not null check (last_number > 0)
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  site_visit_id uuid references public.site_visits(id) on delete set null,
  project_name text not null,
  salesperson_id uuid not null references public.profiles(id) on delete restrict,
  status public.quotation_status not null default 'draft',
  current_version integer not null default 1 check (current_version > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  issue_date date not null,
  expiration_date date not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  terms text,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  subtotal numeric(14,2) not null default 0,
  line_discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  pdf_path text,
  pdf_generated_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quotation_id, version_number),
  check (expiration_date >= issue_date)
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null references public.quotation_versions(id) on delete cascade,
  position integer not null default 1 check (position > 0),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_percent numeric(7,4) not null default 0 check (discount_percent between 0 and 100),
  line_total numeric(14,2) generated always as (round((quantity * unit_price * (1 - discount_percent / 100.0))::numeric, 2)) stored,
  created_at timestamptz not null default now(),
  unique (quotation_version_id, position)
);

create table if not exists public.quotation_files (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  quotation_version_id uuid references public.quotation_versions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  customer_entity text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  reference_number text,
  description text,
  estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  deadline timestamptz not null,
  submission_date timestamptz,
  assigned_employee_id uuid not null references public.profiles(id) on delete restrict,
  source text,
  status public.tender_status not null default 'identified',
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tender_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  label text not null,
  is_completed boolean not null default false,
  position integer not null default 1 check (position > 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tender_id, position)
);

create table if not exists public.tender_files (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_imports (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  total_rows integer not null default 0,
  imported_leads integer not null default 0,
  new_contacts integer not null default 0,
  matched_contacts integer not null default 0,
  skipped_rows integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_import_records (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.lead_imports(id) on delete cascade,
  source_fingerprint text not null unique,
  source_sheet text not null,
  source_row integer not null check (source_row > 1),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.activities add column if not exists site_visit_id uuid references public.site_visits(id) on delete cascade;
alter table public.activities add column if not exists quotation_id uuid references public.quotations(id) on delete cascade;
alter table public.activities add column if not exists tender_id uuid references public.tenders(id) on delete cascade;

create index if not exists site_visits_assigned_status_date_idx on public.site_visits(assigned_employee_id, status, scheduled_at);
create index if not exists site_visits_lead_idx on public.site_visits(lead_id, scheduled_at desc);
create index if not exists site_visits_contact_idx on public.site_visits(contact_id, scheduled_at desc);
create index if not exists site_visit_files_visit_idx on public.site_visit_files(site_visit_id, created_at desc);
create index if not exists quotations_salesperson_status_idx on public.quotations(salesperson_id, status, updated_at desc);
create index if not exists quotations_lead_idx on public.quotations(lead_id, updated_at desc);
create index if not exists quotation_versions_quote_idx on public.quotation_versions(quotation_id, version_number desc);
create index if not exists quotation_items_version_idx on public.quotation_items(quotation_version_id, position);
create index if not exists tenders_assigned_status_deadline_idx on public.tenders(assigned_employee_id, status, deadline);
create index if not exists tenders_deadline_open_idx on public.tenders(deadline) where status not in ('won', 'lost', 'no_bid');
create index if not exists tender_checklist_tender_idx on public.tender_checklist_items(tender_id, position);
create index if not exists activities_site_visit_time_idx on public.activities(site_visit_id, occurred_at desc);
create index if not exists activities_quotation_time_idx on public.activities(quotation_id, occurred_at desc);
create index if not exists activities_tender_time_idx on public.activities(tender_id, occurred_at desc);
create index if not exists lead_import_records_import_idx on public.lead_import_records(import_id);

drop trigger if exists site_visits_updated on public.site_visits;
create trigger site_visits_updated before update on public.site_visits for each row execute function public.set_updated_at();
drop trigger if exists quotations_updated on public.quotations;
create trigger quotations_updated before update on public.quotations for each row execute function public.set_updated_at();
drop trigger if exists tenders_updated on public.tenders;
create trigger tenders_updated before update on public.tenders for each row execute function public.set_updated_at();

create or replace function public.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_year integer := extract(year from now())::integer;
  selected_number integer;
begin
  if new.quote_number is not null and trim(new.quote_number) <> '' then return new; end if;
  insert into public.quotation_number_counters(quote_year, last_number)
  values (selected_year, 1)
  on conflict (quote_year) do update set last_number = public.quotation_number_counters.last_number + 1
  returning last_number into selected_number;
  new.quote_number := 'Q-' || selected_year::text || '-' || lpad(selected_number::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists quotations_assign_number on public.quotations;
create trigger quotations_assign_number before insert on public.quotations for each row execute function public.assign_quote_number();

create or replace function public.recalculate_quotation_version(target_version uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  raw_subtotal numeric(14,2);
  item_discount numeric(14,2);
begin
  select coalesce(round(sum(quantity * unit_price)::numeric, 2), 0),
         coalesce(round(sum(quantity * unit_price - line_total)::numeric, 2), 0)
  into raw_subtotal, item_discount
  from public.quotation_items
  where quotation_version_id = target_version;

  update public.quotation_versions v
  set subtotal = raw_subtotal,
      line_discount_total = item_discount,
      tax_total = round(greatest(raw_subtotal - item_discount - v.discount_amount, 0) * v.tax_rate / 100.0, 2),
      total = round(greatest(raw_subtotal - item_discount - v.discount_amount, 0) * (1 + v.tax_rate / 100.0), 2)
  where v.id = target_version;
end;
$$;

create or replace function public.quotation_items_recalculate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.recalculate_quotation_version(coalesce(new.quotation_version_id, old.quotation_version_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists quotation_items_recalculate on public.quotation_items;
create trigger quotation_items_recalculate after insert or update or delete on public.quotation_items
for each row execute function public.quotation_items_recalculate();

create or replace function public.quotation_version_recalculate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.discount_amount is distinct from new.discount_amount or old.tax_rate is distinct from new.tax_rate then
    perform public.recalculate_quotation_version(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists quotation_version_recalculate on public.quotation_versions;
create trigger quotation_version_recalculate after update of discount_amount, tax_rate on public.quotation_versions
for each row execute function public.quotation_version_recalculate();

create or replace function private.can_view_site_visit(target uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.site_visits sv
    where sv.id = target and (
      private.current_role() = 'admin'
      or private.can_view_owner(sv.assigned_employee_id)
      or exists(select 1 from public.leads l where l.id = sv.lead_id and private.can_view_owner(l.assigned_to))
    )
  );
$$;

create or replace function private.can_view_quotation(target uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.quotations q
    where q.id = target and (
      private.current_role() = 'admin'
      or private.can_view_owner(q.salesperson_id)
      or exists(select 1 from public.leads l where l.id = q.lead_id and private.can_view_owner(l.assigned_to))
    )
  );
$$;

create or replace function private.can_view_tender(target uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.tenders t
    where t.id = target and (
      private.current_role() = 'admin'
      or private.can_view_owner(t.assigned_employee_id)
    )
  );
$$;

create or replace function private.can_access_crm_file_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  entity text := split_part(object_name, '/', 1);
  raw_id text := split_part(object_name, '/', 2);
  target uuid;
begin
  if raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  target := raw_id::uuid;
  return case entity
    when 'site-visits' then private.can_view_site_visit(target)
    when 'quotes' then private.can_view_quotation(target)
    when 'tenders' then private.can_view_tender(target)
    else false
  end;
exception when others then return false;
end;
$$;

revoke all on function private.can_view_site_visit(uuid), private.can_view_quotation(uuid), private.can_view_tender(uuid), private.can_access_crm_file_path(text) from public;
grant execute on function private.can_view_site_visit(uuid), private.can_view_quotation(uuid), private.can_view_tender(uuid), private.can_access_crm_file_path(text) to authenticated, service_role;

alter table public.site_visits enable row level security;
alter table public.site_visit_files enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_versions enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_files enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_checklist_items enable row level security;
alter table public.tender_files enable row level security;
alter table public.lead_imports enable row level security;
alter table public.lead_import_records enable row level security;
alter table public.quotation_number_counters enable row level security;

drop policy if exists site_visits_select on public.site_visits;
create policy site_visits_select on public.site_visits for select to authenticated using (private.can_view_site_visit(id));
drop policy if exists site_visits_insert on public.site_visits;
create policy site_visits_insert on public.site_visits for insert to authenticated with check (
  private.is_active_user() and created_by = auth.uid() and private.can_view_owner(assigned_employee_id)
  and private.can_view_contact(contact_id)
  and exists(select 1 from public.leads l where l.id = lead_id and l.contact_id = contact_id and private.can_view_owner(l.assigned_to))
);
drop policy if exists site_visits_update on public.site_visits;
create policy site_visits_update on public.site_visits for update to authenticated using (private.can_view_site_visit(id))
with check (
  private.can_view_owner(assigned_employee_id) and private.can_view_contact(contact_id)
  and exists(select 1 from public.leads l where l.id = lead_id and l.contact_id = contact_id and private.can_view_owner(l.assigned_to))
);

drop policy if exists site_visit_files_select on public.site_visit_files;
create policy site_visit_files_select on public.site_visit_files for select to authenticated using (private.can_view_site_visit(site_visit_id));
drop policy if exists site_visit_files_insert on public.site_visit_files;
create policy site_visit_files_insert on public.site_visit_files for insert to authenticated with check (uploaded_by = auth.uid() and private.can_view_site_visit(site_visit_id));
drop policy if exists site_visit_files_delete on public.site_visit_files;
create policy site_visit_files_delete on public.site_visit_files for delete to authenticated using (private.can_view_site_visit(site_visit_id) and (uploaded_by = auth.uid() or private.current_role() = 'admin'));

drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations for select to authenticated using (private.can_view_quotation(id));
drop policy if exists quotations_insert on public.quotations;
create policy quotations_insert on public.quotations for insert to authenticated with check (
  private.is_active_user() and created_by = auth.uid() and private.can_view_owner(salesperson_id)
  and private.can_view_contact(contact_id)
  and exists(select 1 from public.leads l where l.id = lead_id and l.contact_id = contact_id and private.can_view_owner(l.assigned_to))
  and (site_visit_id is null or exists(select 1 from public.site_visits sv where sv.id = site_visit_id and sv.contact_id = contact_id and sv.lead_id = lead_id and private.can_view_site_visit(sv.id)))
);
drop policy if exists quotations_update on public.quotations;
create policy quotations_update on public.quotations for update to authenticated using (private.can_view_quotation(id))
with check (
  private.can_view_owner(salesperson_id) and private.can_view_contact(contact_id)
  and exists(select 1 from public.leads l where l.id = lead_id and l.contact_id = contact_id and private.can_view_owner(l.assigned_to))
  and (site_visit_id is null or exists(select 1 from public.site_visits sv where sv.id = site_visit_id and sv.contact_id = contact_id and sv.lead_id = lead_id and private.can_view_site_visit(sv.id)))
);

drop policy if exists quotation_versions_select on public.quotation_versions;
create policy quotation_versions_select on public.quotation_versions for select to authenticated using (private.can_view_quotation(quotation_id));
drop policy if exists quotation_versions_insert on public.quotation_versions;
create policy quotation_versions_insert on public.quotation_versions for insert to authenticated with check (created_by = auth.uid() and private.can_view_quotation(quotation_id));
drop policy if exists quotation_versions_update on public.quotation_versions;
create policy quotation_versions_update on public.quotation_versions for update to authenticated using (
  exists(select 1 from public.quotations q where q.id = quotation_id and q.current_version = version_number and q.status in ('draft', 'pending_approval') and private.can_view_quotation(q.id))
) with check (private.can_view_quotation(quotation_id));

drop policy if exists quotation_items_select on public.quotation_items;
create policy quotation_items_select on public.quotation_items for select to authenticated using (
  exists(select 1 from public.quotation_versions v where v.id = quotation_version_id and private.can_view_quotation(v.quotation_id))
);
drop policy if exists quotation_items_insert on public.quotation_items;
create policy quotation_items_insert on public.quotation_items for insert to authenticated with check (
  exists(select 1 from public.quotation_versions v join public.quotations q on q.id = v.quotation_id where v.id = quotation_version_id and q.current_version = v.version_number and q.status = 'draft' and private.can_view_quotation(q.id))
);
drop policy if exists quotation_items_update on public.quotation_items;
create policy quotation_items_update on public.quotation_items for update to authenticated using (
  exists(select 1 from public.quotation_versions v join public.quotations q on q.id = v.quotation_id where v.id = quotation_version_id and q.current_version = v.version_number and q.status = 'draft' and private.can_view_quotation(q.id))
) with check (
  exists(select 1 from public.quotation_versions v join public.quotations q on q.id = v.quotation_id where v.id = quotation_version_id and q.current_version = v.version_number and q.status = 'draft' and private.can_view_quotation(q.id))
);
drop policy if exists quotation_items_delete on public.quotation_items;
create policy quotation_items_delete on public.quotation_items for delete to authenticated using (
  exists(select 1 from public.quotation_versions v join public.quotations q on q.id = v.quotation_id where v.id = quotation_version_id and q.current_version = v.version_number and q.status = 'draft' and private.can_view_quotation(q.id))
);

drop policy if exists quotation_files_select on public.quotation_files;
create policy quotation_files_select on public.quotation_files for select to authenticated using (private.can_view_quotation(quotation_id));
drop policy if exists quotation_files_insert on public.quotation_files;
create policy quotation_files_insert on public.quotation_files for insert to authenticated with check (uploaded_by = auth.uid() and private.can_view_quotation(quotation_id));
drop policy if exists quotation_files_delete on public.quotation_files;
create policy quotation_files_delete on public.quotation_files for delete to authenticated using (private.can_view_quotation(quotation_id) and (uploaded_by = auth.uid() or private.current_role() = 'admin'));

drop policy if exists tenders_select on public.tenders;
create policy tenders_select on public.tenders for select to authenticated using (private.can_view_tender(id));
drop policy if exists tenders_insert on public.tenders;
create policy tenders_insert on public.tenders for insert to authenticated with check (private.is_active_user() and created_by = auth.uid() and private.can_view_owner(assigned_employee_id) and (contact_id is null or private.can_view_contact(contact_id)));
drop policy if exists tenders_update on public.tenders;
create policy tenders_update on public.tenders for update to authenticated using (private.can_view_tender(id)) with check (private.can_view_owner(assigned_employee_id) and (contact_id is null or private.can_view_contact(contact_id)));

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  user_id = auth.uid() or private.current_role() = 'admin' or
  (contact_id is not null and private.can_view_contact(contact_id)) or
  (lead_id is not null and exists(select 1 from public.leads l where l.id = lead_id and private.can_view_owner(l.assigned_to))) or
  (company_id is not null and private.can_view_company(company_id)) or
  (opportunity_id is not null and exists(select 1 from public.opportunities o where o.id = opportunity_id and private.can_view_owner(o.assigned_to))) or
  (site_visit_id is not null and private.can_view_site_visit(site_visit_id)) or
  (quotation_id is not null and private.can_view_quotation(quotation_id)) or
  (tender_id is not null and private.can_view_tender(tender_id))
);

drop policy if exists tender_checklist_select on public.tender_checklist_items;
create policy tender_checklist_select on public.tender_checklist_items for select to authenticated using (private.can_view_tender(tender_id));
drop policy if exists tender_checklist_insert on public.tender_checklist_items;
create policy tender_checklist_insert on public.tender_checklist_items for insert to authenticated with check (private.can_view_tender(tender_id));
drop policy if exists tender_checklist_update on public.tender_checklist_items;
create policy tender_checklist_update on public.tender_checklist_items for update to authenticated using (private.can_view_tender(tender_id)) with check (private.can_view_tender(tender_id));
drop policy if exists tender_checklist_delete on public.tender_checklist_items;
create policy tender_checklist_delete on public.tender_checklist_items for delete to authenticated using (private.can_view_tender(tender_id));

drop policy if exists tender_files_select on public.tender_files;
create policy tender_files_select on public.tender_files for select to authenticated using (private.can_view_tender(tender_id));
drop policy if exists tender_files_insert on public.tender_files;
create policy tender_files_insert on public.tender_files for insert to authenticated with check (uploaded_by = auth.uid() and private.can_view_tender(tender_id));
drop policy if exists tender_files_delete on public.tender_files;
create policy tender_files_delete on public.tender_files for delete to authenticated using (private.can_view_tender(tender_id) and (uploaded_by = auth.uid() or private.current_role() = 'admin'));

drop policy if exists lead_imports_select on public.lead_imports;
create policy lead_imports_select on public.lead_imports for select to authenticated using (private.current_role() in ('admin', 'sales_manager'));
drop policy if exists lead_imports_insert on public.lead_imports;
create policy lead_imports_insert on public.lead_imports for insert to authenticated with check (created_by = auth.uid() and private.current_role() in ('admin', 'sales_manager'));
drop policy if exists lead_imports_update on public.lead_imports;
create policy lead_imports_update on public.lead_imports for update to authenticated using (created_by = auth.uid() and private.current_role() in ('admin', 'sales_manager')) with check (created_by = auth.uid());
drop policy if exists lead_import_records_select on public.lead_import_records;
create policy lead_import_records_select on public.lead_import_records for select to authenticated using (private.current_role() in ('admin', 'sales_manager'));
drop policy if exists lead_import_records_insert on public.lead_import_records;
create policy lead_import_records_insert on public.lead_import_records for insert to authenticated with check (
  private.current_role() in ('admin', 'sales_manager') and exists(select 1 from public.lead_imports i where i.id = import_id and i.created_by = auth.uid())
);

create or replace function public.enforce_quotation_changes()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.salesperson_id is distinct from new.salesperson_id and private.current_role() not in ('admin', 'sales_manager') then
    raise exception 'Only an administrator or sales manager may reassign a quotation';
  end if;
  if new.status = 'approved' and old.status is distinct from new.status and private.current_role() not in ('admin', 'sales_manager') then
    raise exception 'Only an administrator or sales manager may approve a quotation';
  end if;
  return new;
end;
$$;

create or replace function public.validate_quotation_links()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists(select 1 from public.leads l where l.id = new.lead_id and l.contact_id = new.contact_id) then
    raise exception 'Quotation lead and contact do not match';
  end if;
  if new.site_visit_id is not null and not exists(
    select 1 from public.site_visits sv
    where sv.id = new.site_visit_id and sv.contact_id = new.contact_id and sv.lead_id = new.lead_id
  ) then
    raise exception 'Quotation site visit does not match its lead and contact';
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_enforce_changes on public.quotations;
create trigger quotations_enforce_changes before update on public.quotations for each row execute function public.enforce_quotation_changes();
drop trigger if exists quotations_validate_links on public.quotations;
create trigger quotations_validate_links before insert or update of contact_id, lead_id, site_visit_id on public.quotations for each row execute function public.validate_quotation_links();

create or replace function public.audit_phase2_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid();
begin
  if tg_table_name = 'site_visits' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, site_visit_id, user_id)
    values ('site_visit_scheduled', 'Site visit scheduled', new.project_name, new.contact_id, new.lead_id, new.id, actor);
  elsif tg_table_name = 'site_visits' and tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, site_visit_id, user_id, metadata)
    values (case when new.status = 'completed' then 'site_visit_completed'::public.activity_type else 'site_visit'::public.activity_type end,
      'Site visit ' || replace(new.status::text, '_', ' '), new.project_name, new.contact_id, new.lead_id, new.id, actor,
      jsonb_build_object('from', old.status, 'to', new.status));
  elsif tg_table_name = 'quotations' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, quotation_id, user_id)
    values ('quote_created', 'Quotation created', new.quote_number || ' · ' || new.project_name, new.contact_id, new.lead_id, new.id, actor);
  elsif tg_table_name = 'quotations' and tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, quotation_id, user_id, metadata)
    values (case new.status when 'sent' then 'quote_sent'::public.activity_type when 'accepted' then 'quote_accepted'::public.activity_type when 'rejected' then 'quote_rejected'::public.activity_type else 'system'::public.activity_type end,
      'Quotation ' || replace(new.status::text, '_', ' '), new.quote_number || ' · ' || new.project_name, new.contact_id, new.lead_id, new.id, actor,
      jsonb_build_object('from', old.status, 'to', new.status, 'version', new.current_version));
  elsif tg_table_name = 'tenders' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, tender_id, user_id)
    values ('tender_created', 'Tender created', new.title, new.contact_id, new.id, actor);
  elsif tg_table_name = 'tenders' and tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.activities(activity_type, subject, description, contact_id, tender_id, user_id, metadata)
    values ('system', 'Tender ' || replace(new.status::text, '_', ' '), new.title, new.contact_id, new.id, actor, jsonb_build_object('from', old.status, 'to', new.status));
  elsif tg_table_name = 'site_visit_files' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, site_visit_id, user_id)
    select 'file_uploaded', 'File uploaded', new.file_name, sv.contact_id, sv.lead_id, new.site_visit_id, actor
    from public.site_visits sv where sv.id = new.site_visit_id;
  elsif tg_table_name = 'quotation_files' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, lead_id, quotation_id, user_id)
    select 'file_uploaded', 'File uploaded', new.file_name, q.contact_id, q.lead_id, new.quotation_id, actor
    from public.quotations q where q.id = new.quotation_id;
  elsif tg_table_name = 'tender_files' and tg_op = 'INSERT' then
    insert into public.activities(activity_type, subject, description, contact_id, tender_id, user_id)
    select 'file_uploaded', 'File uploaded', new.file_name, t.contact_id, new.tender_id, actor
    from public.tenders t where t.id = new.tender_id;
  end if;
  return new;
end;
$$;

drop trigger if exists site_visits_audit on public.site_visits;
create trigger site_visits_audit after insert or update on public.site_visits for each row execute function public.audit_phase2_change();
drop trigger if exists quotations_audit on public.quotations;
create trigger quotations_audit after insert or update on public.quotations for each row execute function public.audit_phase2_change();
drop trigger if exists tenders_audit on public.tenders;
create trigger tenders_audit after insert or update on public.tenders for each row execute function public.audit_phase2_change();
drop trigger if exists site_visit_files_audit on public.site_visit_files;
create trigger site_visit_files_audit after insert on public.site_visit_files for each row execute function public.audit_phase2_change();
drop trigger if exists quotation_files_audit on public.quotation_files;
create trigger quotation_files_audit after insert on public.quotation_files for each row execute function public.audit_phase2_change();
drop trigger if exists tender_files_audit on public.tender_files;
create trigger tender_files_audit after insert on public.tender_files for each row execute function public.audit_phase2_change();

create or replace function public.create_quotation(payload jsonb, actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  quote_id uuid;
  version_id uuid;
  quote_slug text;
  item jsonb;
  item_position integer := 0;
begin
  if actor_id is distinct from auth.uid() or not private.is_active_user() then raise exception 'Invalid CRM actor'; end if;
  if not private.can_view_owner((payload->>'salesperson_id')::uuid) then raise exception 'Assignment is not permitted'; end if;

  insert into public.quotations(quote_number, contact_id, lead_id, site_visit_id, project_name, salesperson_id, status, current_version, created_by)
  values (null, (payload->>'contact_id')::uuid, (payload->>'lead_id')::uuid, nullif(payload->>'site_visit_id', '')::uuid,
    payload->>'project_name', (payload->>'salesperson_id')::uuid, 'draft', 1, actor_id)
  returning id, quote_number into quote_id, quote_slug;

  insert into public.quotation_versions(quotation_id, version_number, issue_date, expiration_date, currency, notes, terms, discount_amount, tax_rate, created_by)
  values (quote_id, 1, (payload->>'issue_date')::date, (payload->>'expiration_date')::date, upper(payload->>'currency'),
    nullif(payload->>'notes', ''), nullif(payload->>'terms', ''), coalesce((payload->>'discount_amount')::numeric, 0), coalesce((payload->>'tax_rate')::numeric, 0), actor_id)
  returning id into version_id;

  for item in select * from jsonb_array_elements(payload->'items') loop
    item_position := item_position + 1;
    insert into public.quotation_items(quotation_version_id, position, description, quantity, unit, unit_price, discount_percent)
    values (version_id, item_position, item->>'description', (item->>'quantity')::numeric, item->>'unit', (item->>'unit_price')::numeric, coalesce((item->>'discount_percent')::numeric, 0));
  end loop;

  return jsonb_build_object('id', quote_id, 'quote_number', quote_slug, 'version_id', version_id);
end;
$$;

create or replace function public.save_quotation_revision(target_quotation uuid, payload jsonb, actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  quote_row public.quotations%rowtype;
  current_version_id uuid;
  next_version_id uuid;
  next_version_number integer;
  item jsonb;
  item_position integer := 0;
begin
  if actor_id is distinct from auth.uid() or not private.is_active_user() then raise exception 'Invalid CRM actor'; end if;
  select * into quote_row from public.quotations where id = target_quotation for update;
  if quote_row.id is null or not private.can_view_quotation(quote_row.id) then raise exception 'Quotation is not accessible'; end if;

  select id into current_version_id from public.quotation_versions where quotation_id = target_quotation and version_number = quote_row.current_version;
  if quote_row.status in ('sent', 'accepted', 'rejected', 'expired') then
    next_version_number := quote_row.current_version + 1;
    update public.quotations set current_version = next_version_number, status = 'draft', project_name = payload->>'project_name',
      salesperson_id = (payload->>'salesperson_id')::uuid, site_visit_id = nullif(payload->>'site_visit_id', '')::uuid where id = target_quotation;
    insert into public.quotation_versions(quotation_id, version_number, issue_date, expiration_date, currency, notes, terms, discount_amount, tax_rate, created_by)
    values (target_quotation, next_version_number, (payload->>'issue_date')::date, (payload->>'expiration_date')::date, upper(payload->>'currency'),
      nullif(payload->>'notes', ''), nullif(payload->>'terms', ''), coalesce((payload->>'discount_amount')::numeric, 0), coalesce((payload->>'tax_rate')::numeric, 0), actor_id)
    returning id into next_version_id;
  else
    next_version_number := quote_row.current_version;
    next_version_id := current_version_id;
    update public.quotations set project_name = payload->>'project_name', salesperson_id = (payload->>'salesperson_id')::uuid,
      site_visit_id = nullif(payload->>'site_visit_id', '')::uuid, status = 'draft' where id = target_quotation;
    update public.quotation_versions set issue_date = (payload->>'issue_date')::date, expiration_date = (payload->>'expiration_date')::date,
      currency = upper(payload->>'currency'), notes = nullif(payload->>'notes', ''), terms = nullif(payload->>'terms', ''),
      discount_amount = coalesce((payload->>'discount_amount')::numeric, 0), tax_rate = coalesce((payload->>'tax_rate')::numeric, 0)
    where id = next_version_id;
    delete from public.quotation_items where quotation_version_id = next_version_id;
  end if;

  for item in select * from jsonb_array_elements(payload->'items') loop
    item_position := item_position + 1;
    insert into public.quotation_items(quotation_version_id, position, description, quantity, unit, unit_price, discount_percent)
    values (next_version_id, item_position, item->>'description', (item->>'quantity')::numeric, item->>'unit', (item->>'unit_price')::numeric, coalesce((item->>'discount_percent')::numeric, 0));
  end loop;
  perform public.recalculate_quotation_version(next_version_id);
  return jsonb_build_object('id', target_quotation, 'version_id', next_version_id, 'version_number', next_version_number);
end;
$$;

create or replace function public.attach_quotation_pdf(target_version uuid, storage_object_path text, actor_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_quote uuid;
begin
  if actor_id is distinct from auth.uid() or not private.is_active_user() then raise exception 'Invalid CRM actor'; end if;
  select quotation_id into target_quote from public.quotation_versions where id = target_version;
  if target_quote is null or not private.can_view_quotation(target_quote) then raise exception 'Quotation version is not accessible'; end if;
  if storage_object_path <> 'quotes/' || target_quote::text || '/' || split_part(storage_object_path, '/', 3) then
    raise exception 'Invalid quotation PDF path';
  end if;
  update public.quotation_versions set pdf_path = storage_object_path, pdf_generated_at = now() where id = target_version;
end;
$$;

create or replace function public.set_quotation_status(target_quotation uuid, next_status public.quotation_status, move_lead_to_won boolean, actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  target_lead uuid;
  updated_lead uuid;
begin
  if actor_id is distinct from auth.uid() or not private.is_active_user() then raise exception 'Invalid CRM actor'; end if;
  if next_status = 'approved' and private.current_role() not in ('admin', 'sales_manager') then raise exception 'Quotation approval is not permitted'; end if;
  if move_lead_to_won and next_status <> 'accepted' then raise exception 'Only an accepted quotation can close its lead'; end if;

  update public.quotations
  set status = next_status
  where id = target_quotation
  returning lead_id into target_lead;
  if target_lead is null then raise exception 'Quotation is not accessible'; end if;

  if next_status = 'accepted' and move_lead_to_won then
    update public.leads set status = 'won' where id = target_lead returning id into updated_lead;
    if updated_lead is null then raise exception 'Linked lead could not be moved to Won'; end if;
  end if;
  return jsonb_build_object('id', target_quotation, 'lead_id', target_lead, 'status', next_status, 'lead_moved_to_won', updated_lead is not null);
end;
$$;

create or replace function public.save_tender(target_tender uuid, payload jsonb, actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  saved_id uuid;
  checklist_item jsonb;
  item_position integer := 0;
begin
  if actor_id is distinct from auth.uid() or not private.is_active_user() then raise exception 'Invalid CRM actor'; end if;
  if not private.can_view_owner((payload->>'assigned_employee_id')::uuid) then raise exception 'Assignment is not permitted'; end if;
  if target_tender is null then
    insert into public.tenders(title, customer_entity, contact_id, reference_number, description, estimated_value, currency,
      deadline, submission_date, assigned_employee_id, source, status, notes, created_by)
    values (payload->>'title', payload->>'customer_entity', nullif(payload->>'contact_id', '')::uuid, nullif(payload->>'reference_number', ''),
      nullif(payload->>'description', ''), nullif(payload->>'estimated_value', '')::numeric, upper(payload->>'currency'),
      (payload->>'deadline')::timestamptz, nullif(payload->>'submission_date', '')::timestamptz,
      (payload->>'assigned_employee_id')::uuid, nullif(payload->>'source', ''), (payload->>'status')::public.tender_status,
      nullif(payload->>'notes', ''), actor_id)
    returning id into saved_id;
  else
    if not private.can_view_tender(target_tender) then raise exception 'Tender is not accessible'; end if;
    update public.tenders set title = payload->>'title', customer_entity = payload->>'customer_entity',
      contact_id = nullif(payload->>'contact_id', '')::uuid, reference_number = nullif(payload->>'reference_number', ''),
      description = nullif(payload->>'description', ''), estimated_value = nullif(payload->>'estimated_value', '')::numeric,
      currency = upper(payload->>'currency'), deadline = (payload->>'deadline')::timestamptz,
      submission_date = nullif(payload->>'submission_date', '')::timestamptz,
      assigned_employee_id = (payload->>'assigned_employee_id')::uuid, source = nullif(payload->>'source', ''),
      status = (payload->>'status')::public.tender_status, notes = nullif(payload->>'notes', '')
    where id = target_tender returning id into saved_id;
    delete from public.tender_checklist_items where tender_id = saved_id;
  end if;
  for checklist_item in select * from jsonb_array_elements(payload->'checklist') loop
    item_position := item_position + 1;
    insert into public.tender_checklist_items(tender_id, label, is_completed, position, completed_at, completed_by)
    values (saved_id, checklist_item->>'label', coalesce((checklist_item->>'is_completed')::boolean, false), item_position,
      case when coalesce((checklist_item->>'is_completed')::boolean, false) then now() else null end,
      case when coalesce((checklist_item->>'is_completed')::boolean, false) then actor_id else null end);
  end loop;
  return jsonb_build_object('id', saved_id);
end;
$$;

create or replace function public.import_historical_leads(payload jsonb, actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  batch_id uuid;
  row_data jsonb;
  target_contact uuid;
  target_lead uuid;
  target_owner uuid;
  normalized text;
  contact_slug text;
  lead_slug text;
  imported_count integer := 0;
  new_contact_count integer := 0;
  matched_contact_count integer := 0;
  skipped_count integer := 0;
begin
  if actor_id is distinct from auth.uid() or private.current_role() not in ('admin', 'sales_manager') then raise exception 'Import is not permitted'; end if;
  insert into public.lead_imports(source_name, total_rows, created_by)
  values (left(payload->>'source_name', 240), jsonb_array_length(payload->'rows'), actor_id)
  returning id into batch_id;

  for row_data in select * from jsonb_array_elements(payload->'rows') loop
    if exists(select 1 from public.lead_import_records where source_fingerprint = row_data->>'fingerprint') then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    normalized := public.normalize_phone(row_data->>'phone');
    if normalized is null then skipped_count := skipped_count + 1; continue; end if;
    target_owner := coalesce(nullif(row_data->>'assigned_to', '')::uuid, actor_id);
    if not private.can_view_owner(target_owner) then target_owner := actor_id; end if;
    target_contact := null;
    select c.id into target_contact from public.contacts c
    where c.phone_normalized = normalized or c.whatsapp_normalized = normalized
    order by c.last_interaction_at desc nulls last, c.created_at limit 1;
    if target_contact is null then
      contact_slug := left(regexp_replace(lower(coalesce(nullif(row_data->>'full_name', ''), normalized)), '[^a-z0-9]+', '-', 'g'), 60) || '-' || substr(gen_random_uuid()::text, 1, 6);
      insert into public.contacts(slug, full_name, first_name, last_name, phone, email, location_text, organization_name, notes, owner_id, created_by)
      values (contact_slug, coalesce(nullif(row_data->>'full_name', ''), normalized), nullif(split_part(row_data->>'full_name', ' ', 1), ''),
        nullif(trim(substr(row_data->>'full_name', length(split_part(row_data->>'full_name', ' ', 1)) + 1)), ''), row_data->>'phone',
        nullif(row_data->>'email', ''), nullif(row_data->>'location_text', ''), nullif(row_data->>'organization_name', ''), null, target_owner, actor_id)
      returning id into target_contact;
      new_contact_count := new_contact_count + 1;
    else
      matched_contact_count := matched_contact_count + 1;
    end if;
    lead_slug := 'imported-lead-' || substr(gen_random_uuid()::text, 1, 12);
    insert into public.leads(slug, contact_id, company_name, contact_name, phone, email, location_text, source, service_interest, message,
      status, priority, assigned_to, created_by, next_follow_up_at, campaign_source, customer_need, notes, received_at)
    values (lead_slug, target_contact, nullif(row_data->>'organization_name', ''), nullif(row_data->>'full_name', ''), row_data->>'phone',
      nullif(row_data->>'email', ''), nullif(row_data->>'location_text', ''), coalesce(nullif(row_data->>'source', ''), 'other'),
      row_data->>'customer_need', nullif(row_data->>'original_message', ''), (row_data->>'status')::public.lead_status, 'medium', target_owner, actor_id,
      nullif(row_data->>'next_follow_up_at', '')::timestamptz, nullif(row_data->>'campaign_source', ''), row_data->>'customer_need',
      nullif(row_data->>'notes', ''), (row_data->>'received_at')::timestamptz)
    returning id into target_lead;
    insert into public.lead_import_records(import_id, source_fingerprint, source_sheet, source_row, contact_id, lead_id)
    values (batch_id, row_data->>'fingerprint', row_data->>'source_sheet', (row_data->>'source_row')::integer, target_contact, target_lead);
    imported_count := imported_count + 1;
  end loop;

  update public.lead_imports set imported_leads = imported_count, new_contacts = new_contact_count, matched_contacts = matched_contact_count,
    skipped_rows = skipped_count, summary = jsonb_build_object('imported', imported_count, 'new_contacts', new_contact_count, 'matched_contacts', matched_contact_count, 'skipped', skipped_count)
  where id = batch_id;
  return jsonb_build_object('import_id', batch_id, 'imported', imported_count, 'new_contacts', new_contact_count, 'matched_contacts', matched_contact_count, 'skipped', skipped_count);
end;
$$;

drop view if exists public.site_visits_view;
create view public.site_visits_view with (security_invoker = true) as
select sv.*, c.full_name as contact_name, l.customer_need as lead_need, p.full_name as assigned_name,
  (select count(*)::integer from public.site_visit_files f where f.site_visit_id = sv.id) as file_count
from public.site_visits sv
join public.contacts c on c.id = sv.contact_id
join public.leads l on l.id = sv.lead_id
join public.profiles p on p.id = sv.assigned_employee_id;

drop view if exists public.quotation_current_view;
create view public.quotation_current_view with (security_invoker = true) as
select q.id, q.quote_number, q.contact_id, c.full_name as contact_name, q.lead_id, l.customer_need as lead_need,
  q.site_visit_id, q.project_name, q.salesperson_id, p.full_name as salesperson_name, q.status, q.current_version,
  v.id as version_id, v.issue_date, v.expiration_date, v.currency, v.notes, v.terms, v.discount_amount,
  v.tax_rate, v.subtotal, v.line_discount_total, v.tax_total, v.total, v.pdf_path, v.pdf_generated_at,
  q.created_at, q.updated_at
from public.quotations q
join public.quotation_versions v on v.quotation_id = q.id and v.version_number = q.current_version
join public.contacts c on c.id = q.contact_id
join public.leads l on l.id = q.lead_id
join public.profiles p on p.id = q.salesperson_id;

drop view if exists public.tenders_view;
create view public.tenders_view with (security_invoker = true) as
select t.*, c.full_name as contact_name, p.full_name as assigned_name,
  count(ci.id)::integer as checklist_count,
  count(ci.id) filter (where ci.is_completed)::integer as checklist_completed
from public.tenders t
left join public.contacts c on c.id = t.contact_id
join public.profiles p on p.id = t.assigned_employee_id
left join public.tender_checklist_items ci on ci.tender_id = t.id
group by t.id, c.full_name, p.full_name;

create or replace function public.search_crm(search_term text)
returns table(type text, label text, detail text, href text)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'Contact', c.full_name, concat_ws(' · ', c.phone, c.organization_name), '/contacts/' || c.slug
    from public.contacts c
    where (c.full_name || ' ' || coalesce(c.phone, '') || ' ' || coalesce(c.phone_normalized, '') || ' ' || coalesce(c.whatsapp_normalized, '') || ' ' || coalesce(c.email, '') || ' ' || coalesce(c.organization_name, '')) ilike '%' || search_term || '%'
    limit 5
  ) contacts
  union all select * from (
    select 'Lead', coalesce(c.full_name, l.phone), concat_ws(' · ', l.customer_need, l.location_text), '/leads/' || l.slug
    from public.leads l join public.contacts c on c.id = l.contact_id
    where (c.full_name || ' ' || coalesce(l.phone, '') || ' ' || l.customer_need || ' ' || coalesce(l.location_text, '')) ilike '%' || search_term || '%'
    limit 5
  ) leads
  union all select * from (
    select 'Site visit', sv.project_name, concat_ws(' · ', c.full_name, sv.site_location), '/site-visits/' || sv.id
    from public.site_visits sv join public.contacts c on c.id = sv.contact_id
    where (sv.project_name || ' ' || c.full_name || ' ' || sv.site_location || ' ' || coalesce(sv.phone, '')) ilike '%' || search_term || '%'
    limit 5
  ) visits
  union all select * from (
    select 'Quote', q.quote_number, concat_ws(' · ', c.full_name, q.project_name), '/quotes/' || q.id
    from public.quotations q join public.contacts c on c.id = q.contact_id
    where (q.quote_number || ' ' || q.project_name || ' ' || c.full_name) ilike '%' || search_term || '%'
    limit 5
  ) quotes
  union all select * from (
    select 'Tender', coalesce(t.reference_number, t.title), concat_ws(' · ', t.title, t.customer_entity), '/tenders/' || t.id
    from public.tenders t
    where (t.title || ' ' || t.customer_entity || ' ' || coalesce(t.reference_number, '')) ilike '%' || search_term || '%'
    limit 5
  ) tenders;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('crm-files', 'crm-files', false, 15728640, array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/dwg','application/dxf','text/plain']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists crm_files_select on storage.objects;
create policy crm_files_select on storage.objects for select to authenticated using (bucket_id = 'crm-files' and private.can_access_crm_file_path(name));
drop policy if exists crm_files_insert on storage.objects;
create policy crm_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'crm-files' and private.is_active_user() and private.can_access_crm_file_path(name));
drop policy if exists crm_files_update on storage.objects;
create policy crm_files_update on storage.objects for update to authenticated using (bucket_id = 'crm-files' and private.can_access_crm_file_path(name)) with check (bucket_id = 'crm-files' and private.is_active_user() and private.can_access_crm_file_path(name));
drop policy if exists crm_files_delete on storage.objects;
create policy crm_files_delete on storage.objects for delete to authenticated using (bucket_id = 'crm-files' and private.can_access_crm_file_path(name) and (owner_id = auth.uid()::text or private.current_role() = 'admin'));

grant select, insert, update on public.site_visits, public.site_visit_files, public.quotations, public.quotation_versions,
  public.quotation_items, public.quotation_files, public.tenders, public.tender_checklist_items, public.tender_files,
  public.lead_imports, public.lead_import_records to authenticated;
grant delete on public.site_visit_files, public.quotation_items, public.quotation_files, public.tender_checklist_items, public.tender_files to authenticated;
grant select on public.site_visits_view, public.quotation_current_view, public.tenders_view to authenticated;
revoke all on public.quotation_number_counters from public, anon, authenticated;

revoke all on function public.assign_quote_number(), public.recalculate_quotation_version(uuid), public.quotation_items_recalculate(),
  public.quotation_version_recalculate(), public.enforce_quotation_changes(), public.validate_quotation_links(), public.audit_phase2_change() from public, anon, authenticated;
revoke all on function public.create_quotation(jsonb, uuid), public.save_quotation_revision(uuid, jsonb, uuid), public.attach_quotation_pdf(uuid, text, uuid), public.set_quotation_status(uuid, public.quotation_status, boolean, uuid),
  public.save_tender(uuid, jsonb, uuid), public.import_historical_leads(jsonb, uuid) from public, anon;
grant execute on function public.create_quotation(jsonb, uuid), public.save_quotation_revision(uuid, jsonb, uuid), public.attach_quotation_pdf(uuid, text, uuid), public.set_quotation_status(uuid, public.quotation_status, boolean, uuid),
  public.save_tender(uuid, jsonb, uuid), public.import_historical_leads(jsonb, uuid) to authenticated;
grant execute on function public.search_crm(text) to authenticated;
