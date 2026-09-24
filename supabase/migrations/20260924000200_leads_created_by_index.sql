-- Performance follow-up from hosted Supabase advisor.
-- Covers the Lead creator foreign key without weakening RLS or grants.
create index if not exists leads_created_by
  on public.leads(created_by)
  where created_by is not null;
