-- Lead -> Customer conversion with tenant-secure, duplicate-safe local CRM identity.

create type public.customer_backoffice_status as enum ('pending', 'synced', 'failed');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (
    char_length(email) <= 254 and
    (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  source_lead_id uuid not null,
  erpnext_customer_id text,
  erpnext_sync_status public.customer_backoffice_status not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_method check (phone ~ '[^[:space:]]' or email <> ''),
  constraint customers_lead_same_tenant foreign key (business_id, source_lead_id)
    references public.leads(business_id, id) on delete restrict,
  unique (business_id, source_lead_id),
  unique (business_id, id)
);

create index customers_business_created
  on public.customers(business_id, created_at desc, id);
create index customers_created_by
  on public.customers(created_by)
  where created_by is not null;

create trigger customers_updated
before update on public.customers
for each row execute function private.touch_updated_at();

alter table public.customers enable row level security;
alter table public.customers force row level security;

revoke all on public.customers from public, anon, authenticated;
grant select on public.customers to authenticated;
grant update(erpnext_customer_id, erpnext_sync_status) on public.customers to authenticated;

create policy customers_read on public.customers
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy customers_sync_update on public.customers
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

create or replace function public.convert_lead_to_customer(target_lead_id uuid)
returns table(customer_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.leads%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select l.*
  into lead_row
  from public.leads l
  where l.id = target_lead_id
    and private.has_business_role(
      l.business_id,
      array['owner','staff']::public.business_role[]
    )
  limit 1;

  if not found then
    raise exception 'Lead unavailable' using errcode = '42501';
  end if;

  select c.id
  into existing_id
  from public.customers c
  where c.business_id = lead_row.business_id
    and c.source_lead_id = lead_row.id
  limit 1;

  if existing_id is not null then
    return query select existing_id, false;
    return;
  end if;

  begin
    insert into public.customers(
      business_id,
      contact_name,
      phone,
      email,
      source_lead_id,
      created_by
    ) values (
      lead_row.business_id,
      lead_row.contact_name,
      lead_row.phone,
      lead_row.email,
      lead_row.id,
      (select auth.uid())
    )
    returning id into new_id;

    return query select new_id, true;
  exception
    when unique_violation then
      select c.id into existing_id
      from public.customers c
      where c.business_id = lead_row.business_id
        and c.source_lead_id = lead_row.id
      limit 1;

      if existing_id is null then
        raise;
      end if;

      return query select existing_id, false;
  end;
end;
$$;

revoke all on function public.convert_lead_to_customer(uuid) from public, anon;
grant execute on function public.convert_lead_to_customer(uuid) to authenticated;
