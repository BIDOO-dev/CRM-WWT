-- Extend the permanent CRM timeline before the Phase 3 inbox triggers begin using these values.
alter type public.activity_type add value if not exists 'instagram';
alter type public.activity_type add value if not exists 'messenger';
alter type public.activity_type add value if not exists 'conversation_assigned';
