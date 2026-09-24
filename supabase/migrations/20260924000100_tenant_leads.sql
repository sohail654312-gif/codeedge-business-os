-- CodeEdge Business OS tenant + Leads persistence foundation.
-- Adapted from the protected CodeEdge MVP security model without creating
-- any runtime dependency on the MVP repository.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.business_role as enum ('owner', 'staff');
create type public.business_status as enum ('active', 'suspended');
create type public.membership_status as enum ('active', 'revoked');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'won', 'lost');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80
  ),
  status public.business_status not null default 'active',
  timezone text not null default 'UTC' check (char_length(btrim(timezone)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.business_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index memberships_user_active
  on public.business_memberships(user_id, business_id)
  where status = 'active';

-- Minimal service identity exists now only to protect Lead -> Service tenancy.
-- The richer Business Information service model can extend this table later.
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (
    char_length(email) <= 254 and
    (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  source text not null default 'manual' check (source ~ '^[a-z][a-z0-9_]{0,39}$'),
  service_id uuid,
  enquiry_summary text not null check (
    char_length(enquiry_summary) <= 3000 and enquiry_summary ~ '[^[:space:]]'
  ),
  status public.lead_status not null default 'new',
  estimated_value_pence bigint check (
    estimated_value_pence is null or estimated_value_pence between 0 and 1000000000
  ),
  last_contact_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_contact_method check (phone ~ '[^[:space:]]' or email <> ''),
  constraint leads_service_same_tenant foreign key (business_id, service_id)
    references public.services(business_id, id) on delete set null (service_id),
  unique (business_id, id)
);

create index leads_business_created
  on public.leads(business_id, created_at desc, id);
create index leads_business_status_created
  on public.leads(business_id, status, created_at desc);
create index leads_business_service
  on public.leads(business_id, service_id)
  where service_id is not null;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

create trigger businesses_updated before update on public.businesses
  for each row execute function private.touch_updated_at();
create trigger memberships_updated before update on public.business_memberships
  for each row execute function private.touch_updated_at();
create trigger services_updated before update on public.services
  for each row execute function private.touch_updated_at();
create trigger leads_updated before update on public.leads
  for each row execute function private.touch_updated_at();

-- Membership is checked live on every protected database operation.
-- Tenant and role claims supplied by the browser are never authoritative.
create function private.has_business_role(
  target_business_id uuid,
  allowed_roles public.business_role[]
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and b.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;
revoke all on function private.has_business_role(uuid, public.business_role[]) from public, anon;
grant execute on function private.has_business_role(uuid, public.business_role[]) to authenticated;

alter table public.businesses enable row level security;
alter table public.businesses force row level security;
alter table public.business_memberships enable row level security;
alter table public.business_memberships force row level security;
alter table public.services enable row level security;
alter table public.services force row level security;
alter table public.leads enable row level security;
alter table public.leads force row level security;

revoke all on public.businesses, public.business_memberships, public.services, public.leads
  from public, anon, authenticated;

grant select on public.businesses, public.business_memberships, public.services, public.leads
  to authenticated;
grant update(name, timezone) on public.businesses to authenticated;

grant insert(business_id, name, active) on public.services to authenticated;
grant update(name, active) on public.services to authenticated;
grant delete on public.services to authenticated;

grant insert(
  business_id,
  contact_name,
  phone,
  email,
  source,
  service_id,
  enquiry_summary,
  status,
  estimated_value_pence,
  last_contact_at,
  created_by
) on public.leads to authenticated;
grant update(
  contact_name,
  phone,
  email,
  source,
  service_id,
  enquiry_summary,
  status,
  estimated_value_pence,
  last_contact_at
) on public.leads to authenticated;
grant delete on public.leads to authenticated;

create policy businesses_read_member on public.businesses
for select to authenticated
using (private.has_business_role(id, array['owner','staff']::public.business_role[]));

create policy businesses_update_owner on public.businesses
for update to authenticated
using (private.has_business_role(id, array['owner']::public.business_role[]))
with check (private.has_business_role(id, array['owner']::public.business_role[]));

create policy memberships_read on public.business_memberships
for select to authenticated
using (
  private.has_business_role(business_id, array['owner']::public.business_role[])
  or (
    user_id = (select auth.uid())
    and private.has_business_role(business_id, array['staff']::public.business_role[])
  )
);

-- No browser INSERT/UPDATE/DELETE policies for memberships.
-- Provisioning, invitations and revocation will use a separately audited trusted path.

create policy services_read on public.services
for select to authenticated
using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));

create policy services_insert on public.services
for insert to authenticated
with check (private.has_business_role(business_id, array['owner']::public.business_role[]));

create policy services_update on public.services
for update to authenticated
using (private.has_business_role(business_id, array['owner']::public.business_role[]))
with check (private.has_business_role(business_id, array['owner']::public.business_role[]));

create policy services_delete on public.services
for delete to authenticated
using (private.has_business_role(business_id, array['owner']::public.business_role[]));

create policy leads_read on public.leads
for select to authenticated
using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));

create policy leads_insert on public.leads
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_business_role(business_id, array['owner','staff']::public.business_role[])
);

create policy leads_update on public.leads
for update to authenticated
using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]))
with check (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));

create policy leads_delete on public.leads
for delete to authenticated
using (private.has_business_role(business_id, array['owner']::public.business_role[]));
