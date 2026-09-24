-- Tenant-safe Lead search and filtering.
-- Runs with caller privileges so existing Lead RLS remains authoritative.

create or replace function public.search_leads(
  p_business_id uuid,
  p_query text default null,
  p_status public.lead_status default null,
  p_source text default null,
  p_service_id uuid default null
)
returns setof public.leads
language sql
stable
security invoker
set search_path = ''
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
  order by l.created_at desc, l.id
  limit 250;
$$;

revoke all on function public.search_leads(
  uuid, text, public.lead_status, text, uuid
) from public, anon;

grant execute on function public.search_leads(
  uuid, text, public.lead_status, text, uuid
) to authenticated;
