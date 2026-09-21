-- Extend the permanent CRM timeline before Phase 2 triggers begin using these values.
alter type public.activity_type add value if not exists 'site_visit_scheduled';
alter type public.activity_type add value if not exists 'site_visit_completed';
alter type public.activity_type add value if not exists 'task_created';
alter type public.activity_type add value if not exists 'quote_created';
alter type public.activity_type add value if not exists 'quote_accepted';
alter type public.activity_type add value if not exists 'quote_rejected';
alter type public.activity_type add value if not exists 'tender_created';
alter type public.activity_type add value if not exists 'file_uploaded';
