-- Additive WhatsApp expansion. No existing RLS policies are weakened.
-- Security-definer RPCs follow the existing restricted transport capability;
-- new RPC execution is revoked from browser roles explicitly at the end.
alter table public.channel_connections
  add column whatsapp_ai_enabled boolean not null default false,
  add column whatsapp_clinic_mode boolean not null default false,
  add column whatsapp_escalation_keywords text[] not null default array['human','person','complaint','payment problem'],
  add column last_webhook_at timestamptz,
  add column whatsapp_templates jsonb not null default '[]'::jsonb check (jsonb_typeof(whatsapp_templates)='array'),
  add column whatsapp_templates_synced_at timestamptz;
grant insert(whatsapp_ai_enabled,whatsapp_clinic_mode,whatsapp_escalation_keywords),
  update(whatsapp_ai_enabled,whatsapp_clinic_mode,whatsapp_escalation_keywords)
  on public.channel_connections to authenticated;

alter table public.conversations
  add column automation_state text not null default 'automatic' check (automation_state in ('automatic','human')),
  add column handoff_reason text not null default '' check (char_length(handoff_reason)<=100),
  add column automation_epoch integer not null default 0 check (automation_epoch>=0),
  add column last_customer_message_at timestamptz,
  add column whatsapp_opted_out_at timestamptz,
  add column whatsapp_consent_at timestamptz,
  add column whatsapp_consent_source text not null default '' check (char_length(whatsapp_consent_source)<=240);

alter table public.messages
  add column content_kind text not null default 'text' check (content_kind in ('text','interactive','image','document','audio','video','template')),
  add column media_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(media_metadata)='object'),
  add column provider_timestamp timestamptz,
  add column assistant_claimed_at timestamptz,
  add column assistant_outcome text not null default '' check (char_length(assistant_outcome)<=100);
alter table public.message_deliveries
  add column automation_epoch integer,
  add column automatic boolean not null default false;

-- Existing timestamps do not prove a provider service window. They remain NULL until a new signed event.
create index whatsapp_leads_phone_lookup on public.leads(business_id,(regexp_replace(phone,'[^0-9]','','g')));
create index whatsapp_customers_phone_lookup on public.customers(business_id,(regexp_replace(phone,'[^0-9]','','g')));

create function private.whatsapp_receive_core(
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
  -- Serialize first contact creation across all connections for the same tenant/phone.
  perform pg_advisory_xact_lock(hashtextextended(connection.business_id::text || ':' || normalized_customer, 0));
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

    if lead_id is null and customer_id is null then
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
revoke all on function private.whatsapp_receive_core(text,text,text,text,text) from public,anon,authenticated,codeedge_communication_api;

create function private.whatsapp_prepare_core(
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
revoke all on function private.whatsapp_prepare_core(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,codeedge_communication_api;

create function public.whatsapp_receive_message(
  p_sender text,p_customer text,p_name text,p_message text,p_body text,
  p_occurred_at timestamptz,p_kind text,p_media jsonb
) returns table(conversation_id uuid,message_id uuid,inserted boolean)
language plpgsql security definer set search_path='' as $$
declare cc public.channel_connections%rowtype; r record; c public.conversations%rowtype; reason text; keyword text;
begin
  if p_kind is null or p_kind not in ('text','interactive','image','document','audio','video')
     or p_media is null or jsonb_typeof(p_media)<>'object' or octet_length(p_media::text)>2000
     or (p_occurred_at is not null and (p_occurred_at>clock_timestamp()+interval '5 minutes' or p_occurred_at<'2000-01-01')) then
    raise exception 'Invalid WhatsApp message' using errcode='22023';
  end if;
  cc := private.active_whatsapp_connection(p_sender);
  -- Reject unsigned tenant hints; workspace comes exclusively from registered sender.
  select * into r from private.whatsapp_receive_core(p_sender,p_customer,p_name,p_message,p_body);
  update public.channel_connections set last_webhook_at=clock_timestamp() where id=cc.id and business_id=cc.business_id;
  if not r.inserted then return query select r.conversation_id,r.message_id,false; return; end if;
  update public.messages set content_kind=p_kind,media_metadata=p_media,provider_timestamp=p_occurred_at
    where id=r.message_id and business_id=cc.business_id;
  update public.conversations set last_customer_message_at=case when p_occurred_at is null then last_customer_message_at else greatest(last_customer_message_at,least(p_occurred_at,clock_timestamp())) end
    where id=r.conversation_id and business_id=cc.business_id returning * into c;
  if lower(btrim(p_body)) in ('stop','unsubscribe','cancel','stop all') then
    update public.conversations set whatsapp_opted_out_at=clock_timestamp(),whatsapp_consent_at=null,whatsapp_consent_source=''
      where id=c.id and business_id=cc.business_id;
    reason := 'opt_out';
  elsif p_kind in ('image','document','audio','video') then reason := 'media_review';
  else
    foreach keyword in array cc.whatsapp_escalation_keywords loop
      if keyword<>'' and position(lower(keyword) in lower(p_body))>0 then reason := 'customer_escalation'; exit; end if;
    end loop;
    if cc.whatsapp_clinic_mode and lower(p_body) ~ '(diagnos|medicat|medicine|prescri|symptom|dose|bleeding|chest pain|breath|suicid|emergency)' then reason := 'medical_review'; end if;
  end if;
  if reason is not null then
    update public.conversations set automation_state='human',handoff_reason=reason,automation_epoch=automation_epoch+1,status='pending'
      where id=c.id and business_id=cc.business_id;
  end if;
  if c.automation_state='human' then
    update public.conversations set status='pending' where id=c.id and business_id=cc.business_id;
  end if;
  if c.lead_id is not null then
    perform private.append_crm_activity(cc.business_id,c.lead_id,'lead_edited','WhatsApp message received',jsonb_build_object('channel','whatsapp','message_id',r.message_id,'conversation_id',c.id));
  end if;
  return query select r.conversation_id,r.message_id,true;
end;
$$;

-- Compatibility entry point for trusted existing callers/tests, never used for unsigned timestamps in the Meta route.
create or replace function public.whatsapp_receive_text(p_external_sender_id text,p_customer_wa_id text,p_customer_name text,p_provider_message_id text,p_body text)
returns table(conversation_id uuid,message_id uuid,inserted boolean)
language sql security definer set search_path='' as $$
  select * from public.whatsapp_receive_message(p_external_sender_id,p_customer_wa_id,p_customer_name,p_provider_message_id,p_body,clock_timestamp(),'text','{}'::jsonb);
$$;

create function public.whatsapp_set_control(p_business uuid,p_conversation uuid,p_user uuid,p_state text,p_reason text default 'staff_takeover')
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('automatic','human') or not exists(
    select 1 from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=p_business and m.user_id=p_user and m.status='active' and m.role in ('owner','staff') and b.status='active'
  ) then raise exception 'Conversation unavailable' using errcode='42501'; end if;
  update public.conversations set automation_state=p_state,automation_epoch=automation_epoch+1,
    handoff_reason=case when p_state='human' then left(coalesce(p_reason,'staff_takeover'),100) else '' end,
    status=case when p_state='human' then 'pending'::public.conversation_status else 'open'::public.conversation_status end
    where business_id=p_business and id=p_conversation and channel='whatsapp'
      and (p_state='human' or whatsapp_opted_out_at is null);
  return found;
end;
$$;

create function public.whatsapp_record_consent(p_business uuid,p_conversation uuid,p_user uuid,p_source text,p_consent boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_source is null or char_length(btrim(p_source)) not between 1 and 240 or not exists(
    select 1 from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=p_business and m.user_id=p_user and m.status='active' and m.role='owner' and b.status='active'
  ) then raise exception 'Consent unavailable' using errcode='42501'; end if;
  update public.conversations set whatsapp_consent_at=case when p_consent then clock_timestamp() else null end,
    whatsapp_consent_source=p_source,whatsapp_opted_out_at=case when p_consent then null else clock_timestamp() end,
    automation_state='human',automation_epoch=automation_epoch+1,handoff_reason='consent_changed'
    where business_id=p_business and id=p_conversation and channel='whatsapp';
  return found;
end;
$$;

create function private.whatsapp_assert_send(p_business uuid,p_conversation uuid,p_kind text,p_payload jsonb,p_automatic boolean,p_epoch integer)
returns void language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; cc public.channel_connections%rowtype; template jsonb;
begin
  select * into c from public.conversations where business_id=p_business and id=p_conversation and channel='whatsapp' for update;
  if not found then raise exception 'Conversation unavailable' using errcode='42501'; end if;
  select * into cc from public.channel_connections where business_id=p_business and id=c.channel_connection_id and enabled;
  if not found then raise exception 'WhatsApp unavailable' using errcode='42501'; end if;
  if c.whatsapp_opted_out_at is not null then raise exception 'WhatsApp recipient opted out' using errcode='42501'; end if;
  if p_automatic and (c.automation_state<>'automatic' or (p_epoch is not null and c.automation_epoch<>p_epoch)) then
    raise exception 'WhatsApp human control active' using errcode='42501';
  end if;
  if p_kind='template' then
    if cc.whatsapp_templates_synced_at is null or cc.whatsapp_templates_synced_at<clock_timestamp()-interval '1 hour' then
      raise exception 'Refresh approved WhatsApp templates' using errcode='42501'; end if;
    select t into template from jsonb_array_elements(cc.whatsapp_templates) t
      where t->>'name'=p_payload->>'name' and t->>'language'=p_payload->>'language' and t->>'status'='APPROVED' limit 1;
    if template is null or c.whatsapp_consent_at is null then raise exception 'Approved template and recorded consent required' using errcode='42501'; end if;
  elsif p_kind in ('text','interactive','image','document','audio','video') then
    if c.last_customer_message_at is null or c.last_customer_message_at<=clock_timestamp()-interval '24 hours' then
      raise exception 'WhatsApp template required outside service window' using errcode='42501'; end if;
  else raise exception 'Invalid WhatsApp delivery' using errcode='22023'; end if;
end;
$$;
revoke all on function private.whatsapp_assert_send(uuid,uuid,text,jsonb,boolean,integer) from public,anon,authenticated,codeedge_communication_api;

create function public.whatsapp_prepare_message(p_business uuid,p_conversation uuid,p_user uuid,p_request uuid,p_body text,p_kind text,p_payload jsonb,p_automatic boolean default false,p_epoch integer default null)
returns table(message_id uuid,connection_id uuid,provider text,external_sender_id text,credential_key text,recipient text,delivery_status public.delivery_status,created boolean)
language plpgsql security definer set search_path='' as $$
declare r record; c public.conversations%rowtype;
begin
  if p_automatic is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>30000 then
    raise exception 'Invalid delivery request' using errcode='22023'; end if;
  -- Serialize requests before preparing the canonical outbox message.
  select * into c from public.conversations where business_id=p_business and id=p_conversation for update;
  if not exists(select 1 from public.messages m where m.business_id=p_business and m.conversation_id=p_conversation and m.request_id=p_request) then
    perform private.whatsapp_assert_send(p_business,p_conversation,p_kind,p_payload,p_automatic,p_epoch);
  end if;
  select * into r from private.whatsapp_prepare_core(p_business,p_conversation,p_user,p_request,p_body);
  if r.created then
    if not p_automatic then
      update public.conversations set automation_state='human',handoff_reason='staff_reply',automation_epoch=automation_epoch+1
        where business_id=p_business and id=p_conversation returning * into c;
    end if;
    update public.messages set content_kind=p_kind,media_metadata=p_payload,
      sender_type=case when p_automatic then 'ai'::public.message_sender_type else 'staff'::public.message_sender_type end
      where business_id=p_business and id=r.message_id;
    update public.message_deliveries d set automatic=p_automatic,automation_epoch=c.automation_epoch
      where d.business_id=p_business and d.message_id=r.message_id;
    if c.lead_id is not null then
      perform private.append_crm_activity(p_business,c.lead_id,'lead_edited','WhatsApp reply prepared',jsonb_build_object('channel','whatsapp','message_id',r.message_id));
    end if;
  end if;
  return query select r.message_id,r.connection_id,r.provider,r.external_sender_id,r.credential_key,r.recipient,r.delivery_status,r.created;
end;
$$;

create or replace function public.whatsapp_prepare_outbound(p_business_id uuid,p_conversation_id uuid,p_user_id uuid,p_request_id uuid,p_body text)
returns table(message_id uuid,connection_id uuid,provider text,external_sender_id text,credential_key text,recipient text,delivery_status public.delivery_status,created boolean)
language sql security definer set search_path='' as $$
  select * from public.whatsapp_prepare_message(p_business_id,p_conversation_id,p_user_id,p_request_id,p_body,'text','{}'::jsonb,false,null);
$$;

create function public.whatsapp_authorize_dispatch(p_message uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.message_deliveries%rowtype; m public.messages%rowtype;
begin
  select * into d from public.message_deliveries where message_id=p_message and provider='meta_whatsapp_cloud' and status='sending';
  if not found then raise exception 'Delivery unavailable' using errcode='42501'; end if;
  select * into m from public.messages where business_id=d.business_id and id=d.message_id;
  if not exists(select 1 from public.business_memberships bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=d.business_id and bm.user_id=m.sender_user_id and bm.status='active' and bm.role in ('owner','staff') and b.status='active') then
    raise exception 'Delivery actor unavailable' using errcode='42501'; end if;
  perform private.whatsapp_assert_send(d.business_id,d.conversation_id,m.content_kind,m.media_metadata,d.automatic,d.automation_epoch);
  return true;
end;
$$;

-- Delivery status must be scoped to the sender in the authenticated provider payload.
create function public.whatsapp_update_delivery_scoped(p_sender text,p_message text,p_status public.delivery_status,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare cc public.channel_connections%rowtype;
begin
  cc := private.active_whatsapp_connection(p_sender);
  update public.channel_connections set last_webhook_at=clock_timestamp() where id=cc.id and business_id=cc.business_id;
  if not exists(select 1 from public.message_deliveries where business_id=cc.business_id and connection_id=cc.id and provider_message_id=p_message and provider='meta_whatsapp_cloud') then return false; end if;
  return public.whatsapp_update_delivery(p_message,p_status,p_error);
end;
$$;

create function public.whatsapp_connection_context(p_business uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=p_business and m.user_id=p_user and m.status='active' and m.role='owner' and b.status='active') then
    raise exception 'Connection unavailable' using errcode='42501'; end if;
  select to_jsonb(cc) || jsonb_build_object('execution_mode',b.execution_mode) into result
    from public.channel_connections cc join public.businesses b on b.id=cc.business_id
    where cc.business_id=p_business and cc.channel='whatsapp' and cc.provider='meta_whatsapp_cloud';
  return result;
end;
$$;

create function public.whatsapp_cache_templates(p_business uuid,p_user uuid,p_sender text,p_account text,p_templates jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.whatsapp_connection_context(p_business,p_user);
  if p_templates is null or jsonb_typeof(p_templates)<>'array' or jsonb_array_length(p_templates)>1000 or octet_length(p_templates::text)>1000000 then
    raise exception 'Invalid template registry' using errcode='22023'; end if;
  update public.channel_connections set whatsapp_templates=p_templates,whatsapp_templates_synced_at=clock_timestamp()
    where business_id=p_business and external_sender_id=p_sender and external_account_id=p_account and channel='whatsapp' and provider='meta_whatsapp_cloud';
  return found;
end;
$$;

create function public.whatsapp_claim_assistant(p_business uuid,p_conversation uuid,p_message uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; cc public.channel_connections%rowtype; b public.businesses%rowtype; m public.messages%rowtype;
begin
  select * into b from public.businesses where id=p_business and status='active';
  if not found or not exists(select 1 from public.business_memberships where business_id=p_business and user_id=p_user and status='active' and role in ('owner','staff')) then return null; end if;
  select * into c from public.conversations where id=p_conversation and business_id=p_business and channel='whatsapp' for update;
  if not found or c.automation_state<>'automatic' or c.whatsapp_opted_out_at is not null or c.last_customer_message_at<=clock_timestamp()-interval '24 hours' or c.last_customer_message_at is null then return null; end if;
  select * into cc from public.channel_connections where id=c.channel_connection_id and business_id=p_business and enabled and whatsapp_ai_enabled;
  if not found then return null; end if;
  update public.messages set assistant_claimed_at=clock_timestamp(),assistant_outcome='claimed'
    where id=p_message and business_id=p_business and conversation_id=p_conversation and direction='inbound' and content_kind in ('text','interactive') and assistant_claimed_at is null
    returning * into m;
  if not found then return null; end if;
  return jsonb_build_object('businessId',b.id,'name',b.name,'executionMode',b.execution_mode,'epoch',c.automation_epoch,'clinicMode',cc.whatsapp_clinic_mode,'text',m.body,
    'profile',(select jsonb_build_object('address',address,'description',description,'phone',phone,'category',category) from public.business_profiles where business_id=p_business),
    'services',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'description',s.description,'pricePence',s.starting_price_pence,'quoteRequired',s.quote_required)) from (select * from public.services where business_id=p_business and active order by display_order,id limit 50) s),'[]'::jsonb),
    'faqs',coalesce((select jsonb_agg(jsonb_build_object('question',f.question,'answer',f.answer)) from (select * from public.business_faqs where business_id=p_business and is_active order by display_order,id limit 50) f),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',weekday,'closed',is_closed,'opens',opens_at,'closes',closes_at)) from public.opening_hours where business_id=p_business),'[]'::jsonb),
    'timezone',b.timezone,
    'history',coalesce((select jsonb_agg(jsonb_build_object('direction',h.direction,'body',h.body)) from (select direction,left(body,1000) body from public.messages where business_id=p_business and conversation_id=p_conversation and direction<>'internal' order by created_at desc,id desc limit 8) h),'[]'::jsonb));
end;
$$;

create function public.whatsapp_assistant_outcome(p_business uuid,p_message uuid,p_outcome text)
returns void language sql security definer set search_path='' as $$
  update public.messages set assistant_outcome=left(p_outcome,100) where business_id=p_business and id=p_message and assistant_claimed_at is not null;
$$;

-- Reuse the durable Automation queue: a single system workflow per tenant.
alter table public.automation_workflows add column system_key text;
create unique index automation_system_workflow_unique on public.automation_workflows(business_id,system_key) where system_key is not null;
create function private.whatsapp_sync_ai_workflow() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  if new.channel<>'whatsapp' then return new; end if;
  if tg_op='UPDATE' and new.whatsapp_ai_enabled=old.whatsapp_ai_enabled and new.enabled=old.enabled then return new; end if;
  select user_id into owner_id from public.business_memberships where business_id=new.business_id and role='owner' and status='active' order by created_at,user_id limit 1;
  if owner_id is null then return new; end if;
  insert into public.automation_workflows(business_id,name,description,enabled,trigger_type,conditions,actions,created_by,system_key)
    values(new.business_id,'WhatsApp approved-knowledge assistant','Answers from approved workspace facts; pauses for human control.',new.enabled and new.whatsapp_ai_enabled,'message.received',
      '[{"path":"conversation.channel","operator":"eq","value":"whatsapp"}]',
      '[{"type":"communication.ai_whatsapp_reply","conversationIdPath":"conversation.id","messageIdPath":"message.id"}]',owner_id,'whatsapp_ai')
    on conflict (business_id,system_key) where system_key is not null do update set enabled=excluded.enabled,created_by=excluded.created_by;
  return new;
end;
$$;
revoke all on function private.whatsapp_sync_ai_workflow() from public,anon,authenticated;
create trigger whatsapp_sync_ai_workflow after insert or update on public.channel_connections for each row execute function private.whatsapp_sync_ai_workflow();

revoke all on function public.whatsapp_receive_message(text,text,text,text,text,timestamptz,text,jsonb),
  public.whatsapp_set_control(uuid,uuid,uuid,text,text),public.whatsapp_record_consent(uuid,uuid,uuid,text,boolean),
  public.whatsapp_prepare_message(uuid,uuid,uuid,uuid,text,text,jsonb,boolean,integer),public.whatsapp_authorize_dispatch(uuid),
  public.whatsapp_update_delivery_scoped(text,text,public.delivery_status,text),public.whatsapp_connection_context(uuid,uuid),
  public.whatsapp_cache_templates(uuid,uuid,text,text,jsonb),public.whatsapp_claim_assistant(uuid,uuid,uuid,uuid),public.whatsapp_assistant_outcome(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.whatsapp_receive_message(text,text,text,text,text,timestamptz,text,jsonb),
  public.whatsapp_set_control(uuid,uuid,uuid,text,text),public.whatsapp_record_consent(uuid,uuid,uuid,text,boolean),
  public.whatsapp_prepare_message(uuid,uuid,uuid,uuid,text,text,jsonb,boolean,integer),public.whatsapp_authorize_dispatch(uuid),
  public.whatsapp_update_delivery_scoped(text,text,public.delivery_status,text),public.whatsapp_connection_context(uuid,uuid),
  public.whatsapp_cache_templates(uuid,uuid,text,text,jsonb),public.whatsapp_claim_assistant(uuid,uuid,uuid,uuid),public.whatsapp_assistant_outcome(uuid,uuid,text)
  to codeedge_communication_api;


create function public.whatsapp_media_context(p_business uuid,p_user uuid,p_message uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.business_memberships bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=p_business and bm.user_id=p_user and bm.status='active' and bm.role in ('owner','staff') and b.status='active') then
    raise exception 'Media unavailable' using errcode='42501'; end if;
  select jsonb_build_object('businessId',m.business_id,'externalSenderId',cc.external_sender_id,'credentialKey',cc.credential_key,
    'providerEnvironment',cc.credential_environment,'mediaId',m.media_metadata->>'id','mimeType',m.media_metadata->>'mimeType') into result
    from public.messages m join public.conversations c on c.business_id=m.business_id and c.id=m.conversation_id
    join public.channel_connections cc on cc.business_id=c.business_id and cc.id=c.channel_connection_id
    where m.business_id=p_business and m.id=p_message and c.channel='whatsapp' and cc.enabled and cc.provider='meta_whatsapp_cloud'
      and m.direction='inbound' and m.content_kind in ('image','document','audio','video');
  return result;
end;
$$;
revoke all on function public.whatsapp_media_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_media_context(uuid,uuid,uuid) to codeedge_communication_api;
