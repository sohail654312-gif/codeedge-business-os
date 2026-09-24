-- Business Information phase: Business Profile + richer Services.
-- Services already exist because CRM Leads reference them. Extend that table in place
-- so service IDs and Lead relationships remain stable.

create table public.business_profiles (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  trading_name text not null default '' check (char_length(trading_name) <= 120),
  phone text not null default '' check (
    char_length(phone) <= 40 and phone ~ '^[+0-9().[:space:]-]*$'
  ),
  email text not null default '' check (
    char_length(email) <= 254 and
    (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  website text not null default '' check (
    char_length(website) <= 2048 and
    (website = '' or website ~ '^https://[^[:space:]]+$')
  ),
  address text not null default '' check (char_length(address) <= 500),
  description text not null default '' check (char_length(description) <= 3000),
  category text not null default '' check (char_length(category) <= 120),
  logo_alt text not null default '' check (char_length(logo_alt) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.business_profiles.logo_alt is
  'Reserved plain-text logo description. File upload is outside this phase.';

create trigger business_profiles_updated
before update on public.business_profiles
for each row execute function private.touch_updated_at();

alter table public.business_profiles enable row level security;
alter table public.business_profiles force row level security;

revoke all on public.business_profiles from public, anon, authenticated;
grant select on public.business_profiles to authenticated;
grant insert(
  business_id,trading_name,phone,email,website,address,description,category,logo_alt
) on public.business_profiles to authenticated;
grant update(
  trading_name,phone,email,website,address,description,category,logo_alt
) on public.business_profiles to authenticated;

create policy business_profiles_read on public.business_profiles
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy business_profiles_insert on public.business_profiles
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create policy business_profiles_update on public.business_profiles
for update to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
)
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

alter table public.services
  add column description text not null default ''
    check (char_length(description) <= 3000),
  add column starting_price_pence integer
    check (starting_price_pence between 0 and 100000000),
  add column quote_required boolean not null default true,
  add column display_order integer not null default 0
    check (display_order between 0 and 10000);

create index services_business_display_order
  on public.services(business_id, display_order, id);

grant insert(description,starting_price_pence,quote_required,display_order)
  on public.services to authenticated;
grant update(description,starting_price_pence,quote_required,display_order)
  on public.services to authenticated;
