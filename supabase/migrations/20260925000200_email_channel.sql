-- Production Email channel using the canonical Conversation + Message core.
-- Resend is the first replaceable adapter. Raw provider secrets remain server-only.

create table public.email_channel_settings (
  connection_id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sender_name text not null default '' check (char_length(sender_name) <= 120),
  sender_email text not null check (
    char_length(sender_email) between 3 and 254
    and sender_email = lower(btrim(sender_email))
    and sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  reply_to_email text not null default '' check (
    char_length(reply_to_email) <= 254
    and (
      reply_to_email = ''
      or (
        reply_to_email = lower(btrim(reply_to_email))
        and reply_to_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      )
    )
  ),
  inbound_email text not null check (
    char_length(inbound_email) between 3 and 254
    and inbound_email = lower(btrim(inbound_email))
    and inbound_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, connection_id),
  constraint email_channel_settings_connection_same_tenant
    foreign key (business_id, connection_id)
    references public.channel_connections(business_id, id)
    on delete cascade
);

create unique index email_channel_settings_inbound_unique
  on public.email_channel_settings(lower(inbound_email));

create trigger email_channel_settings_updated
before update on public.email_channel_settings
for each row execute function private.touch_updated_at();

create table public.email_message_metadata (
  message_id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null,
  connection_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,79}$'),
  provider_message_id text check (
    provider_message_id is null
    or char_length(btrim(provider_message_id)) between 1 and 255
  ),
  rfc_message_id text check (
    rfc_message_id is null
    or char_length(btrim(rfc_message_id)) between 1 and 255
  ),
  in_reply_to text check (
    in_reply_to is null
    or char_length(btrim(in_reply_to)) between 1 and 255
  ),
  reference_ids text[] not null default '{}'::text[] check (
    cardinality(reference_ids) <= 50
  ),
  from_address text not null check (char_length(from_address) between 3 and 254),
  to_address text not null check (char_length(to_address) between 3 and 254),
  reply_to_address text not null default '' check (char_length(reply_to_address) <= 254),
  subject text not null default '' check (char_length(subject) <= 500),
  created_at timestamptz not null default now(),
  unique (business_id, message_id),
  constraint email_metadata_message_same_tenant
    foreign key (business_id, message_id)
    references public.messages(business_id, id)
    on delete cascade,
  constraint email_metadata_conversation_same_tenant
    foreign key (business_id, conversation_id)
    references public.conversations(business_id, id)
    on delete cascade,
  constraint email_metadata_connection_same_tenant
    foreign key (business_id, connection_id)
    references public.channel_connections(business_id, id)
    on delete restrict
);

create unique index email_metadata_provider_message_unique
  on public.email_message_metadata(connection_id, provider, provider_message_id)
  where provider_message_id is not null;

create index email_metadata_rfc_thread
  on public.email_message_metadata(business_id, connection_id, rfc_message_id)
  where rfc_message_id is not null;

create index email_metadata_conversation
  on public.email_message_metadata(business_id, conversation_id, created_at, message_id);

alter table public.email_channel_settings enable row level security;
alter table public.email_channel_settings force row level security;
alter table public.email_message_metadata enable row level security;
alter table public.email_message_metadata force row level security;

revoke all on public.email_channel_settings, public.email_message_metadata
  from public, anon, authenticated;

grant select on public.email_channel_settings, public.email_message_metadata
  to authenticated;

grant insert(
  connection_id,
  business_id,
  sender_name,
  sender_email,
  reply_to_email,
  inbound_email
) on public.email_channel_settings to authenticated;

grant update(
  sender_name,
  sender_email,
  reply_to_email,
  inbound_email
) on public.email_channel_settings to authenticated;

create policy email_channel_settings_read
on public.email_channel_settings
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy email_channel_settings_insert
on public.email_channel_settings
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
  and exists (
    select 1
    from public.channel_connections cc
    where cc.business_id = email_channel_settings.business_id
      and cc.id = email_channel_settings.connection_id
      and cc.channel = 'email'
      and cc.provider = 'resend_email'
  )
);

create policy email_channel_settings_update
on public.email_channel_settings
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
  and exists (
    select 1
    from public.channel_connections cc
    where cc.business_id = email_channel_settings.business_id
      and cc.id = email_channel_settings.connection_id
      and cc.channel = 'email'
      and cc.provider = 'resend_email'
  )
);

create policy email_message_metadata_read
on public.email_message_metadata
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create function private.active_email_connection(p_inbound_email text)
returns table(
  business_id uuid,
  connection_id uuid,
  provider text,
  credential_key text,
  sender_name text,
  sender_email text,
  reply_to_email text,
  inbound_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_inbound_email is null
     or char_length(btrim(p_inbound_email)) not between 3 and 254
     or lower(btrim(p_inbound_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  return query
  select
    cc.business_id,
    cc.id,
    cc.provider,
    cc.credential_key,
    s.sender_name,
    s.sender_email,
    s.reply_to_email,
    s.inbound_email
  from public.channel_connections cc
  join public.email_channel_settings s
    on s.business_id = cc.business_id
   and s.connection_id = cc.id
  join public.businesses b
    on b.id = cc.business_id
  where cc.channel = 'email'
    and cc.provider = 'resend_email'
    and cc.enabled
    and b.status = 'active'
    and s.inbound_email = lower(btrim(p_inbound_email))
  limit 1;

  if not found then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.active_email_connection(text)
  from public, anon, authenticated;

grant execute on function private.active_email_connection(text)
  to codeedge_communication_api;

create function public.email_receive(
  p_inbound_email text,
  p_provider_message_id text,
  p_rfc_message_id text,
  p_in_reply_to text,
  p_references text[],
  p_from_email text,
  p_from_name text,
  p_reply_to text,
  p_subject text,
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
  connection record;
  conversation_row public.conversations%rowtype;
  existing_message_id uuid;
  existing_conversation_id uuid;
  lead_id uuid;
  customer_id uuid;
  new_message_id uuid;
  normalized_from text;
  normalized_reply_to text;
  contact_name text;
  thread_conversation_id uuid;
  thread_count integer := 0;
  refs text[] := coalesce(p_references, '{}'::text[]);
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  if p_rfc_message_id is null
     or char_length(btrim(p_rfc_message_id)) not between 1 and 255 then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  normalized_from := lower(btrim(coalesce(p_from_email, '')));
  if char_length(normalized_from) not between 3 and 254
     or normalized_from !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  normalized_reply_to := lower(btrim(coalesce(p_reply_to, '')));
  if normalized_reply_to <> ''
     and (
       char_length(normalized_reply_to) > 254
       or normalized_reply_to !~ '^[^[:space:]@]+@[^[:space:]@]+$'
     ) then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  if cardinality(refs) > 50
     or exists (
       select 1
       from unnest(refs) as ref(value)
       where char_length(btrim(ref.value)) not between 1 and 255
     ) then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  if p_in_reply_to is not null
     and char_length(btrim(p_in_reply_to)) not between 1 and 255 then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  select *
  into connection
  from private.active_email_connection(p_inbound_email);

  -- Serialize inbound processing per connection so provider retries cannot race
  -- each other into duplicate conversations or Leads.
  perform 1
  from public.channel_connections cc
  where cc.id = connection.connection_id
    and cc.business_id = connection.business_id
  for update;

  select em.message_id, em.conversation_id
  into existing_message_id, existing_conversation_id
  from public.email_message_metadata em
  where em.connection_id = connection.connection_id
    and em.provider = 'resend_email'
    and em.provider_message_id = btrim(p_provider_message_id)
  limit 1;

  if existing_message_id is not null then
    return query select existing_conversation_id, existing_message_id, false;
    return;
  end if;

  if p_in_reply_to is not null and btrim(p_in_reply_to) <> '' then
    select count(distinct em.conversation_id)::integer
    into thread_count
    from public.email_message_metadata em
    where em.business_id = connection.business_id
      and em.connection_id = connection.connection_id
      and em.rfc_message_id = btrim(p_in_reply_to);

    if thread_count = 1 then
      select em.conversation_id
      into thread_conversation_id
      from public.email_message_metadata em
      where em.business_id = connection.business_id
        and em.connection_id = connection.connection_id
        and em.rfc_message_id = btrim(p_in_reply_to)
      limit 1;
    end if;
  end if;

  if thread_conversation_id is null and cardinality(refs) > 0 then
    select count(distinct em.conversation_id)::integer
    into thread_count
    from public.email_message_metadata em
    where em.business_id = connection.business_id
      and em.connection_id = connection.connection_id
      and em.rfc_message_id = any(refs);

    if thread_count = 1 then
      select em.conversation_id
      into thread_conversation_id
      from public.email_message_metadata em
      where em.business_id = connection.business_id
        and em.connection_id = connection.connection_id
        and em.rfc_message_id = any(refs)
      limit 1;
    end if;
  end if;

  if thread_conversation_id is not null then
    select c.*
    into conversation_row
    from public.conversations c
    where c.business_id = connection.business_id
      and c.id = thread_conversation_id
      and c.channel = 'email'
      and c.channel_connection_id = connection.connection_id
    limit 1
    for update;
  end if;

  if conversation_row.id is null then
    select c.id, c.source_lead_id
    into customer_id, lead_id
    from public.customers c
    where c.business_id = connection.business_id
      and lower(btrim(c.email)) = normalized_from
      and btrim(c.email) <> ''
    order by c.created_at desc, c.id
    limit 1;

    if customer_id is null then
      select l.id
      into lead_id
      from public.leads l
      where l.business_id = connection.business_id
        and lower(btrim(l.email)) = normalized_from
        and btrim(l.email) <> ''
      order by l.created_at desc, l.id
      limit 1;
    end if;

    contact_name := nullif(left(btrim(coalesce(p_from_name, '')), 120), '');
    if contact_name is null then
      contact_name := left(split_part(normalized_from, '@', 1), 120);
    end if;
    if contact_name = '' then
      contact_name := 'Email contact';
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
        contact_name,
        '',
        normalized_from,
        'email',
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
      connection.connection_id,
      'email',
      'open',
      left(coalesce(nullif(btrim(coalesce(p_subject, '')), ''), 'Email · ' || normalized_from), 200),
      btrim(p_rfc_message_id),
      null
    )
    returning * into conversation_row;
  else
    update public.conversations
    set status = 'open'
    where business_id = connection.business_id
      and id = conversation_row.id
      and status <> 'open';
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
    connection.business_id,
    conversation_row.id,
    'customer',
    null,
    'inbound',
    btrim(p_body),
    btrim(p_provider_message_id)
  )
  returning id into new_message_id;

  insert into public.email_message_metadata(
    message_id,
    business_id,
    conversation_id,
    connection_id,
    provider,
    provider_message_id,
    rfc_message_id,
    in_reply_to,
    reference_ids,
    from_address,
    to_address,
    reply_to_address,
    subject
  ) values (
    new_message_id,
    connection.business_id,
    conversation_row.id,
    connection.connection_id,
    'resend_email',
    btrim(p_provider_message_id),
    btrim(p_rfc_message_id),
    nullif(btrim(coalesce(p_in_reply_to, '')), ''),
    refs,
    normalized_from,
    lower(btrim(p_inbound_email)),
    normalized_reply_to,
    left(btrim(coalesce(p_subject, '')), 500)
  );

  update public.leads
  set last_contact_at = clock_timestamp()
  where business_id = connection.business_id
    and id = conversation_row.lead_id;

  return query select conversation_row.id, new_message_id, true;
end;
$$;

create function public.email_prepare_outbound(
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
  credential_key text,
  sender_name text,
  sender_email text,
  reply_to_email text,
  recipient text,
  subject text,
  in_reply_to text,
  reference_ids text[],
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
  settings_row public.email_channel_settings%rowtype;
  existing_message public.messages%rowtype;
  existing_delivery public.message_deliveries%rowtype;
  new_message_id uuid;
  latest_inbound record;
  latest_thread record;
  refs text[] := '{}'::text[];
  reply_subject text;
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
    and c.channel = 'email'
    and c.channel_connection_id is not null
  limit 1;

  if not found then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  select cc.*
  into connection_row
  from public.channel_connections cc
  where cc.business_id = p_business_id
    and cc.id = conversation_row.channel_connection_id
    and cc.channel = 'email'
    and cc.provider = 'resend_email'
    and cc.enabled
  limit 1;

  if not found then
    raise exception 'Email unavailable' using errcode = '42501';
  end if;

  select s.*
  into settings_row
  from public.email_channel_settings s
  where s.business_id = p_business_id
    and s.connection_id = connection_row.id
  limit 1;

  if not found then
    raise exception 'Email unavailable' using errcode = '42501';
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

    select em.to_address as recipient,
           em.subject,
           em.in_reply_to,
           em.reference_ids
    into latest_thread
    from public.email_message_metadata em
    where em.business_id = p_business_id
      and em.message_id = existing_message.id
    limit 1;

    return query
      select existing_message.id,
        connection_row.id,
        connection_row.provider,
        connection_row.credential_key,
        settings_row.sender_name,
        settings_row.sender_email,
        settings_row.reply_to_email,
        latest_thread.recipient::text,
        latest_thread.subject::text,
        latest_thread.in_reply_to::text,
        coalesce(latest_thread.reference_ids, '{}'::text[]),
        existing_delivery.status,
        false;
    return;
  end if;

  select
    coalesce(nullif(em.reply_to_address, ''), em.from_address) as recipient,
    em.subject
  into latest_inbound
  from public.email_message_metadata em
  join public.messages m
    on m.business_id = em.business_id
   and m.id = em.message_id
  where em.business_id = p_business_id
    and em.conversation_id = p_conversation_id
    and em.connection_id = connection_row.id
    and m.direction = 'inbound'
  order by m.created_at desc, m.id desc
  limit 1;

  if latest_inbound.recipient is null
     or latest_inbound.recipient !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Email recipient unavailable' using errcode = '42501';
  end if;

  select
    em.rfc_message_id,
    em.reference_ids
  into latest_thread
  from public.email_message_metadata em
  join public.messages m
    on m.business_id = em.business_id
   and m.id = em.message_id
  where em.business_id = p_business_id
    and em.conversation_id = p_conversation_id
    and em.connection_id = connection_row.id
    and em.rfc_message_id is not null
  order by m.created_at desc, m.id desc
  limit 1;

  refs := coalesce(latest_thread.reference_ids, '{}'::text[]);
  if conversation_row.external_thread_id is not null
     and not (conversation_row.external_thread_id = any(refs)) then
    refs := array_append(refs, conversation_row.external_thread_id);
  end if;
  if latest_thread.rfc_message_id is not null
     and not (latest_thread.rfc_message_id = any(refs)) then
    refs := array_append(refs, latest_thread.rfc_message_id);
  end if;
  if cardinality(refs) > 50 then
    refs := refs[(cardinality(refs) - 49):cardinality(refs)];
  end if;

  reply_subject := coalesce(
    nullif(btrim(latest_inbound.subject), ''),
    nullif(btrim(conversation_row.subject), ''),
    'Email reply'
  );
  if reply_subject !~* '^re[[:space:]]*:' then
    reply_subject := 'Re: ' || reply_subject;
  end if;
  reply_subject := left(reply_subject, 200);

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

  insert into public.email_message_metadata(
    message_id,
    business_id,
    conversation_id,
    connection_id,
    provider,
    provider_message_id,
    rfc_message_id,
    in_reply_to,
    reference_ids,
    from_address,
    to_address,
    reply_to_address,
    subject
  ) values (
    new_message_id,
    p_business_id,
    p_conversation_id,
    connection_row.id,
    connection_row.provider,
    null,
    null,
    latest_thread.rfc_message_id,
    refs,
    settings_row.sender_email,
    lower(latest_inbound.recipient),
    settings_row.reply_to_email,
    reply_subject
  );

  return query
    select new_message_id,
      connection_row.id,
      connection_row.provider,
      connection_row.credential_key,
      settings_row.sender_name,
      settings_row.sender_email,
      settings_row.reply_to_email,
      lower(latest_inbound.recipient),
      reply_subject,
      latest_thread.rfc_message_id::text,
      refs,
      'sending'::public.delivery_status,
      true;
end;
$$;

create function public.email_complete_outbound(
  p_message_id uuid,
  p_provider_message_id text,
  p_rfc_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row public.message_deliveries%rowtype;
  metadata_row public.email_message_metadata%rowtype;
  current_channel_message_id text;
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'Invalid provider response' using errcode = '22023';
  end if;

  if p_rfc_message_id is not null
     and char_length(btrim(p_rfc_message_id)) not between 1 and 255 then
    raise exception 'Invalid provider response' using errcode = '22023';
  end if;

  select d.*
  into delivery_row
  from public.message_deliveries d
  join public.channel_connections cc
    on cc.business_id = d.business_id
   and cc.id = d.connection_id
  where d.message_id = p_message_id
    and d.provider = 'resend_email'
    and cc.channel = 'email'
  limit 1
  for update of d;

  if not found then
    raise exception 'Delivery unavailable' using errcode = '42501';
  end if;

  select em.*
  into metadata_row
  from public.email_message_metadata em
  where em.business_id = delivery_row.business_id
    and em.message_id = p_message_id
    and em.connection_id = delivery_row.connection_id
    and em.provider = 'resend_email'
  limit 1
  for update;

  if not found then
    raise exception 'Delivery unavailable' using errcode = '42501';
  end if;

  if delivery_row.provider_message_id is not null
     and delivery_row.provider_message_id <> btrim(p_provider_message_id) then
    raise exception 'Delivery identity mismatch' using errcode = '23505';
  end if;

  if metadata_row.provider_message_id is not null
     and metadata_row.provider_message_id <> btrim(p_provider_message_id) then
    raise exception 'Delivery identity mismatch' using errcode = '23505';
  end if;

  if p_rfc_message_id is not null
     and metadata_row.rfc_message_id is not null
     and metadata_row.rfc_message_id <> btrim(p_rfc_message_id) then
    raise exception 'Email identity mismatch' using errcode = '23505';
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

  update public.email_message_metadata
  set provider_message_id = btrim(p_provider_message_id),
      rfc_message_id = coalesce(rfc_message_id, nullif(btrim(coalesce(p_rfc_message_id, '')), ''))
  where business_id = delivery_row.business_id
    and message_id = p_message_id;

  update public.message_deliveries
  set provider_message_id = btrim(p_provider_message_id),
      status = case
        when status in ('sent','delivered','bounced','failed') then status
        else 'queued'::public.delivery_status
      end,
      error_code = null
  where id = delivery_row.id;

  return true;
end;
$$;

create function public.email_fail_outbound(
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
    and cc.channel = 'email'
    and d.provider = 'resend_email'
    and d.status = 'sending'
    and d.provider_message_id is null;

  return found;
end;
$$;

create function public.email_update_delivery(
  p_provider_message_id text,
  p_status public.delivery_status,
  p_rfc_message_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row public.message_deliveries%rowtype;
  metadata_row public.email_message_metadata%rowtype;
  current_rank integer;
  next_rank integer;
begin
  if p_provider_message_id is null
     or char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  if p_status not in ('sent','delivered','bounced','failed') then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  if p_rfc_message_id is not null
     and char_length(btrim(p_rfc_message_id)) not between 1 and 255 then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;

  select d.*
  into delivery_row
  from public.message_deliveries d
  where d.provider = 'resend_email'
    and d.provider_message_id = btrim(p_provider_message_id)
  limit 1
  for update;

  if not found then
    return false;
  end if;

  select em.*
  into metadata_row
  from public.email_message_metadata em
  where em.business_id = delivery_row.business_id
    and em.message_id = delivery_row.message_id
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if p_rfc_message_id is not null
     and metadata_row.rfc_message_id is not null
     and metadata_row.rfc_message_id <> btrim(p_rfc_message_id) then
    raise exception 'Email identity mismatch' using errcode = '23505';
  end if;

  if p_rfc_message_id is not null and metadata_row.rfc_message_id is null then
    update public.email_message_metadata
    set rfc_message_id = btrim(p_rfc_message_id)
    where message_id = metadata_row.message_id;
  end if;

  if delivery_row.status = 'delivered' then
    return false;
  end if;

  if p_status in ('bounced','failed') then
    update public.message_deliveries
    set status = p_status,
        error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'provider_error'), 100)
    where id = delivery_row.id
      and status <> 'delivered';
    return found;
  end if;

  if delivery_row.status in ('bounced','failed') and p_status <> 'delivered' then
    return false;
  end if;

  current_rank := case delivery_row.status
    when 'sending' then 0
    when 'queued' then 1
    when 'sent' then 2
    when 'delivered' then 3
    when 'bounced' then -1
    when 'failed' then -1
    else -1
  end;
  next_rank := case p_status
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

revoke all on function public.email_receive(text,text,text,text,text[],text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.email_prepare_outbound(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.email_complete_outbound(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.email_fail_outbound(uuid,text)
  from public, anon, authenticated;
revoke all on function public.email_update_delivery(text,public.delivery_status,text,text)
  from public, anon, authenticated;

grant execute on function public.email_receive(text,text,text,text,text[],text,text,text,text,text)
  to codeedge_communication_api;
grant execute on function public.email_prepare_outbound(uuid,uuid,uuid,uuid,text)
  to codeedge_communication_api;
grant execute on function public.email_complete_outbound(uuid,text,text)
  to codeedge_communication_api;
grant execute on function public.email_fail_outbound(uuid,text)
  to codeedge_communication_api;
grant execute on function public.email_update_delivery(text,public.delivery_status,text,text)
  to codeedge_communication_api;
