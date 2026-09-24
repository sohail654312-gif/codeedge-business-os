-- Secure Quote Requests attached to Leads.
-- Tenant ownership and creator identity are enforced server-side and by RLS.

create type public.quote_request_status as enum ('requested', 'reviewing', 'quoted', 'declined');

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null,
  details text not null check (
    char_length(details) <= 5000 and details ~ '[^[:space:]]'
  ),
  status public.quote_request_status not null default 'requested',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_requests_lead_same_tenant foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete cascade
);

create index quote_requests_business_lead_created
  on public.quote_requests(business_id, lead_id, created_at desc, id);
create index quote_requests_created_by
  on public.quote_requests(created_by)
  where created_by is not null;

create trigger quote_requests_updated
before update on public.quote_requests
for each row execute function private.touch_updated_at();

alter table public.quote_requests enable row level security;
alter table public.quote_requests force row level security;

revoke all on public.quote_requests from public, anon, authenticated;

grant select on public.quote_requests to authenticated;
grant insert(business_id, lead_id, details, status, created_by) on public.quote_requests to authenticated;
grant update(status) on public.quote_requests to authenticated;

create policy quote_requests_read on public.quote_requests
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy quote_requests_insert on public.quote_requests
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy quote_requests_update on public.quote_requests
for update to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
)
with check (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);
