-- Production SMS channel using the canonical Conversation + Message core.
-- Twilio is the first replaceable adapter. Raw provider secrets remain server-only.

create function private.active_sms_connection(p_external_sender_id text)
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
     or btrim(p_external_sender_id) !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'SMS unavailable' using errcode = '42501';
  end if;

  select cc.*
  into result
  from public.channel_connections cc
  join public.businesses b on b.id = cc.business_id
  where cc.channel = 'sms'
    and cc.provider = 'twilio_sms'
    and cc.external_sender_id = btrim(p_external_sender_id)
    and cc.enabled
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'SMS unavailable' using errcode = '42501';
  end if;

  return result;
end;
$$;

revoke all on function private.active_sms_connection(text)
  from public, anon, authenticated;
grant execute on function private.active_sms_connection(text)
  to codeedge_communication_api;

create function public.sms_receive_text(
  p_external_sender_id text,
  p_customer_phone text,
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
  normalized_customer text;
  new_message_id uuid;
begin
  if p_customer_phone is null
     or btrim(p_customer_phone) !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'SMS unavailable' using errcode = '42501';
  end if;

  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'SMS unavailable' using errcode = '42501';
  end if;

  if p_body is null
     or char_length(btrim(p_body)) not between 1 and 1600 then
    raise exception 'SMS unavailable' using errcode = '42501';
  end if;

  connection := private.active_sms_connection(p_external_sender_id);
  normalized_customer := btrim(p_customer_phone);

  select c.*
  into conversation_row
  from public.conversations c
  where c.business_id = connection.business_id
    and c.channel = 'sms'
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
      and regexp_replace(c.phone, '[^0-9]', '', 'g')
        = regexp_replace(normalized_customer, '[^0-9]', '', 'g')
    order by c.created_at desc, c.id
    limit 1;

    if customer_id is null then
      select l.id
      into lead_id
      from public.leads l
      where l.business_id = connection.business_id
        and regexp_replace(l.phone, '[^0-9]', '', 'g')
          = regexp_replace(normalized_customer, '[^0-9]', '', 'g')
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
        'SMS contact',
        normalized_customer,
        '',
        'sms',
        left(btrim(p_body), 1600),
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
      'sms',
      'open',
      left('SMS · ' || normalized_customer, 200),
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

create function public.sms_prepare_outbound(
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
  external_account_id text,
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

  if p_body is null or char_length(btrim(p_body)) not between 1 and 1600 then
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
    and c.channel = 'sms'
    and c.channel_connection_id is not null
    and c.external_thread_id ~ '^\+[1-9][0-9]{7,14}$'
  limit 1;

  if not found then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  select cc.*
  into connection_row
  from public.channel_connections cc
  where cc.business_id = p_business_id
    and cc.id = conversation_row.channel_connection_id
    and cc.channel = 'sms'
    and cc.provider = 'twilio_sms'
    and cc.enabled
    and cc.external_account_id ~ '^AC[0-9A-Fa-f]{32}$'
    and cc.external_sender_id ~ '^\+[1-9][0-9]{7,14}$'
  limit 1;

  if not found then
    raise exception 'SMS unavailable' using errcode = '42501';
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
        connection_row.external_account_id,
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
      connection_row.external_account_id,
      connection_row.external_sender_id,
      connection_row.credential_key,
      conversation_row.external_thread_id,
      'sending'::public.delivery_status,
      true;
end;
$$;

create function public.sms_complete_outbound(
  p_message_id uuid,
  p_provider_message_id text,
  p_status public.delivery_status
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

  if p_status not in ('sending','queued','sent','delivered','failed') then
    raise exception 'Invalid provider response' using errcode = '22023';
  end if;

  select d.*
  into delivery_row
  from public.message_deliveries d
  join public.channel_connections cc
    on cc.business_id = d.business_id
   and cc.id = d.connection_id
  where d.message_id = p_message_id
    and d.provider = 'twilio_sms'
    and cc.channel = 'sms'
  limit 1
  for update of d;

  if not found then
    raise exception 'Delivery unavailable' using errcode = '42501';
  end if;

  if delivery_row.provider_message_id is not null
     and delivery_row.provider_message_id <> btrim(p_provider_message_id) then
    raise exception 'Delivery identity mismatch' using errcode = '23505';
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
        when status = 'delivered' then status
        else p_status
      end,
      error_code = case when p_status = 'failed' then 'provider_failed' else null end
  where id = delivery_row.id;

  return true;
end;
$$;

create function public.sms_fail_outbound(
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
    and cc.channel = 'sms'
    and d.provider = 'twilio_sms'
    and d.status = 'sending'
    and d.provider_message_id is null;

  return found;
end;
$$;

create function public.sms_update_delivery(
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
  delivery_row public.message_deliveries%rowtype;
  current_rank integer;
  next_rank integer;
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  if p_status not in ('sending','queued','sent','delivered','failed') then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  select d.*
  into delivery_row
  from public.message_deliveries d
  where d.provider = 'twilio_sms'
    and d.provider_message_id = btrim(p_provider_message_id)
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if delivery_row.status = 'delivered' then
    return false;
  end if;

  if p_status = 'failed' then
    update public.message_deliveries
    set status = 'failed',
        error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'provider_error'), 100)
    where id = delivery_row.id
      and status <> 'delivered';
    return found;
  end if;

  if delivery_row.status = 'failed' then
    return false;
  end if;

  current_rank := case delivery_row.status
    when 'sending' then 0
    when 'queued' then 1
    when 'sent' then 2
    when 'delivered' then 3
    else -1
  end;
  next_rank := case p_status
    when 'sending' then 0
    when 'queued' then 1
    when 'sent' then 2
    when 'delivered' then 3
    else -1
  end;

  if next_rank > current_rank then
    update public.message_deliveries
    set status = p_status,
        error_code = null
    where id = delivery_row.id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.sms_receive_text(text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.sms_prepare_outbound(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.sms_complete_outbound(uuid,text,public.delivery_status)
  from public, anon, authenticated;
revoke all on function public.sms_fail_outbound(uuid,text)
  from public, anon, authenticated;
revoke all on function public.sms_update_delivery(text,public.delivery_status,text)
  from public, anon, authenticated;

grant execute on function public.sms_receive_text(text,text,text,text)
  to codeedge_communication_api;
grant execute on function public.sms_prepare_outbound(uuid,uuid,uuid,uuid,text)
  to codeedge_communication_api;
grant execute on function public.sms_complete_outbound(uuid,text,public.delivery_status)
  to codeedge_communication_api;
grant execute on function public.sms_fail_outbound(uuid,text)
  to codeedge_communication_api;
grant execute on function public.sms_update_delivery(text,public.delivery_status,text)
  to codeedge_communication_api;
