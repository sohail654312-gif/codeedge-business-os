-- Versioned, tenant-safe, read-only Business OS projection for CIGO.
-- No provider credentials, authentication tokens, message bodies, free-text notes,
-- phone/email contact fields, arbitrary SQL, or mutation capability are exposed.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_cigo_read_api') then
    create role codeedge_cigo_read_api nologin noinherit nobypassrls;
  elsif exists(
    select 1
    from pg_roles
    where rolname='codeedge_cigo_read_api'
      and (
        rolsuper or rolbypassrls or rolcanlogin or rolinherit or
        rolcreaterole or rolcreatedb or rolreplication
      )
  ) then
    raise exception 'Unsafe pre-existing CIGO read role';
  end if;
end $$;

grant codeedge_cigo_read_api to postgres;
grant usage on schema public to codeedge_cigo_read_api;

create schema if not exists codeedge_internal;
revoke all on schema codeedge_internal
from public,anon,authenticated,codeedge_cigo_read_api;

do $ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on schema codeedge_internal from service_role';
  end if;
end $;

create table if not exists codeedge_internal.cigo_read_grants (
  key_id text primary key
    check (key_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  credential_fingerprint text not null
    check (credential_fingerprint ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  requests_per_minute integer not null default 120
    check (requests_per_minute between 1 and 600),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists cigo_read_grants_business_key
on codeedge_internal.cigo_read_grants(business_id,key_id);

create table if not exists codeedge_internal.cigo_read_rate_state (
  key_id text primary key
    references codeedge_internal.cigo_read_grants(key_id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

revoke all on all tables in schema codeedge_internal
from public,anon,authenticated,codeedge_cigo_read_api;

do $ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on all tables in schema codeedge_internal from service_role';
  end if;
end $;

create or replace function public.cigo_read_v1(
  p_key_id text,
  p_credential_fingerprint text,
  p_business_id uuid,
  p_resource_kind text,
  p_limit integer,
  p_after_time timestamptz default null,
  p_after_id text default ''
)
returns table(
  record jsonb,
  sort_time timestamptz,
  sort_id text
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer;
  v_count integer;
  v_window timestamptz;
begin
  if p_business_id is null
     or p_key_id !~ '^[A-Za-z0-9_-]{1,64}$'
     or p_credential_fingerprint !~ '^[0-9a-f]{64}$'
     or p_resource_kind not in (
       'business_profile','service','lead','customer',
       'crm_activity','booking','inbox_summary','finance_summary'
     )
     or p_limit is null
     or p_limit < 1
     or p_limit > 101
     or char_length(coalesce(p_after_id,'')) > 255
     or (p_after_time is null and coalesce(p_after_id,'') <> '')
     or (p_after_time is not null and coalesce(p_after_id,'') = '') then
    raise exception 'CIGO read unavailable' using errcode='42501';
  end if;

  select g.requests_per_minute
  into v_limit
  from codeedge_internal.cigo_read_grants g
  where g.key_id=p_key_id
    and g.business_id=p_business_id
    and g.credential_fingerprint=p_credential_fingerprint
    and g.enabled
    and g.revoked_at is null;

  if v_limit is null or not exists(
    select 1 from public.businesses b
    where b.id=p_business_id and b.status='active'
  ) then
    raise exception 'CIGO read unavailable' using errcode='42501';
  end if;

  v_window := date_trunc('minute',clock_timestamp());
  v_count := null;

  insert into codeedge_internal.cigo_read_rate_state as current_window(
    key_id,window_started_at,request_count
  )
  values(p_key_id,v_window,1)
  on conflict(key_id) do update
  set
    window_started_at = case
      when current_window.window_started_at < excluded.window_started_at
        then excluded.window_started_at
      else current_window.window_started_at
    end,
    request_count = case
      when current_window.window_started_at < excluded.window_started_at
        then 1
      else current_window.request_count + 1
    end
  where current_window.window_started_at < excluded.window_started_at
     or current_window.request_count < v_limit
  returning request_count into v_count;

  if v_count is null then
    raise exception 'CIGO read rate limit exceeded' using errcode='57014';
  end if;

  if p_resource_kind='business_profile' then
    return query
    select
      jsonb_build_object(
        'externalReference','business:'||b.id::text,
        'version',greatest(b.updated_at,coalesce(bp.updated_at,b.updated_at))::text,
        'observedAt',greatest(b.updated_at,coalesce(bp.updated_at,b.updated_at))::text,
        'value',jsonb_build_object(
          'name',b.name,
          'timezone',b.timezone,
          'executionMode',b.execution_mode,
          'tradingName',coalesce(bp.trading_name,''),
          'website',coalesce(bp.website,''),
          'description',coalesce(bp.description,''),
          'category',coalesce(bp.category,'')
        )
      ),
      greatest(b.updated_at,coalesce(bp.updated_at,b.updated_at)),
      b.id::text
    from public.businesses b
    left join public.business_profiles bp on bp.business_id=b.id
    where b.id=p_business_id
      and (
        p_after_time is null
        or (greatest(b.updated_at,coalesce(bp.updated_at,b.updated_at)),b.id::text)
          > (p_after_time,p_after_id)
      )
    order by 2 asc,3 asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='service' then
    return query
    select jsonb_build_object(
      'externalReference','service:'||s.id::text,
      'version',s.updated_at::text,
      'observedAt',s.updated_at::text,
      'value',jsonb_build_object(
        'name',s.name,
        'description',s.description,
        'active',s.active,
        'startingPricePence',s.starting_price_pence,
        'quoteRequired',s.quote_required,
        'durationMinutes',s.duration_minutes,
        'displayOrder',s.display_order,
        'createdAt',s.created_at::text,
        'updatedAt',s.updated_at::text
      )
    ),s.updated_at,s.id::text
    from public.services s
    where s.business_id=p_business_id
      and (p_after_time is null or (s.updated_at,s.id::text)>(p_after_time,p_after_id))
    order by s.updated_at asc,s.id::text asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='lead' then
    return query
    select jsonb_build_object(
      'externalReference','lead:'||l.id::text,
      'version',l.updated_at::text,
      'observedAt',l.updated_at::text,
      'value',jsonb_build_object(
        'source',l.source,
        'serviceId',l.service_id,
        'status',l.status,
        'estimatedValuePence',l.estimated_value_pence,
        'lastContactAt',l.last_contact_at,
        'createdAt',l.created_at::text,
        'updatedAt',l.updated_at::text
      )
    ),l.updated_at,l.id::text
    from public.leads l
    where l.business_id=p_business_id
      and (p_after_time is null or (l.updated_at,l.id::text)>(p_after_time,p_after_id))
    order by l.updated_at asc,l.id::text asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='customer' then
    return query
    select jsonb_build_object(
      'externalReference','customer:'||c.id::text,
      'version',c.updated_at::text,
      'observedAt',c.updated_at::text,
      'value',jsonb_build_object(
        'sourceLeadId',c.source_lead_id,
        'financeMapped',c.erpnext_customer_id is not null,
        'financeSyncStatus',c.erpnext_sync_status,
        'createdAt',c.created_at::text,
        'updatedAt',c.updated_at::text
      )
    ),c.updated_at,c.id::text
    from public.customers c
    where c.business_id=p_business_id
      and (p_after_time is null or (c.updated_at,c.id::text)>(p_after_time,p_after_id))
    order by c.updated_at asc,c.id::text asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='crm_activity' then
    return query
    select jsonb_build_object(
      'externalReference','crm_activity:'||a.id::text,
      'version',a.created_at::text,
      'observedAt',a.created_at::text,
      'value',jsonb_build_object(
        'leadId',a.lead_id,
        'eventType',a.event_type,
        'createdAt',a.created_at::text
      )
    ),a.created_at,a.id::text
    from public.crm_activities a
    where a.business_id=p_business_id
      and (p_after_time is null or (a.created_at,a.id::text)>(p_after_time,p_after_id))
    order by a.created_at asc,a.id::text asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='booking' then
    return query
    select jsonb_build_object(
      'externalReference','booking:'||a.id::text,
      'version',a.updated_at::text,
      'observedAt',a.updated_at::text,
      'value',jsonb_build_object(
        'leadId',a.lead_id,
        'customerId',a.customer_id,
        'serviceId',a.service_id,
        'startsAt',a.starts_at::text,
        'endsAt',a.ends_at::text,
        'timezone',a.timezone,
        'status',a.status,
        'source',a.source,
        'createdAt',a.created_at::text,
        'updatedAt',a.updated_at::text
      )
    ),a.updated_at,a.id::text
    from public.appointments a
    where a.business_id=p_business_id
      and (p_after_time is null or (a.updated_at,a.id::text)>(p_after_time,p_after_id))
    order by a.updated_at asc,a.id::text asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='inbox_summary' then
    return query
    select jsonb_build_object(
      'externalReference','conversation:'||c.id::text,
      'version',c.updated_at::text,
     'observedAt',c.updated_at::text,
      'value',jsonb_build_object(
        'leadId',c.lead_id,
        'customerId',c.customer_id,
        'channel',c.channel,
        'status',c.status,
        'lastMessageAt',c.last_message_at::text,
        'lastMessageDirection',c.last_message_direction,
       'lastMessageSenderType',c.last_message_sender_type,
        'createdAt',c.created_at::text,
        'updatedAt',c.updated_at::text
      )
    ),c.updated_at,c.id::text
    from public.conversations c
    where c.business_id=p_business_id
      and (p_after_time is null or (c.updated_at,c.id::text)>(p_after_time,p_after_id))
    order by c.updated_at asc,c.id::text asc
    limit p_limit;
    return;
  end if;

  if p_resource_kind='finance_summary' then
    return query
    select
      jsonb_build_object(
        'externalReference','finance_summary:'||b.id::text,
        'version',greatest(
          b.updated_at,
          coalesce(fc.updated_at,b.updated_at),
          coalesce(x.last_execution_at,b.updated_at)
        )::text,
        'observedAt',greatest(
          b.updated_at,
          coalesce(fc.updated_at,b.updated_at),
          coalesce(x.last_execution_at,b.updated_at)
        )::text,
        'value',jsonb_build_object(
          'projectionScope','codeedge_local_execution_only',
          'executionMode',b.execution_mode,
          'hasConnection',fc.id is not null,
          'engine',fc.engine,
          'defaultCurrency',fc.default_currency,
          'successfulExecutions',coalesce(x.succeeded,0),
          'failedExecutions',coalesce(x.failed,0),
          'ambiguousExecutions',coalesce(x.ambiguous,0),
          'simulatedExecutions',coalesce(x.simulated,0)
        )
      ),
      greatest(
        b.updated_at,
        coalesce(fc.updated_at,b.updated_at),
        coalesce(x.last_execution_at,b.updated_at)
      ),
      b.id::text
    from public.businesses b
    left join lateral (
      select f.id,f.engine,f.default_currency,f.updated_at
      from public.finance_connections f
      where f.business_id=b.id and f.enabled
      order by f.created_at asc,f.id asc
      limit 1
    ) fc on true
    left join lateral (
      select
        count(*) filter (where r.status='succeeded')::integer as succeeded,
        count(*) filter (where r.status='failed')::integer as failed,
        count(*) filter (where r.status='ambiguous')::integer as ambiguous,
        count(*) filter (where r.status='simulated')::integer as simulated,
        max(coalesce(r.completed_at,rc.created_at)) as last_execution_at
      from public.finance_execution_records r
      where r.business_id=b.id
    ) x on true
    where b.id=p_business_id
      and (
        p_after_time is null
        or (
          greatest(
            b.updated_at,
            coalesce(fc.updated_at,b.updated_at),
            coalesce(x.last_execution_at,b.updated_at)
          ),
          b.id::text
        ) > (p_after_time,p_after_id)
      )
    order by 2 asc,3 asc
    limit p_limit;
    return;
  end if;

  raise exception 'CIGO read unavailable' using errcode='42501';
end;
$$;

revoke all on function public.cigo_read_v1(text,text,uuid,text,integer,timestamptz,text)
from public,anon,authenticated;

do $ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on function public.cigo_read_v1(text,text,uuid,text,integer,timestamptz,text) from service_role';
  end if;
end $;
grant execute on function public.cigo_read_v1(text,text,uuid,text,integer,timestamptz,text)
to codeedge_cigo_read_api;

comment on function public.cigo_read_v1(text,text,uuid,text,integer,timestamptz,text) is
  'Versioned tenant-scoped read-only projection for Codeedge CIGO v1.';
