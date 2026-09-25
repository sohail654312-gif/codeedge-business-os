-- Codeedge AI Voice + AI Receptionist foundation.
-- Voice remains a canonical Conversation channel and reuses CRM + Booking identity.
-- Provider credentials stay server-only; this schema stores opaque credential keys only.

create type public.voice_call_status as enum (
  'queued',
  'ringing',
  'in_progress',
  'completed',
  'failed',
  'no_answer',
  'busy',
  'cancelled'
);

create type public.voice_call_direction as enum (
  'inbound',
  'outbound'
);

create table public.voice_receptionist_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  greeting text not null default 'Hello, how can I help you today?' check (
    char_length(btrim(greeting)) between 1 and 500
  ),
  provider text not null default 'demo_voice' check (
    provider ~ '^[a-z][a-z0-9_]{1,79}$'
  ),
  voice text not null default '' check (char_length(voice) <= 120),
  preferred_language text not null default 'en' check (
    preferred_language ~ '^[A-Za-z]{2,8}([_-][A-Za-z0-9]{2,8})?$'
  ),
  allowed_tools text[] not null default array[
    'business_information',
    'services',
    'opening_hours',
    'faqs',
    'appointment_availability',
    'create_appointment',
    'reschedule_appointment',
    'cancel_appointment',
    'human_handoff'
  ]::text[],
  handoff_behavior text not null default 'shared_inbox' check (
    handoff_behavior in ('shared_inbox','message_only')
  ),
  additional_instructions text not null default '' check (
    char_length(additional_instructions) <= 2000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger voice_receptionist_settings_updated
before update on public.voice_receptionist_settings
for each row execute function private.touch_updated_at();

create table public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null,
  lead_id uuid,
  customer_id uuid,
  channel_connection_id uuid,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,79}$'),
  provider_call_id text check (
    provider_call_id is null or char_length(btrim(provider_call_id)) between 1 and 255
  ),
  direction public.voice_call_direction not null,
  from_number text not null default '' check (char_length(from_number) <= 80),
  to_number text not null default '' check (char_length(to_number) <= 80),
  status public.voice_call_status not null default 'queued',
  started_at timestamptz not null default clock_timestamp(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (
    duration_seconds is null or duration_seconds between 0 and 86400
  ),
  summary text not null default '' check (char_length(summary) <= 3000),
  disposition text not null default '' check (char_length(disposition) <= 120),
  handoff_required boolean not null default false,
  execution_mode public.execution_mode not null,
  provider_environment public.credential_environment,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  constraint voice_calls_conversation_same_tenant
    foreign key (business_id, conversation_id)
    references public.conversations(business_id, id) on delete cascade,
  constraint voice_calls_lead_same_tenant
    foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete set null (lead_id),
  constraint voice_calls_customer_same_tenant
    foreign key (business_id, customer_id)
    references public.customers(business_id, id) on delete set null (customer_id),
  constraint voice_calls_connection_same_tenant
    foreign key (business_id, channel_connection_id)
    references public.channel_connections(business_id, id) on delete restrict,
  check (
    (provider = 'demo_voice' and channel_connection_id is null and provider_environment is null)
    or
    (provider <> 'demo_voice' and channel_connection_id is not null and provider_environment is not null)
  )
);

create unique index voice_calls_provider_call_unique
  on public.voice_calls(provider, provider_call_id)
  where provider_call_id is not null;

create unique index voice_calls_business_correlation_unique
  on public.voice_calls(business_id, correlation_id)
  where correlation_id is not null;

create index voice_calls_business_created
  on public.voice_calls(business_id, created_at desc, id desc);
create index voice_calls_business_conversation
  on public.voice_calls(business_id, conversation_id, created_at desc);
create index voice_calls_business_lead
  on public.voice_calls(business_id, lead_id, created_at desc)
  where lead_id is not null;

create trigger voice_calls_updated
before update on public.voice_calls
for each row execute function private.touch_updated_at();

create table public.voice_provider_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  voice_call_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,79}$'),
  provider_event_id text not null check (
    char_length(btrim(provider_event_id)) between 1 and 255
  ),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint voice_provider_events_call_same_tenant
    foreign key (business_id, voice_call_id)
    references public.voice_calls(business_id, id) on delete cascade,
  unique (provider, provider_event_id)
);

create index voice_provider_events_call_created
  on public.voice_provider_events(business_id, voice_call_id, created_at, id);

alter table public.voice_receptionist_settings enable row level security;
alter table public.voice_receptionist_settings force row level security;
alter table public.voice_calls enable row level security;
alter table public.voice_calls force row level security;
alter table public.voice_provider_events enable row level security;
alter table public.voice_provider_events force row level security;

revoke all on public.voice_receptionist_settings, public.voice_calls, public.voice_provider_events
  from public, anon, authenticated;

grant select on public.voice_receptionist_settings, public.voice_calls
  to authenticated;

grant insert(
  business_id, enabled, greeting, provider, voice, preferred_language,
  allowed_tools, handoff_behavior, additional_instructions
) on public.voice_receptionist_settings to authenticated;

grant update(
  enabled, greeting, provider, voice, preferred_language,
  allowed_tools, handoff_behavior, additional_instructions
) on public.voice_receptionist_settings to authenticated;

create policy voice_settings_read on public.voice_receptionist_settings
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy voice_settings_insert on public.voice_receptionist_settings
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create policy voice_settings_update on public.voice_receptionist_settings
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

create policy voice_calls_read on public.voice_calls
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_voice_api') then
    create role codeedge_voice_api nologin noinherit nobypassrls;
  elsif exists(
    select 1
    from pg_roles
    where rolname='codeedge_voice_api'
      and (
        rolsuper or rolbypassrls or rolcanlogin or rolinherit or
        rolcreaterole or rolcreatedb or rolreplication
      )
  ) then
    raise exception 'Unsafe pre-existing voice role';
  end if;
end $$;

grant codeedge_voice_api to postgres;
grant usage on schema public, private to codeedge_voice_api;

create function private.voice_status_can_transition(
  p_current public.voice_call_status,
  p_next public.voice_call_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_current = p_next
    or (p_current = 'queued' and p_next in (
      'ringing','in_progress','completed','failed','no_answer','busy','cancelled'
    ))
    or (p_current = 'ringing' and p_next in (
      'in_progress','completed','failed','no_answer','busy','cancelled'
    ))
    or (p_current = 'in_progress' and p_next in (
      'completed','failed','cancelled'
    ))
$$;

revoke all on function private.voice_status_can_transition(
  public.voice_call_status, public.voice_call_status
) from public, anon, authenticated;

create function private.active_voice_connection(
  p_provider text,
  p_external_sender_id text
)
returns public.channel_connections
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.channel_connections%rowtype;
begin
  if p_provider is null
     or p_provider !~ '^[a-z][a-z0-9_]{1,79}$'
     or p_external_sender_id is null
     or char_length(btrim(p_external_sender_id)) not between 1 and 255 then
    raise exception 'Voice connection unavailable' using errcode = '42501';
  end if;

  select cc.*
  into result
  from public.channel_connections cc
  join public.businesses b on b.id = cc.business_id
  where cc.channel = 'voice'
    and cc.provider = p_provider
    and cc.external_sender_id = btrim(p_external_sender_id)
    and cc.enabled
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Voice connection unavailable' using errcode = '42501';
  end if;

  return result;
end;
$$;

revoke all on function private.active_voice_connection(text,text)
  from public, anon, authenticated;

create function public.voice_resolve_connection(
  p_provider text,
  p_external_sender_id text
)
returns table(
  business_id uuid,
  connection_id uuid,
  provider text,
  external_account_id text,
  external_sender_id text,
  credential_key text,
  credential_environment public.credential_environment
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  connection public.channel_connections%rowtype;
begin
  connection := private.active_voice_connection(p_provider, p_external_sender_id);

  return query
    select connection.business_id,
      connection.id,
      connection.provider,
      connection.external_account_id,
      connection.external_sender_id,
      connection.credential_key,
      connection.credential_environment;
end;
$$;

create function public.voice_prepare_outbound(
  p_business_id uuid,
  p_user_id uuid,
  p_correlation_id uuid,
  p_lead_id uuid default null,
  p_customer_id uuid default null
)
returns table(
  voice_call_id uuid,
  conversation_id uuid,
  provider text,
  assistant_id text,
  phone_number_id text,
  display_address text,
  credential_key text,
  execution_mode public.execution_mode,
  provider_environment public.credential_environment,
  recipient text,
  status public.voice_call_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_row public.businesses%rowtype;
  connection public.channel_connections%rowtype;
  existing public.voice_calls%rowtype;
  conversation_row public.conversations%rowtype;
  lead_row public.leads%rowtype;
  customer_row public.customers%rowtype;
  target_phone text;
  target_lead_id uuid;
  target_customer_id uuid;
  new_call_id uuid;
begin
  if p_correlation_id is null then
    raise exception 'Invalid Voice request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner','staff')
      and b.status = 'active'
  ) then
    raise exception 'Voice unavailable' using errcode = '42501';
  end if;

  select *
  into business_row
  from public.businesses
  where id = p_business_id
    and status = 'active'
  limit 1;

  if business_row.execution_mode = 'demo' then
    raise exception 'Live Voice blocked for Demo workspace' using errcode = '42501';
  end if;

  select *
  into existing
  from public.voice_calls
  where business_id = p_business_id
    and correlation_id = p_correlation_id
  limit 1;

  if found then
    select cc.*
    into connection
    from public.channel_connections cc
    where cc.business_id = existing.business_id
      and cc.id = existing.channel_connection_id
      and cc.channel = 'voice'
      and cc.enabled
    limit 1;

    if not found then
      raise exception 'Voice connection unavailable' using errcode = '42501';
    end if;

    return query
      select existing.id,
        existing.conversation_id,
        existing.provider,
        connection.external_account_id,
        connection.external_sender_id,
        connection.display_address,
        connection.credential_key,
        existing.execution_mode,
        existing.provider_environment,
        existing.to_number,
        existing.status,
        false;
    return;
  end if;

  if p_customer_id is not null then
    select c.*
    into customer_row
    from public.customers c
    where c.business_id = p_business_id
      and c.id = p_customer_id
    limit 1;

    if not found then
      raise exception 'Customer unavailable' using errcode = '42501';
    end if;

    target_customer_id := customer_row.id;
    target_lead_id := customer_row.source_lead_id;
    target_phone := nullif(btrim(customer_row.phone), '');

    if p_lead_id is not null and p_lead_id <> target_lead_id then
      raise exception 'CRM identity mismatch' using errcode = '42501';
    end if;
  elsif p_lead_id is not null then
    select l.*
    into lead_row
    from public.leads l
    where l.business_id = p_business_id
      and l.id = p_lead_id
    limit 1;

    if not found then
      raise exception 'Lead unavailable' using errcode = '42501';
    end if;

    target_lead_id := lead_row.id;
    target_phone := nullif(btrim(lead_row.phone), '');
  else
    raise exception 'Lead or Customer is required' using errcode = '22023';
  end if;

  if target_phone is null or char_length(target_phone) > 80 then
    raise exception 'Voice recipient unavailable' using errcode = '22023';
  end if;

  select cc.*
  into connection
  from public.channel_connections cc
  where cc.business_id = p_business_id
    and cc.channel = 'voice'
    and cc.enabled
    and cc.provider <> 'demo_voice'
  order by cc.created_at asc, cc.id
  limit 1;

  if not found then
    raise exception 'Voice connection unavailable' using errcode = '42501';
  end if;

  select c.*
  into conversation_row
  from public.conversations c
  where c.business_id = p_business_id
    and c.channel = 'voice'
    and c.channel_connection_id = connection.id
    and c.lead_id is not distinct from target_lead_id
    and c.customer_id is not distinct from target_customer_id
  order by c.created_at desc, c.id
  limit 1;

  if not found then
    insert into public.conversations(
      business_id,
      lead_id,
      customer_id,
      channel_connection_id,
      channel,
      status,
      subject,
      created_by
    ) values (
      p_business_id,
      target_lead_id,
      target_customer_id,
      connection.id,
      'voice',
      'open',
      'AI Voice call',
      p_user_id
    )
    returning * into conversation_row;
  end if;

  insert into public.voice_calls(
    business_id,
    conversation_id,
    lead_id,
    customer_id,
    channel_connection_id,
    provider,
    direction,
    from_number,
    to_number,
    status,
    execution_mode,
    provider_environment,
    correlation_id
  ) values (
    p_business_id,
    conversation_row.id,
    target_lead_id,
    target_customer_id,
    connection.id,
    connection.provider,
    'outbound',
    connection.display_address,
    target_phone,
    'queued',
    business_row.execution_mode,
    connection.credential_environment,
    p_correlation_id
  )
  returning id into new_call_id;

  return query
    select new_call_id,
      conversation_row.id,
      connection.provider,
      connection.external_account_id,
      connection.external_sender_id,
      connection.display_address,
      connection.credential_key,
      business_row.execution_mode,
      connection.credential_environment,
      target_phone,
      'queued'::public.voice_call_status,
      true;
end;
$$;

create function public.voice_external_effect_context(p_voice_call_id uuid)
returns table(
  business_id uuid,
  execution_mode public.execution_mode,
  prepared_execution_mode public.execution_mode,
  provider text,
  provider_environment public.credential_environment,
  prepared_provider_environment public.credential_environment,
  correlation_id uuid,
  simulated boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select vc.business_id,
      b.execution_mode,
      vc.execution_mode,
      vc.provider,
      cc.credential_environment,
      vc.provider_environment,
      vc.correlation_id,
      false
    from public.voice_calls vc
    join public.businesses b on b.id = vc.business_id
    join public.channel_connections cc
      on cc.business_id = vc.business_id
     and cc.id = vc.channel_connection_id
     and cc.channel = 'voice'
     and cc.provider = vc.provider
    where vc.id = p_voice_call_id
      and vc.provider <> 'demo_voice'
      and vc.provider_environment is not null
      and b.status = 'active'
      and cc.enabled
    limit 1;

  if not found then
    raise exception 'Voice execution context unavailable' using errcode = '42501';
  end if;
end;
$$;

create function public.voice_accept_outbound(
  p_voice_call_id uuid,
  p_provider_call_id text,
  p_status public.voice_call_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.voice_calls%rowtype;
begin
  if p_provider_call_id is null
     or char_length(btrim(p_provider_call_id)) not between 1 and 255
     or p_status not in ('queued','ringing','in_progress') then
    raise exception 'Invalid Voice provider response' using errcode = '22023';
  end if;

  select *
  into row
  from public.voice_calls
  where id = p_voice_call_id
    and provider <> 'demo_voice'
  limit 1
  for update;

  if not found then
    raise exception 'Voice unavailable' using errcode = '42501';
  end if;

  if row.provider_call_id is not null then
    if row.provider_call_id = btrim(p_provider_call_id) then
      return false;
    end if;
    raise exception 'Voice provider identity mismatch' using errcode = '23505';
  end if;

  update public.voice_calls
  set provider_call_id = btrim(p_provider_call_id),
      status = p_status,
      answered_at = case when p_status = 'in_progress'
        then coalesce(answered_at, clock_timestamp()) else answered_at end
  where id = row.id;

  update public.conversations
  set external_thread_id = btrim(p_provider_call_id)
  where business_id = row.business_id
    and id = row.conversation_id
    and external_thread_id is null;

  return true;
end;
$$;

create function public.voice_fail_outbound(
  p_voice_call_id uuid,
  p_disposition text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.voice_calls
  set status = 'failed',
      ended_at = coalesce(ended_at, clock_timestamp()),
      disposition = left(coalesce(nullif(btrim(p_disposition), ''), 'provider_error'), 120)
  where id = p_voice_call_id
    and provider <> 'demo_voice'
    and provider_call_id is null
    and status = 'queued';

  return found;
end;
$$;

create function public.voice_receive_event(
  p_connection_id uuid,
  p_provider_event_id text,
  p_provider_call_id text,
  p_direction public.voice_call_direction,
  p_from_number text,
  p_to_number text,
  p_status public.voice_call_status,
  p_occurred_at timestamptz
)
returns table(
  voice_call_id uuid,
  conversation_id uuid,
  business_id uuid,
  lead_id uuid,
  customer_id uuid,
  inserted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection public.channel_connections%rowtype;
  call_row public.voice_calls%rowtype;
  conversation_row public.conversations%rowtype;
  lead_value uuid;
  customer_value uuid;
  normalized_phone text;
  event_inserted boolean := false;
  business_mode public.execution_mode;
begin
  if p_provider_event_id is null
     or char_length(btrim(p_provider_event_id)) not between 1 and 255
     or p_provider_call_id is null
     or char_length(btrim(p_provider_call_id)) not between 1 and 255 then
    raise exception 'Invalid Voice event' using errcode = '22023';
  end if;

  select cc.*
  into connection
  from public.channel_connections cc
  join public.businesses b on b.id = cc.business_id
  where cc.id = p_connection_id
    and cc.channel = 'voice'
    and cc.enabled
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Voice connection unavailable' using errcode = '42501';
  end if;

  select vc.*
  into call_row
  from public.voice_calls vc
  where vc.provider = connection.provider
    and vc.provider_call_id = btrim(p_provider_call_id)
  limit 1
  for update;

  if not found then
    if p_direction <> 'inbound' then
      raise exception 'Voice call unavailable' using errcode = '42501';
    end if;

    normalized_phone := regexp_replace(coalesce(p_from_number, ''), '[^0-9]', '', 'g');

    if normalized_phone <> '' then
      select c.id, c.source_lead_id
      into customer_value, lead_value
      from public.customers c
      where c.business_id = connection.business_id
        and regexp_replace(c.phone, '[^0-9]', '', 'g') = normalized_phone
      order by c.created_at desc, c.id
      limit 1;

      if customer_value is null then
        select l.id
        into lead_value
        from public.leads l
        where l.business_id = connection.business_id
          and regexp_replace(l.phone, '[^0-9]', '', 'g') = normalized_phone
        order by l.created_at desc, l.id
        limit 1;
      end if;
    end if;

    if lead_value is null then
      insert into public.leads(
        business_id,
        contact_name,
        phone,
        email,
        source,
        enquiry_summary,
        status,
        last_contact_at,
        created_by
      ) values (
        connection.business_id,
        case when normalized_phone <> ''
          then 'Voice caller ' || right(normalized_phone, 4)
          else 'Voice caller' end,
        left(coalesce(p_from_number, ''), 80),
        '',
        'voice_ai',
        'Inbound AI Voice call',
        'new',
        clock_timestamp(),
        null
      )
      returning id into lead_value;
    end if;

    insert into public.conversations(
      business_id,
      lead_id,
      customer_id,
      channel_connection_id,
      channel,
      status,
      subject,
      external_thread_id,
      created_by
    ) values (
      connection.business_id,
      lead_value,
      customer_value,
      connection.id,
      'voice',
      'open',
      'AI Voice · ' || coalesce(nullif(btrim(p_from_number), ''), 'caller'),
      btrim(p_provider_call_id),
      null
    )
    returning * into conversation_row;

    select execution_mode
    into business_mode
    from public.businesses
    where id = connection.business_id;

    insert into public.voice_calls(
      business_id,
      conversation_id,
      lead_id,
      customer_id,
      channel_connection_id,
      provider,
      provider_call_id,
      direction,
      from_number,
      to_number,
      status,
      started_at,
      answered_at,
      execution_mode,
      provider_environment
    ) values (
      connection.business_id,
      conversation_row.id,
      lead_value,
      customer_value,
      connection.id,
      connection.provider,
      btrim(p_provider_call_id),
      'inbound',
      left(coalesce(p_from_number, ''), 80),
      left(coalesce(p_to_number, ''), 80),
      p_status,
      p_occurred_at,
      case when p_status = 'in_progress' then p_occurred_at else null end,
      business_mode,
      connection.credential_environment
    )
    returning * into call_row;
  else
    conversation_row.id := call_row.conversation_id;

    if not private.voice_status_can_transition(call_row.status, p_status) then
      raise exception 'Invalid Voice status transition' using errcode = '22023';
    end if;

    update public.voice_calls
    set status = p_status,
        answered_at = case
          when p_status = 'in_progress' then coalesce(answered_at, p_occurred_at)
          else answered_at
        end,
        ended_at = case
          when p_status in ('completed','failed','no_answer','busy','cancelled')
            then coalesce(ended_at, p_occurred_at)
          else ended_at
        end,
        duration_seconds = case
          when p_status in ('completed','failed','no_answer','busy','cancelled')
            then greatest(0, extract(epoch from (
              coalesce(ended_at, p_occurred_at) - started_at
            ))::integer)
          else duration_seconds
        end
    where id = call_row.id
    returning * into call_row;
  end if;

  insert into public.voice_provider_events(
    business_id,
    voice_call_id,
    provider,
    provider_event_id,
    occurred_at
  ) values (
    call_row.business_id,
    call_row.id,
    call_row.provider,
    btrim(p_provider_event_id),
    p_occurred_at
  )
  on conflict (provider, provider_event_id) do nothing
  returning true into event_inserted;

  return query
    select call_row.id,
      call_row.conversation_id,
      call_row.business_id,
      call_row.lead_id,
      call_row.customer_id,
      coalesce(event_inserted, false);
end;
$$;

create function public.voice_append_transcript(
  p_voice_call_id uuid,
  p_provider_message_id text,
  p_speaker text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.voice_calls%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255
     or p_speaker not in ('caller','assistant')
     or p_body is null
     or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Invalid Voice transcript' using errcode = '22023';
  end if;

  select *
  into call_row
  from public.voice_calls
  where id = p_voice_call_id
  limit 1;

  if not found then
    raise exception 'Voice call unavailable' using errcode = '42501';
  end if;

  select id
  into existing_id
  from public.messages
  where business_id = call_row.business_id
    and conversation_id = call_row.conversation_id
    and channel_message_id = btrim(p_provider_message_id)
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.messages(
    business_id,
    conversation_id,
    sender_type,
    sender_user_id,
    direction,
    body,
    channel_message_id
  ) values (
    call_row.business_id,
    call_row.conversation_id,
    case when p_speaker = 'caller'
      then 'customer'::public.message_sender_type
      else 'ai'::public.message_sender_type end,
    null,
    case when p_speaker = 'caller'
      then 'inbound'::public.message_direction
      else 'outbound'::public.message_direction end,
    btrim(p_body),
    btrim(p_provider_message_id)
  )
  returning id into new_id;

  return new_id;
end;
$$;

create function public.voice_complete_call(
  p_business_id uuid,
  p_voice_call_id uuid,
  p_summary text,
  p_disposition text,
  p_handoff_required boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.voice_calls%rowtype;
begin
  select *
  into call_row
  from public.voice_calls
  where business_id = p_business_id
    and id = p_voice_call_id
  limit 1
  for update;

  if not found then
    raise exception 'Voice call unavailable' using errcode = '42501';
  end if;

  update public.voice_calls
  set summary = left(coalesce(btrim(p_summary), ''), 3000),
      disposition = left(coalesce(btrim(p_disposition), ''), 120),
      handoff_required = coalesce(p_handoff_required, false),
      status = case
        when not coalesce(p_handoff_required, false)
          and status in ('queued','ringing','in_progress')
          then 'completed'::public.voice_call_status
        else status
      end,
      ended_at = case
        when not coalesce(p_handoff_required, false)
          and status in ('queued','ringing','in_progress')
          then coalesce(ended_at, clock_timestamp())
        else ended_at
      end,
      duration_seconds = case
        when not coalesce(p_handoff_required, false)
          and status in ('queued','ringing','in_progress')
          then greatest(0, extract(epoch from (
            coalesce(ended_at, clock_timestamp()) - started_at
          ))::integer)
        else duration_seconds
      end
  where id = call_row.id;

  if coalesce(p_handoff_required, false) then
    update public.conversations
    set status = 'pending'
    where business_id = call_row.business_id
      and id = call_row.conversation_id;
  end if;

  return true;
end;
$$;

create function public.voice_start_demo_call(
  p_business_id uuid,
  p_user_id uuid,
  p_correlation_id uuid,
  p_contact_name text,
  p_contact_phone text
)
returns table(
  voice_call_id uuid,
  conversation_id uuid,
  lead_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.voice_calls%rowtype;
  lead_value uuid;
  conversation_value uuid;
begin
  if p_correlation_id is null
     or p_user_id is distinct from (select auth.uid())
     or p_contact_name is null
     or char_length(btrim(p_contact_name)) not between 1 and 120
     or char_length(coalesce(p_contact_phone, '')) > 80 then
    raise exception 'Invalid Demo Voice request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner','staff')
      and b.status = 'active'
      and b.execution_mode = 'demo'
  ) then
    raise exception 'Demo Voice unavailable' using errcode = '42501';
  end if;

  select *
  into existing
  from public.voice_calls
  where business_id = p_business_id
    and correlation_id = p_correlation_id
  limit 1;

  if found then
    return query select existing.id, existing.conversation_id, existing.lead_id, false;
    return;
  end if;

  select l.id
  into lead_value
  from public.leads l
  where l.business_id = p_business_id
    and p_contact_phone <> ''
    and regexp_replace(l.phone, '[^0-9]', '', 'g')
      = regexp_replace(p_contact_phone, '[^0-9]', '', 'g')
  order by l.created_at desc, l.id
  limit 1;

  if lead_value is null then
    insert into public.leads(
      business_id,
      contact_name,
      phone,
      email,
      source,
      enquiry_summary,
      status,
      last_contact_at,
      created_by
    ) values (
      p_business_id,
      btrim(p_contact_name),
      left(coalesce(p_contact_phone, ''), 80),
      '',
      'voice_ai',
      'Demo AI Voice enquiry',
      'new',
      clock_timestamp(),
      p_user_id
    )
    returning id into lead_value;
  end if;

  insert into public.conversations(
    business_id,
    lead_id,
    channel,
    status,
    subject,
    created_by
  ) values (
    p_business_id,
    lead_value,
    'voice',
    'open',
    'Demo AI Voice · ' || btrim(p_contact_name),
    p_user_id
  )
  returning id into conversation_value;

  insert into public.voice_calls(
    business_id,
    conversation_id,
    lead_id,
    provider,
    direction,
    from_number,
    to_number,
    status,
    answered_at,
    execution_mode,
    provider_environment,
    correlation_id
  ) values (
    p_business_id,
    conversation_value,
    lead_value,
    'demo_voice',
    'inbound',
    left(coalesce(p_contact_phone, 'demo:caller'), 80),
    'demo:codeedge',
    'in_progress',
    clock_timestamp(),
    'demo',
    null,
    p_correlation_id
  )
  returning id into existing.id;

  return query select existing.id, conversation_value, lead_value, true;
end;
$$;


create function private.crm_activity_from_voice_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if new.lead_id is not null and new.source = 'voice' then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'appointment_created_from_voice',
      'Appointment created from AI Voice',
      jsonb_build_object('appointment_id', new.id, 'starts_at', new.starts_at)
    );
  end if;
  return new;
end;
$;

create trigger crm_activity_voice_appointments
after insert on public.appointments
for each row execute function private.crm_activity_from_voice_appointment();

revoke all on function private.crm_activity_from_voice_appointment()
  from public, anon, authenticated;

create function private.crm_activity_from_voice_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'voice_call_started',
      'AI Voice call started',
      jsonb_build_object('voice_call_id', new.id, 'direction', new.direction::text)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'completed' then
      perform private.append_crm_activity(
        new.business_id,
        new.lead_id,
        'voice_call_completed',
        'AI Voice call completed',
        jsonb_build_object('voice_call_id', new.id)
      );
    elsif new.status in ('failed','no_answer','busy','cancelled') then
      perform private.append_crm_activity(
        new.business_id,
        new.lead_id,
        'voice_call_failed',
        'AI Voice call did not complete',
        jsonb_build_object('voice_call_id', new.id, 'status', new.status::text)
      );
    end if;
  end if;

  if old.handoff_required is distinct from new.handoff_required
     and new.handoff_required then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'voice_handoff_requested',
      'AI Voice requested human assistance',
      jsonb_build_object('voice_call_id', new.id)
    );
  end if;

  return new;
end;
$$;

create trigger crm_activity_voice_calls
after insert or update on public.voice_calls
for each row execute function private.crm_activity_from_voice_call();

revoke all on function private.crm_activity_from_voice_call()
  from public, anon, authenticated;

revoke all on function public.voice_resolve_connection(text,text)
  from public, anon, authenticated;
revoke all on function public.voice_prepare_outbound(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.voice_external_effect_context(uuid)
  from public, anon, authenticated;
revoke all on function public.voice_accept_outbound(uuid,text,public.voice_call_status)
  from public, anon, authenticated;
revoke all on function public.voice_fail_outbound(uuid,text)
  from public, anon, authenticated;
revoke all on function public.voice_receive_event(
  uuid,text,text,public.voice_call_direction,text,text,public.voice_call_status,timestamptz
) from public, anon, authenticated;
revoke all on function public.voice_append_transcript(uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.voice_complete_call(uuid,uuid,text,text,boolean)
  from public, anon, authenticated;
revoke all on function public.voice_start_demo_call(uuid,uuid,uuid,text,text)
  from public, anon;

grant execute on function public.voice_resolve_connection(text,text)
  to codeedge_voice_api;
grant execute on function public.voice_prepare_outbound(uuid,uuid,uuid,uuid,uuid)
  to codeedge_voice_api;
grant execute on function public.voice_external_effect_context(uuid)
  to codeedge_voice_api;
grant execute on function public.voice_accept_outbound(uuid,text,public.voice_call_status)
  to codeedge_voice_api;
grant execute on function public.voice_fail_outbound(uuid,text)
  to codeedge_voice_api;
grant execute on function public.voice_receive_event(
  uuid,text,text,public.voice_call_direction,text,text,public.voice_call_status,timestamptz
) to codeedge_voice_api;
grant execute on function public.voice_append_transcript(uuid,text,text,text)
  to codeedge_voice_api;
grant execute on function public.voice_complete_call(uuid,uuid,text,text,boolean)
  to codeedge_voice_api;
grant execute on function public.voice_start_demo_call(uuid,uuid,uuid,text,text)
  to authenticated;

comment on table public.voice_calls is
  'Tenant-owned Codeedge Voice Call lifecycle. Provider-specific states are normalized before persistence.';
comment on table public.voice_receptionist_settings is
  'Canonical tenant-owned AI Receptionist configuration. Provider dashboards are not the source of truth.';
comment on table public.voice_provider_events is
  'Deduplication ledger for authenticated provider Voice events.';
