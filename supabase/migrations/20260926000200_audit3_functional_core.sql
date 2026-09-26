-- Audit 3 functional remediation: customer maintenance, bounded Lead search,
-- and deterministic Lead -> Customer lifecycle semantics.

alter table public.customers
  alter column source_lead_id drop not null;

grant insert(
  business_id, contact_name, phone, email, source_lead_id, created_by
) on public.customers to authenticated;
grant update(contact_name, phone, email) on public.customers to authenticated;

create policy customers_member_insert on public.customers
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create or replace function public.search_customers(
  p_business_id uuid,
  p_query text default null,
  p_source text default null
)
returns setof public.customers
language sql stable security invoker set search_path = ''
as $$
  select c.*
  from public.customers c
  where c.business_id = p_business_id
    and (
      nullif(btrim(p_query), '') is null
      or position(
        lower(btrim(p_query))
        in lower(concat_ws(' ', c.contact_name, c.phone, c.email))
      ) > 0
    )
    and (
      nullif(btrim(p_source), '') is null
      or (p_source = 'lead' and c.source_lead_id is not null)
      or (p_source = 'direct' and c.source_lead_id is null)
    )
  order by c.created_at desc, c.id;
$$;

revoke all on function public.search_customers(uuid,text,text) from public, anon;
grant execute on function public.search_customers(uuid,text,text) to authenticated;

create or replace function public.search_leads(
  p_business_id uuid,
  p_query text default null,
  p_status public.lead_status default null,
  p_source text default null,
  p_service_id uuid default null
)
returns setof public.leads
language sql stable security invoker set search_path = ''
as $$
  select l.*
  from public.leads l
  where l.business_id = p_business_id
    and (
      nullif(btrim(p_query), '') is null
      or position(
        lower(btrim(p_query))
        in lower(concat_ws(' ', l.contact_name, l.phone, l.email, l.enquiry_summary))
      ) > 0
    )
    and (p_status is null or l.status = p_status)
    and (nullif(btrim(p_source), '') is null or l.source = p_source)
    and (p_service_id is null or l.service_id = p_service_id)
  order by l.created_at desc, l.id;
$$;

create or replace function public.count_leads(
  p_business_id uuid,
  p_query text default null,
  p_status public.lead_status default null,
  p_source text default null,
  p_service_id uuid default null
)
returns bigint
language sql stable security invoker set search_path = ''
as $$
  select count(*)
  from public.search_leads(
    p_business_id, p_query, p_status, p_source, p_service_id
  );
$$;

revoke all on function public.count_leads(
  uuid,text,public.lead_status,text,uuid
) from public, anon;
grant execute on function public.count_leads(
  uuid,text,public.lead_status,text,uuid
) to authenticated;

create or replace function private.convert_lead_to_customer_internal(target_lead_id uuid)
returns table(customer_id uuid, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  lead_row public.leads%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select l.* into lead_row
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

  select c.id into existing_id
  from public.customers c
  where c.business_id = lead_row.business_id
    and c.source_lead_id = lead_row.id
  limit 1;

  if existing_id is not null then
    update public.leads
      set status = 'won'
      where business_id = lead_row.business_id
        and id = lead_row.id
        and status <> 'won';
    return query select existing_id, false;
    return;
  end if;

  begin
    insert into public.customers(
      business_id, contact_name, phone, email, source_lead_id, created_by
    ) values (
      lead_row.business_id, lead_row.contact_name, lead_row.phone,
      lead_row.email, lead_row.id, (select auth.uid())
    )
    returning id into new_id;

    update public.leads
      set status = 'won'
      where business_id = lead_row.business_id
        and id = lead_row.id
        and status <> 'won';

    return query select new_id, true;
  exception
    when unique_violation then
      select c.id into existing_id
      from public.customers c
      where c.business_id = lead_row.business_id
        and c.source_lead_id = lead_row.id
      limit 1;

      if existing_id is null then raise; end if;

      update public.leads
        set status = 'won'
        where business_id = lead_row.business_id
          and id = lead_row.id
          and status <> 'won';

      return query select existing_id, false;
  end;
end;
$$;

comment on function public.search_customers(uuid,text,text) is
  'Tenant-RLS-backed CRM customer search for direct and Lead-converted customers.';
comment on function public.count_leads(uuid,text,public.lead_status,text,uuid) is
  'Exact RLS-backed count matching Lead search filters; UI pages remain bounded.';
