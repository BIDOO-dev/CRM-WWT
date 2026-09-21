# WWT CRM — Phase 2

WWT CRM is an internal, responsive sales workspace for Waste Water Treatment / Recyco. It is organized around WWT's operating model: one contact identity can have multiple independent leads, and every opportunity retains its follow-ups, field work, commercial documents and activity history.

## Current scope

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
- Structured site visits with field observations, recommendations, linked files and a one-click quotation handoff
- Versioned quotations with line-item calculations, explicit tax settings, approval/status tracking and branded private PDFs
- Tender tracking with deadlines, bid states, editable checklists and private supporting files
- Live operational reporting for lead sources, receiving numbers, stages, visits, quotes, tenders and salesperson performance
- Protected team administration and a dry-run-first historical Excel importer
- Expanded global search across contacts, phones, email, projects, quote numbers and tender references

The application uses Supabase by default in every environment. Development preview data is available only when `NEXT_PUBLIC_WWT_DEMO_MODE=true` is set explicitly.

## Local setup

Requirements: Node.js 20.19+ (or 22.12+) and a Supabase project. Docker is also required if you use the local Supabase stack.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and publishable key.
4. Apply all migrations in `supabase/migrations` in timestamp order. Existing installations should use `supabase db push` so the linked project receives only unapplied versioned migrations.
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
- `manager_id` provides the team hierarchy used by assignment scope and reporting.
- Contacts are the customer identity. Phone and WhatsApp values receive indexed normalized keys so future webhooks can reuse an existing person.
- Every customer request is a lead. One contact can have any number of leads, each with its own need, stage, assignee, source and follow-up.
- Leads preserve the original message, source, receiving WWT WhatsApp number and campaign source for future Meta WhatsApp Business Platform ingestion.
- Lead stages are `New`, `Contacted`, `Qualified`, `Site Visit`, `Quotation`, `Negotiation`, `Won` and `Lost`.
- The contact/lead creation database function performs phone matching and both writes in one transaction.
- Historical company and opportunity tables are retained as an archive by the migration, but active application workflows neither create nor require them.
- Site visits remain linked to both the originating lead and contact.
- Quotations keep immutable previous versions after a sent/accepted/rejected/expired offer is revised. Totals are recalculated in PostgreSQL as well as previewed in the UI.
- Tenders retain editable checklist rows and deadline/status history.
- Important changes are audited through database triggers, not only UI code.
- Summary views use `security_invoker = true`, preserving underlying RLS.
- The `crm-files` Storage bucket is private. Downloads use short-lived signed URLs and object policies use the same record scope as the database.

## Historical lead import

The importer is available to administrators and sales managers under **Settings → Master lead import**.

1. Upload an `.xlsx` workbook to the preview screen. The file is parsed in memory and is not committed to the repository.
2. Review per-sheet column mappings, historical owner mappings, status/color mappings, validation warnings, duplicate estimates and existing-contact matches.
3. Run preview again after mapping changes.
4. Type the explicit confirmation only when the summary is correct. The server verifies the workbook fingerprint and performs the import in one database transaction.

Contacts are matched primarily by normalized phone or WhatsApp number. Invalid/missing-phone rows remain in manual review and are not imported automatically. The source workbook must never be committed, copied into fixtures, or represented with real customer details in tests or documentation.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite covers role capabilities, Phase 1 and Phase 2 validation, quotation calculations, phone import normalization, contact/lead matching safeguards, versioning, storage/RLS migration requirements and route preservation. Run database policy integration against an isolated Supabase branch before promoting migrations to production.

## Explicitly out of scope

WhatsApp Business Platform webhooks, inbound-message automation, AI replies, OpenAI processing and AI lead classification remain Phase 3.

## Operational notes

- The first administrator is still bootstrapped in Supabase Auth; existing admins can configure application profile fields in Settings.
- Changing an employee email in Settings changes the CRM directory only. Login-email changes remain a protected Supabase Auth administration operation.
- Demo mode is development-only and must stay disabled in production.
- Customer workbooks and generated local previews are intentionally ignored by Git.
