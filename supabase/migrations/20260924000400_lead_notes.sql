-- Internal Lead notes: append-only team notes with tenant isolation.
-- Adapted from the protected CodeEdge MVP note relationship/security pattern.

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null,
  body text not null check (
    char_length(body) <= 5000 and body ~ '[^[:space:]]'
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_notes_lead_same_tenant foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete cascade
);

create index lead_notes_business_lead_created
  on public.lead_notes(business_id, lead_id, created_at desc, id);
create index lead_notes_created_by
  on public.lead_notes(created_by)
  where created_by is not null;

create trigger lead_notes_updated
before update on public.lead_notes
for each row execute function private.touch_updated_at();

alter table public.lead_notes enable row level security;
alter table public.lead_notes force row level security;

revoke all on public.lead_notes from public, anon, authenticated;

grant select on public.lead_notes to authenticated;
grant insert(business_id, lead_id, body, created_by) on public.lead_notes to authenticated;
grant delete on public.lead_notes to authenticated;

create policy lead_notes_read on public.lead_notes
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy lead_notes_insert on public.lead_notes
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy lead_notes_delete on public.lead_notes
for delete to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

-- Notes are intentionally append-only for ordinary members.
-- No UPDATE grant/policy is provided. Owners may delete an incorrect note.
