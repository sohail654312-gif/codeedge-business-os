-- Business Information phase: Service Areas + Opening Hours.
-- Adapted from the protected CodeEdge MVP. Tenant identity remains server/database-owned.

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  postcode text not null default '' check (
    char_length(postcode) <= 8 and
    (
      postcode = '' or
      postcode ~ '^(GIR 0AA|[A-PR-UWYZ][A-HK-Y]?[0-9][0-9A-HJKPSTUW]?( [0-9][ABD-HJLNP-UW-Z]{2})?)$'
    )
  ),
  notes text not null default '' check (char_length(notes) <= 1000),
  active boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.service_areas.postcode is
  'Optional UK outward code or full postcode used as a coverage hint; syntax only, not address verification.';

create index service_areas_business_order
  on public.service_areas(business_id, display_order, id);

create trigger service_areas_updated
before update on public.service_areas
for each row execute function private.touch_updated_at();

alter table public.service_areas enable row level security;
alter table public.service_areas force row level security;

revoke all on public.service_areas from public, anon, authenticated;
grant select, delete on public.service_areas to authenticated;
grant insert(business_id,name,postcode,notes,active,display_order)
  on public.service_areas to authenticated;
grant update(name,postcode,notes,active,display_order)
  on public.service_areas to authenticated;

create policy service_areas_read on public.service_areas
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy service_areas_insert on public.service_areas
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create policy service_areas_update on public.service_areas
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

create policy service_areas_delete on public.service_areas
for delete to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create table public.opening_hours (
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_closed boolean not null default true,
  opens_at time without time zone,
  closes_at time without time zone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, weekday),
  constraint opening_hours_valid_interval check (
    (is_closed and opens_at is null and closes_at is null)
    or
    (
      not is_closed
      and opens_at is not null
      and closes_at is not null
      and opens_at < closes_at
      and closes_at < time '24:00'
      and extract(second from opens_at) = 0
      and extract(second from closes_at) = 0
    )
  )
);

comment on column public.opening_hours.weekday is
  'ISO weekday: 1 Monday through 7 Sunday. An absent row is not configured, not implicitly closed.';
comment on table public.opening_hours is
  'One normal same-day opening interval per weekday in the business timezone. Overnight and holiday scheduling are intentionally outside this phase.';

create trigger opening_hours_updated
before update on public.opening_hours
for each row execute function private.touch_updated_at();

alter table public.opening_hours enable row level security;
alter table public.opening_hours force row level security;

revoke all on public.opening_hours from public, anon, authenticated;
grant select on public.opening_hours to authenticated;
grant insert(business_id,weekday,is_closed,opens_at,closes_at)
  on public.opening_hours to authenticated;
grant update(is_closed,opens_at,closes_at)
  on public.opening_hours to authenticated;

create policy opening_hours_read on public.opening_hours
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy opening_hours_insert on public.opening_hours
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create policy opening_hours_update on public.opening_hours
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
