-- Booking CRM activity event values are committed separately so PostgreSQL
-- can safely use them in triggers created by the following migration.
alter type public.crm_activity_type add value if not exists 'appointment_created';
alter type public.crm_activity_type add value if not exists 'appointment_rescheduled';
alter type public.crm_activity_type add value if not exists 'appointment_confirmed';
alter type public.crm_activity_type add value if not exists 'appointment_cancelled';
alter type public.crm_activity_type add value if not exists 'appointment_completed';
alter type public.crm_activity_type add value if not exists 'appointment_no_show';
