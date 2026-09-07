-- Keep privileged RLS helpers out of the exposed public API schema.
-- Public wrappers remain SECURITY INVOKER so existing policies and application
-- code keep their stable function names without exposing definer functions.

create schema if not exists private;
comment on schema private is 'Internal database helpers that must not be exposed through the Data API.';

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function private.can_view_owner(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.current_role() = 'admin'
    or owner = auth.uid()
    or (
      private.current_role() = 'sales_manager'
      and exists (
        select 1
        from public.profiles p
        where p.id = owner
          and (p.manager_id = auth.uid() or p.id = auth.uid())
      )
    );
$$;

create or replace function private.can_view_company(company uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.current_role() = 'admin'
    or exists (
      select 1
      from public.companies c
      where c.id = company
        and (
          private.can_view_owner(c.owner_id)
          or c.created_by = auth.uid()
          or exists (
            select 1
            from public.leads l
            where l.company_id = c.id
              and private.can_view_owner(l.assigned_to)
          )
          or exists (
            select 1
            from public.opportunities o
            where o.company_id = c.id
              and private.can_view_owner(o.assigned_to)
          )
        )
    );
$$;

create or replace function private.can_view_contact(contact uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.current_role() = 'admin'
    or exists (
      select 1
      from public.contacts c
      where c.id = contact
        and (
          private.can_view_owner(c.owner_id)
          or c.created_by = auth.uid()
          or exists (
            select 1
            from public.leads l
            where l.contact_id = c.id
              and private.can_view_owner(l.assigned_to)
          )
        )
    );
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.current_role(); $$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.is_active_user(); $$;

create or replace function public.can_view_owner(owner uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_view_owner(owner); $$;

create or replace function public.can_view_company(company uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_view_company(company); $$;

create or replace function public.can_view_contact(contact uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.can_view_contact(contact); $$;

revoke all on function public.current_role() from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.can_view_owner(uuid) from public, anon;
revoke all on function public.can_view_company(uuid) from public, anon;
revoke all on function public.can_view_contact(uuid) from public, anon;

grant execute on function public.current_role() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.can_view_owner(uuid) to authenticated, service_role;
grant execute on function public.can_view_company(uuid) to authenticated, service_role;
grant execute on function public.can_view_contact(uuid) to authenticated, service_role;

-- Trigger functions are invoked by their triggers and must not be callable as RPCs.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.prevent_profile_privilege_escalation() from public, anon, authenticated;
revoke all on function public.audit_crm_change() from public, anon, authenticated;
revoke all on function public.touch_contact_interaction() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Restrict the remaining application RPCs to the roles that actually use them.
revoke all on function public.normalize_phone(text) from public, anon;
revoke all on function public.find_contact_by_phone(text) from public, anon;
revoke all on function public.search_crm(text) from public, anon;

grant execute on function public.normalize_phone(text) to authenticated, service_role;
grant execute on function public.find_contact_by_phone(text) to authenticated, service_role;
grant execute on function public.search_crm(text) to authenticated, service_role;
