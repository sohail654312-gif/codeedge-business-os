-- Additive V1 CRM delta. Existing identities/mappings remain unchanged.
-- Direct customers need no artificial Lead. No delete permission is granted.
alter table public.customers alter column source_lead_id drop not null;
create or replace function private.crm_activity_from_customer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_lead_id is not null then
    perform private.append_crm_activity(new.business_id,new.source_lead_id,
      'lead_converted_to_customer','Lead converted to Customer',jsonb_build_object('customer_id',new.id));
  end if;
  return new;
end $$;
grant insert(id,business_id,contact_name,phone,email,created_by) on public.customers to authenticated;
grant update(contact_name,phone,email) on public.customers to authenticated;
create policy customers_direct_create on public.customers for insert to authenticated
with check (source_lead_id is null and created_by = auth.uid()
  and private.has_business_role(business_id,array['owner','staff']::public.business_role[]));

-- Both functions run as the caller: RLS controls rows AND counts.
create function public.search_leads_page(
  p_business_id uuid, p_query text default null,
  p_status public.lead_status default null, p_source text default null,
  p_service_id uuid default null, p_page integer default 1
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 10000 or char_length(p_query) > 120 then
    raise exception 'invalid_pagination_or_query';
  end if;
  with matched as not materialized (
    select l.* from public.leads l where l.business_id = p_business_id
      and (nullif(btrim(p_query),'') is null or position(lower(btrim(p_query))
        in lower(concat_ws(' ',l.contact_name,l.phone,l.email,l.enquiry_summary))) > 0)
      and (p_status is null or l.status=p_status)
      and (nullif(btrim(p_source),'') is null or l.source=p_source)
      and (p_service_id is null or l.service_id=p_service_id)
  ), page as (select * from matched order by created_at desc,id limit 50 offset (p_page-1)*50)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb),
    'total',(select count(*) from matched),'page',p_page,'pageSize',50) into result;
  return result;
end $$;
revoke all on function public.search_leads_page(uuid,text,public.lead_status,text,uuid,integer) from public,anon;
grant execute on function public.search_leads_page(uuid,text,public.lead_status,text,uuid,integer) to authenticated;

create function public.search_customers_page(p_business_id uuid,p_query text default null,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 10000 or char_length(p_query) > 120 then
    raise exception 'invalid_pagination_or_query';
  end if;
  with matched as not materialized (
    select c.* from public.customers c where c.business_id=p_business_id
      and (nullif(btrim(p_query),'') is null or position(lower(btrim(p_query))
        in lower(concat_ws(' ',c.contact_name,c.phone,c.email))) > 0)
  ), page as (select * from matched order by created_at desc,id limit 50 offset (p_page-1)*50)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb),
    'total',(select count(*) from matched),'page',p_page,'pageSize',50) into result;
  return result;
end $$;
revoke all on function public.search_customers_page(uuid,text,integer) from public,anon;
grant execute on function public.search_customers_page(uuid,text,integer) to authenticated;
