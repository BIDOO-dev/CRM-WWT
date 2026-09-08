-- Evaluate ownership from the candidate contact row so INSERT ... RETURNING
-- works for sales representatives while preserving contact visibility rules.
drop policy if exists contacts_select on public.contacts;

create policy contacts_select
on public.contacts
for select
to authenticated
using (
  (select public.current_role()) = 'admin'
  or public.can_view_owner(owner_id)
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.leads l
    where l.contact_id = contacts.id
      and public.can_view_owner(l.assigned_to)
  )
);
