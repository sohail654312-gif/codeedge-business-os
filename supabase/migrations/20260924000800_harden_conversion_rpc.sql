-- Harden the exposed conversion RPC: the public function is SECURITY INVOKER.
-- Privileged work lives in the non-exposed private schema.

create or replace function private.convert_lead_to_customer_internal(target_lead_id uuid)
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
      business_id, contact_name, phone, email, source_lead_id, created_by
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

      if existing_id is null then raise; end if;
      return query select existing_id, false;
  end;
end;
$$;

revoke all on function private.convert_lead_to_customer_internal(uuid) from public, anon;
grant execute on function private.convert_lead_to_customer_internal(uuid) to authenticated;

create or replace function public.convert_lead_to_customer(target_lead_id uuid)
returns table(customer_id uuid, created boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.convert_lead_to_customer_internal(target_lead_id);
$$;

revoke all on function public.convert_lead_to_customer(uuid) from public, anon;
grant execute on function public.convert_lead_to_customer(uuid) to authenticated;
