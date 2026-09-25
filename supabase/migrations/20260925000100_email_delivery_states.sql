-- Email-specific normalized delivery states.
-- Kept separate so PostgreSQL commits enum additions before later migrations use them.

alter type public.delivery_status add value if not exists 'queued' after 'sending';
alter type public.delivery_status add value if not exists 'bounced' after 'delivered';
