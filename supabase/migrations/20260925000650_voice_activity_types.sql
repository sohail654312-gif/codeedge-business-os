-- Reserve stable CRM activity events for the Voice domain before the
-- following Voice schema migration references the enum values.

alter type public.crm_activity_type add value if not exists 'voice_call_started';
alter type public.crm_activity_type add value if not exists 'voice_call_completed';
alter type public.crm_activity_type add value if not exists 'voice_call_failed';
alter type public.crm_activity_type add value if not exists 'voice_handoff_requested';
alter type public.crm_activity_type add value if not exists 'appointment_created_from_voice';
