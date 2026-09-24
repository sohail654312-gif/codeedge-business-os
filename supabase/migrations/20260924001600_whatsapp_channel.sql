-- Production WhatsApp channel using the canonical Conversation + Message core.
-- Provider credentials remain server-only; this migration stores only an opaque credential key.

create type public.delivery_status as enum (
  'sending',
  'sent',
  'delivered',
  'read',
  'failed'
);

create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel public.conversation_channel not null,
  provider text not null check (
    provider ~ '^[a-z][a-z0-9_]{1,79}$'
  ),
  external_account_id text not null default '' check (char_length(external_account_id) <= 255),
  external_sender_id text not null check (
    char_length(btrim(external_sender_id)) between 1 and 255
  ),
  display_address text not null default '' check (char_length(display_address) <= 120),
  credential_key text not null check (
    credential_key ~ '^[A-Za-z0-9._-]{2,80}$'
  ),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel <> 'internal'),
  unique (business_id, id),
  unique (business_id, channel, provider),
  unique (channel, provider, external_sender_id),
  unique (business_id, id, channel)
);

create index channel_connections_business_channel
  on public.channel_connections(business_id, channel);

create trigger channel_connections_updated
before update on public.channel_connections
for each row execute function private.touch_updated_at();

alter table public.conversations
  add column channel_connection_id uuid;

alter table public.conversations
  add constraint conversations_channel_connection_same_tenant
  foreign key (business_id, channel_connection_id, channel)
  references public.channel_connections(business_id, id, channel)
  on delete set null (channel_connection_id);

drop index public.conversations_external_thread_unique;

create unique index conversations_external_thread_unique
  on public.conversations(business_id, channel, external_thread_id)
  where external_thread_id is not null
    and channel_connection_id is null;

create unique index conversations_connection_external_thread_unique
  on public.conversations(
    business_id,
    channel,
    channel_connection_id,
    external_thread_id
  )
  where external_thread_id is not null
    and channel_connection_id is not null;

create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  message_id uuid not null,
  conversation_id uuid not null,
  connection_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,79}$'),
  status public.delivery_status not null default 'sending',
  provider_message_id text check (
    provider_message_id is null or char_length(btrim(provider_message_id)) between 1 and 255
  ),
  error_code text check (
    error_code is null or char_length(btrim(error_code)) between 1 and 100
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, message_id),
  constraint message_delivery_message_same_tenant
    foreign key (business_id, message_id)
    references public.messages(business_id, id)
    on delete cascade,
  constraint message_delivery_conversation_same_tenant
    foreign key (business_id, conversation_id)
    references public.conversations(business_id, id)
    on delete cascade,
  constraint message_delivery_connection_same_tenant
    foreign key (business_id, connection_id)
    references public.channel_connections(business_id, id)
    on delete restrict
);

create unique index message_deliveries_provider_message_unique
  on public.message_deliveries(provider, provider_message_id)
  where provider_message_id is not null;

create index message_deliveries_conversation
  on public.message_deliveries(business_id, conversation_id, created_at, id);

create trigger message_deliveries_updated
before update on public.message_deliveries
for each row execute function private.touch_updated_at();

alter table public.channel_connections enable row level security;
alter table public.channel_connections force row level security;
alter table public.message_deliveries enable row level security;
alter table public.message_deliveries force row level security;

revoke all on public.channel_connections, public.message_deliveries
  from public, anon, authenticated;

grant select on public.channel_connections, public.message_deliveries
  to authenticated;

grant insert(
  business_id,
  channel,
  provider,
  external_account_id,
  external_sender_id,
  display_address,
  credential_key,
  enabled
) on public.channel_connections to authenticated;

grant update(
  external_account_id,
  external_sender_id,
  display_address,
  credential_key,
  enabled
) on public.channel_connections to authenticated;

create policy channel_connections_read
on public.channel_connections
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy channel_connections_insert
on public.channel_connections
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create policy channel_connections_update
on public.channel_connections
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

create policy message_deliveries_read
on public.message_deliveries
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

-- External-provider replies must not be forgeable directly from the browser.
drop policy messages_create_staff on public.messages;

create policy messages_create_staff
on public.messages
for insert to authenticated
with check (
  sender_type = 'staff'
  and sender_user_id = (select auth.uid())
  and channel_message_id is null
  and request_id is null
  and private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
  and (
    direction = 'internal'
    or (
      direction = 'outbound'
      and exists (
        select 1
        from public.conversations c
        where c.business_id = messages.business_id
          and c.id = messages.conversation_id
          and c.channel in ('website_chat','internal')
      )
    )
  )
);

-- Dedicated server-side communication capability. Browser roles cannot assume it.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_communication_api') then
    create role codeedge_communication_api nologin noinherit nobypassrls;
  elsif exists(
    select 1
    from pg_roles
    where rolname='codeedge_communication_api'
      and (
        rolsuper or rolbypassrls or rolcanlogin or rolinherit or
        rolcreaterole or rolcreatedb or rolreplication
      )
  ) then
    raise exception 'Unsafe pre-existing communication role';
  end if;
end $$;

grant codeedge_communication_api to postgres;
grant usage on schema public, private to codeedge_communication_api;

create function private.active_whatsapp_connection(p_external_sender_id text)
returns public.channel_connections
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.channel_connections%rowtype;
begin
  if p_external_sender_id is null
     or char_length(btrim(p_external_sender_id)) not between 1 and 255 then
    raise exception 'WhatsApp unavailable' using errcode = '42501';
  end if;

  select cc.*
  into result
  from public.channel_connections cc
  join public.businesses b on b.id = cc.business_id
  where cc.channel = 'whatsapp'
    and cc.provider = 'meta_whatsapp_cloud'
    and cc.external_sender_id = btrim(p_external_sender_id)
    and cc.enabled
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'WhatsApp unavailable' using errcode = '42501';
  end if;

  return result;
end;
$$;

revoke all on function private.active_whatsapp_connection(text)
  from public, anon, authenticated;

create function public.whatsapp_receive_text(
  p_external_sender_id text,
  p_customer_wa_id text,
  p_customer_name text,
  p_provider_message_id text,
  p_body text
)
returns table(
  conversation_id uuid,
  message_id uuid,
  inserted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection public.channel_connections%rowtype;
  conversation_row public.conversations%rowtype;
  existing_message_id uuid;
  lead_id uuid;
  customer_id uuid;
  contact_name text;
  normalized_customer text;
  new_message_id uuid;
begin
  if p_customer_wa_id is null or p_customer_wa_id !~ '^[0-9]{5,32}$' then
    raise exception 'WhatsApp unavailable' using errcode = '42501';
  end if;

  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'WhatsApp unavailable' using errcode = '42501';
  end if;

  if p_body is null
     or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'WhatsApp unavailable' using errcode = '42501';
  end if;

  connection := private.active_whatsapp_connection(p_external_sender_id);
  normalized_customer := p_customer_wa_id;
  contact_name := nullif(left(btrim(coalesce(p_customer_name, '')), 120), '');

  select c.*
  into conversation_row
  from public.conversations c
  where c.business_id = connection.business_id
    and c.channel = 'whatsapp'
    and c.channel_connection_id = connection.id
    and c.external_thread_id = normalized_customer
  limit 1
  for update;

  if found then
    select m.id
    into existing_message_id
    from public.messages m
    where m.business_id = connection.business_id
      and m.conversation_id = conversation_row.id
      and m.channel_message_id = btrim(p_provider_message_id)
    limit 1;

    if existing_message_id is not null then
      return query select conversation_row.id, existing_message_id, false;
      return;
    end if;
  else
    select c.id, c.source_lead_id
    into customer_id, lead_id
    from public.customers c
    where c.business_id = connection.business_id
      and regexp_replace(c.phone, '[^0-9]', '', 'g') = normalized_customer
    order by c.created_at desc, c.id
    limit 1;

    if customer_id is null then
      select l.id
      into lead_id
      from public.leads l
      where l.business_id = connection.business_id
        and regexp_replace(l.phone, '[^0-9]', '', 'g') = normalized_customer
      order by l.created_at desc, l.id
      limit 1;
    end if;

    if lead_id is null then
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
        coalesce(contact_name, 'WhatsApp contact'),
        '+' || normalized_customer,
        '',
        'whatsapp',
        left(btrim(p_body), 3000),
        'new',
        clock_timestamp(),
        null
      )
      returning id into lead_id;
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
      lead_id,
      customer_id,
      connection.id,
      'whatsapp',
      'open',
      'WhatsApp · ' || coalesce(contact_name, '+' || normalized_customer),
      normalized_customer,
      null
    )
    returning * into conversation_row;
  end if;

  update public.conversations
  set status = 'open'
  where business_id = connection.business_id
    and id = conversation_row.id
    and status <> 'open';

  insert into public.messages(
    business_id,
    conversation_id,
    sender_type,
    sender_user_id,
    direction,
    body,
    channel_message_id
  ) values (
    connection.business_id,
    conversation_row.id,
    'customer',
    null,
    'inbound',
    btrim(p_body),
    btrim(p_provider_message_id)
  )
  on conflict do nothing
  returning id into new_message_id;

  if new_message_id is null then
    select m.id
    into new_message_id
    from public.messages m
    where m.business_id = connection.business_id
      and m.conversation_id = conversation_row.id
      and m.channel_message_id = btrim(p_provider_message_id)
    limit 1;

    return query select conversation_row.id, new_message_id, false;
    return;
  end if;

  update public.leads
  set last_contact_at = clock_timestamp()
  where business_id = connection.business_id
    and id = conversation_row.lead_id;

  return query select conversation_row.id, new_message_id, true;
end;
$$;

create function public.whatsapp_prepare_outbound(
  p_business_id uuid,
  p_conversation_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_body text
)
returns table(
  message_id uuid,
  connection_id uuid,
  provider text,
  external_sender_id text,
  credential_key text,
  recipient text,
  delivery_status public.delivery_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.conversations%rowtype;
  connection_row public.channel_connections%rowtype;
  existing_message public.messages%rowtype;
  existing_delivery public.message_deliveries%rowtype;
  new_message_id uuid;
begin
  if p_request_id is null then
    raise exception 'Invalid delivery request' using errcode = '22023';
  end if;

  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Invalid delivery request' using errcode = '22023';
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
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  select c.*
  into conversation_row
  from public.conversations c
  where c.business_id = p_business_id
    and c.id = p_conversation_id
    and c.channel = 'whatsapp'
    and c.channel_connection_id is not null
    and c.external_thread_id ~ '^[0-9]{5,32}$'
  limit 1;

  if not found then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  select cc.*
  into connection_row
  from public.channel_connections cc
  where cc.business_id = p_business_id
    and cc.id = conversation_row.channel_connection_id
    and cc.channel = 'whatsapp'
    and cc.provider = 'meta_whatsapp_cloud'
    and cc.enabled
  limit 1;

  if not found then
    raise exception 'WhatsApp unavailable' using errcode = '42501';
  end if;

  select m.*
  into existing_message
  from public.messages m
  where m.business_id = p_business_id
    and m.conversation_id = p_conversation_id
    and m.request_id = p_request_id
  limit 1;

  if found then
    select d.*
    into existing_delivery
    from public.message_deliveries d
    where d.business_id = p_business_id
      and d.message_id = existing_message.id
    limit 1;

    if existing_delivery.id is null then
      raise exception 'Delivery unavailable' using errcode = '42501';
    end if;

    return query
      select existing_message.id,
        connection_row.id,
        connection_row.provider,
        connection_row.external_sender_id,
        connection_row.credential_key,
        conversation_row.external_thread_id,
        existing_delivery.status,
        false;
    return;
  end if;

  insert into public.messages(
    business_id,
    conversation_id,
    sender_type,
    sender_user_id,
    direction,
    body,
    request_id
  ) values (
    p_business_id,
    p_conversation_id,
    'staff',
    p_user_id,
    'outbound',
    btrim(p_body),
    p_request_id
  )
  returning id into new_message_id;

  insert into public.message_deliveries(
    business_id,
    message_id,
    conversation_id,
    connection_id,
    provider,
    status
  ) values (
    p_business_id,
    new_message_id,
    p_conversation_id,
    connection_row.id,
    connection_row.provider,
    'sending'
  );

  return query
    select new_message_id,
      connection_row.id,
      connection_row.provider,
      connection_row.external_sender_id,
      connection_row.credential_key,
      conversation_row.external_thread_id,
      'sending'::public.delivery_status,
      true;
end;
$$;

create function public.whatsapp_complete_outbound(
  p_message_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row public.message_deliveries%rowtype;
  current_channel_message_id text;
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'Invalid provider response' using errcode = '22023';
  end if;

  select d.*
  into delivery_row
  from public.message_deliveries d
  join public.channel_connections cc
    on cc.business_id = d.business_id
   and cc.id = d.connection_id
  where d.message_id = p_message_id
    and d.provider = 'meta_whatsapp_cloud'
    and cc.channel = 'whatsapp'
  limit 1
  for update of d;

  if not found then
    raise exception 'Delivery unavailable' using errcode = '42501';
  end if;

  if delivery_row.status in ('sent','delivered','read')
     and delivery_row.provider_message_id = btrim(p_provider_message_id) then
    return false;
  end if;

  select m.channel_message_id
  into current_channel_message_id
  from public.messages m
  where m.business_id = delivery_row.business_id
    and m.id = p_message_id
  limit 1
  for update;

  if current_channel_message_id is not null
     and current_channel_message_id <> btrim(p_provider_message_id) then
    raise exception 'Delivery identity mismatch' using errcode = '23505';
  end if;

  update public.messages
  set channel_message_id = btrim(p_provider_message_id)
  where business_id = delivery_row.business_id
    and id = p_message_id
    and channel_message_id is null;

  update public.message_deliveries
  set provider_message_id = btrim(p_provider_message_id),
      status = case
        when status in ('delivered','read') then status
        else 'sent'::public.delivery_status
      end,
      error_code = null
  where id = delivery_row.id;

  return true;
end;
$$;

create function public.whatsapp_fail_outbound(
  p_message_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_deliveries d
  set status = 'failed',
      error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'provider_error'), 100)
  from public.channel_connections cc
  where d.message_id = p_message_id
    and cc.business_id = d.business_id
    and cc.id = d.connection_id
    and cc.channel = 'whatsapp'
    and d.provider = 'meta_whatsapp_cloud'
    and d.status = 'sending'
    and d.provider_message_id is null;

  return found;
end;
$$;

create function public.whatsapp_update_delivery(
  p_provider_message_id text,
  p_status public.delivery_status,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.delivery_status;
  next_rank integer;
  current_rank integer;
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  if p_status = 'sending' then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  select d.status
  into current_status
  from public.message_deliveries d
  where d.provider = 'meta_whatsapp_cloud'
    and d.provider_message_id = btrim(p_provider_message_id)
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if p_status = 'failed' then
    update public.message_deliveries
    set status = 'failed',
        error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'provider_error'), 100)
    where provider = 'meta_whatsapp_cloud'
      and provider_message_id = btrim(p_provider_message_id)
      and status not in ('delivered','read');
    return found;
  end if;

  current_rank := case current_status
    when 'sending' then 0
    when 'sent' then 1
    when 'delivered' then 2
    when 'read' then 3
    when 'failed' then -1
  end;
  next_rank := case p_status
    when 'sent' then 1
    when 'delivered' then 2
    when 'read' then 3
    else -1
  end;

  if next_rank > current_rank then
    update public.message_deliveries
    set status = p_status,
        error_code = null
    where provider = 'meta_whatsapp_cloud'
      and provider_message_id = btrim(p_provider_message_id);
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.whatsapp_receive_text(text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_prepare_outbound(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_complete_outbound(uuid,text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_fail_outbound(uuid,text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_update_delivery(text,public.delivery_status,text)
  from public, anon, authenticated;

grant execute on function public.whatsapp_receive_text(text,text,text,text,text)
  to codeedge_communication_api;
grant execute on function public.whatsapp_prepare_outbound(uuid,uuid,uuid,uuid,text)
  to codeedge_communication_api;
grant execute on function public.whatsapp_complete_outbound(uuid,text)
  to codeedge_communication_api;
grant execute on function public.whatsapp_fail_outbound(uuid,text)
  to codeedge_communication_api;
grant execute on function public.whatsapp_update_delivery(text,public.delivery_status,text)
  to codeedge_communication_api;
