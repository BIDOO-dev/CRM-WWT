# WWT CRM — Phase 1

WWT CRM is an internal, responsive sales workspace for Waste Water Treatment / Recyco. It is organized around WWT's inbound workflow: one contact record per person, multiple leads per contact, follow-ups and a permanent customer timeline.

## Phase 1 scope

- Supabase email/password authentication with login, logout, reset flow, server-side session refresh and protected routes
- Role model for `admin`, `sales_manager` and `sales_rep`
- RLS policies that scope sales representatives to their records, managers to their team and administrators to the WWT-wide workspace
- Lead-focused dashboard metrics, source/receiving-number performance, tasks and recent activities
- Searchable/filterable contacts and leads, including normalized phone lookup
- Lead detail, manual customer-need editing, activity notes and full pipeline stage changes
- Drag-and-drop lead pipeline with failed-write rollback and list view
- Contact detail with multiple independent leads, tasks and activity history
- Mobile-friendly contact calling, email and official WhatsApp deep links (no WhatsApp automation)
- Task views, creation and quick completion with audit entries
- Clearly marked Phase 2 surfaces for site visits, quotes, tenders and reports

The application uses Supabase by default in every environment. Development preview data is available only when `NEXT_PUBLIC_WWT_DEMO_MODE=true` is set explicitly.

## Local setup

Requirements: Node.js 20.19+ (or 22.12+) and a Supabase project. Docker is also required if you use the local Supabase stack.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and publishable key.
4. Apply all migrations in `supabase/migrations` in timestamp order. Existing installations must apply `20260907170000_contact_lead_first_crm.sql` after the Phase 1 migration.
5. Run `npm run dev`.

For a local Supabase environment, install the Supabase CLI and run `supabase start`, then `supabase db reset`. The reset applies the migration and loads `supabase/seed.sql`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy alternative | Supported for older Supabase projects |
| `NEXT_PUBLIC_WWT_DEMO_MODE` | No (must remain `false` for live data) | Explicitly enables preview data only when set to `true`; never enable for deployment |

There is deliberately no service-role key in this application. Browser and server requests both run as the signed-in user and are constrained by PostgreSQL RLS.

## Creating the first administrator

Public signup is disabled.

1. In Supabase Dashboard, open **Authentication → Users** and invite or create the first WWT employee.
2. The database trigger creates a matching `profiles` row automatically with the `sales_rep` role.
3. In the SQL editor, promote that known user once:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrator name'
where email = 'administrator@wwt.com.lb';
```

Future user and team administration belongs in the protected Settings area. Do not add public signup to work around this bootstrap step.

### Local seed accounts

`supabase/seed.sql` is development-only. It creates these fictional users with password `Demo123!`:

- `rami@wwt.local` — sales manager
- `maya@wwt.local` — sales representative
- `sami@wwt.local` — sales representative

## Data and authorization design

- Auth identities live in `auth.users`; application attributes live in `public.profiles`.
- `manager_id` provides a minimal team hierarchy without introducing a premature team-management module.
- Contacts are the customer identity. Phone and WhatsApp values receive indexed normalized keys so future webhooks can reuse an existing person.
- Every customer request is a lead. One contact can have any number of leads, each with its own need, stage, assignee, source and follow-up.
- Leads preserve the original message, source, receiving WWT WhatsApp number and campaign source for future Meta WhatsApp Business Platform ingestion.
- Lead stages are `New`, `Contacted`, `Qualified`, `Site Visit`, `Quotation`, `Negotiation`, `Won` and `Lost`.
- The contact/lead creation database function performs phone matching and both writes in one transaction.
- Historical company and opportunity tables are retained as an archive by the migration, but active application workflows neither create nor require them.
- Important changes are audited through database triggers, not only UI code.
- Summary views use `security_invoker = true`, preserving underlying RLS.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The current unit suite covers role capability helpers, all lead stages, contact/lead/task validation, phone-ready schema architecture, migration safety and removal of the old routes. Database policy integration should also be exercised against an isolated Supabase branch before production rollout.

## Phase 2

- Structured site-visit and waste-audit forms, photo/document uploads and operational handoff
- Quotation templates, approval/versioning and PDF generation
- Tender deadlines, document checklists and bid/no-bid workflow
- Reporting, sales forecasting and environmental impact dashboards
- Admin-managed employee invitations and sales teams
- Notification delivery and saved search/filter preferences

WhatsApp Business Platform webhooks, inbound-message matching, automated lead creation and approved responses remain Phase 3.

## Known limitations

- Phase 1 has no in-app user administration; the first admin is bootstrapped in Supabase.
- Pipeline stages are not yet editable by administrators.
- The development preview acknowledges mutations without persisting them. Persistent workflow verification requires Supabase.
- RLS policies are included and unit-tested capability rules are covered, but a production Supabase branch is still required for full end-to-end RLS regression testing.
