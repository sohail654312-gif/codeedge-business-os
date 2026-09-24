-- Dedicated Website Chat server capability. Browser roles cannot assume this role.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_chat_api') then
    create role codeedge_chat_api nologin noinherit nobypassrls;
  elsif exists(
    select 1 from pg_roles where rolname='codeedge_chat_api'
      and (rolsuper or rolbypassrls or rolcanlogin or rolinherit or rolcreaterole or rolcreatedb or rolreplication)
  ) then
    raise exception 'Unsafe pre-existing chat role';
  end if;
end $$;
grant codeedge_chat_api to postgres;
grant usage on schema public, private to codeedge_chat_api;

-- Production Website Chat channel feeding the canonical Conversation + Message core.
-- Public visitors receive no direct table access. Narrow security-definer RPCs are
-- the only anonymous database capabilities, and all tenant/session identity is
-- derived from the public widget id plus a server-hashed visitor session token.

alter table public.messages
  add column request_id uuid;

create unique index messages_public_request_unique
  on public.messages(business_id, conversation_id, request_id)
  where request_id is not null;

create table public.website_chat_widgets (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  public_id uuid not null default gen_random_uuid() unique,
  enabled boolean not null default false,
  widget_name text not null default 'Chat with us'
    check (char_length(btrim(widget_name)) between 2 and 80),
  launcher_label text not null default 'Chat with us'
    check (char_length(btrim(launcher_label)) between 2 and 40),
  greeting_text text not null default 'How can we help?'
    check (char_length(btrim(greeting_text)) between 1 and 200),
  welcome_message text not null default 'Welcome. Send us a message and our team will reply here.'
    check (char_length(btrim(welcome_message)) between 1 and 500),
  offline_message text not null default 'Chat is currently unavailable. Please try again later.'
    check (char_length(btrim(offline_message)) between 1 and 500),
  lead_capture_enabled boolean not null default true,
  accent_color text not null default '#23BDF0'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, public_id)
);

create trigger website_chat_widgets_updated
before update on public.website_chat_widgets
for each row execute function private.touch_updated_at();

create table public.website_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  widget_id uuid not null,
  conversation_id uuid,
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '24 hours',
  unique (business_id, id),
  unique (widget_id, session_hash),
  constraint website_chat_session_widget_same_tenant
    foreign key (business_id, widget_id)
    references public.website_chat_widgets(business_id, public_id)
    on delete cascade,
  constraint website_chat_session_conversation_same_tenant
    foreign key (business_id, conversation_id)
    references public.conversations(business_id, id)
    on delete cascade
);

create index website_chat_sessions_business_created
  on public.website_chat_sessions(business_id, created_at desc);
create index website_chat_sessions_expiry
  on public.website_chat_sessions(expires_at);
create index website_chat_sessions_conversation
  on public.website_chat_sessions(business_id, conversation_id)
  where conversation_id is not null;

alter table public.website_chat_widgets enable row level security;
alter table public.website_chat_widgets force row level security;
alter table public.website_chat_sessions enable row level security;
alter table public.website_chat_sessions force row level security;

revoke all on public.website_chat_widgets, public.website_chat_sessions
  from public, anon, authenticated;

grant select on public.website_chat_widgets to authenticated;
grant insert(
  business_id,
  enabled,
  widget_name,
  launcher_label,
  greeting_text,
  welcome_message,
  offline_message,
  lead_capture_enabled,
  accent_color
) on public.website_chat_widgets to authenticated;
grant update(
  enabled,
  widget_name,
  launcher_label,
  greeting_text,
  welcome_message,
  offline_message,
  lead_capture_enabled,
  accent_color
) on public.website_chat_widgets to authenticated;

create policy website_chat_widgets_read
on public.website_chat_widgets
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy website_chat_widgets_create
on public.website_chat_widgets
for insert to authenticated
with check (
  private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  )
);

create policy website_chat_widgets_update
on public.website_chat_widgets
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

-- No browser policies or grants exist for website_chat_sessions.

create function private.website_chat_active_business(p_widget_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.business_id
  from public.website_chat_widgets w
  join public.businesses b on b.id = w.business_id
  where w.public_id = p_widget_id
    and w.enabled
    and b.status = 'active'
  limit 1
$$;

revoke all on function private.website_chat_active_business(uuid)
  from public, anon, authenticated;

create function private.website_chat_conversation(
  p_widget_id uuid,
  p_session_hash text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.conversation_id
  from public.website_chat_sessions s
  join public.website_chat_widgets w
    on w.business_id = s.business_id
   and w.public_id = s.widget_id
  join public.businesses b on b.id = s.business_id
  where s.widget_id = p_widget_id
    and s.session_hash = p_session_hash
    and s.expires_at > clock_timestamp()
    and w.enabled
    and b.status = 'active'
  limit 1
$$;

revoke all on function private.website_chat_conversation(uuid, text)
  from public, anon, authenticated;

create function private.website_chat_ensure_conversation(
  p_widget_id uuid,
  p_session_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.website_chat_sessions%rowtype;
  result_id uuid;
  widget_title text;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  select s.*
  into session_row
  from public.website_chat_sessions s
  join public.website_chat_widgets w
    on w.business_id = s.business_id
   and w.public_id = s.widget_id
  join public.businesses b on b.id = s.business_id
  where s.widget_id = p_widget_id
    and s.session_hash = p_session_hash
    and s.expires_at > clock_timestamp()
    and w.enabled
    and b.status = 'active'
  for update of s;

  if not found then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  if session_row.conversation_id is not null then
    return session_row.conversation_id;
  end if;

  select w.widget_name
  into widget_title
  from public.website_chat_widgets w
  where w.business_id = session_row.business_id
    and w.public_id = p_widget_id;

  insert into public.conversations(
    business_id,
    channel,
    status,
    subject,
    created_by
  ) values (
    session_row.business_id,
    'website_chat',
    'open',
    coalesce(widget_title, 'Website Chat'),
    null
  )
  returning id into result_id;

  update public.website_chat_sessions
  set conversation_id = result_id,
      last_seen_at = clock_timestamp()
  where id = session_row.id;

  return result_id;
end;
$$;

revoke all on function private.website_chat_ensure_conversation(uuid, text)
  from public, anon, authenticated;

create function public.website_chat_start(
  p_widget_id uuid,
  p_session_hash text
)
returns table(
  available boolean,
  widget_name text,
  launcher_label text,
  greeting_text text,
  welcome_message text,
  offline_message text,
  lead_capture_enabled boolean,
  accent_color text,
  contact_saved boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  widget_row public.website_chat_widgets%rowtype;
  session_row public.website_chat_sessions%rowtype;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  select w.*
  into widget_row
  from public.website_chat_widgets w
  join public.businesses b on b.id = w.business_id
  where w.public_id = p_widget_id
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  if not widget_row.enabled then
    return query
      select false,
        widget_row.widget_name,
        widget_row.launcher_label,
        widget_row.greeting_text,
        widget_row.welcome_message,
        widget_row.offline_message,
        widget_row.lead_capture_enabled,
        widget_row.accent_color,
        false;
    return;
  end if;

  perform 1
  from public.website_chat_widgets
  where business_id = widget_row.business_id
  for update;

  select s.*
  into session_row
  from public.website_chat_sessions s
  where s.widget_id = p_widget_id
    and s.session_hash = p_session_hash
  limit 1
  for update;

  if found and session_row.expires_at <= clock_timestamp() then
    delete from public.website_chat_sessions where id = session_row.id;
    session_row := null;
  end if;

  if session_row.id is null then
    if (
      select count(*)
      from public.website_chat_sessions s
      where s.business_id = widget_row.business_id
        and s.created_at > clock_timestamp() - interval '24 hours'
    ) >= 100 then
      raise exception 'Chat unavailable' using errcode = '42501';
    end if;

    insert into public.website_chat_sessions(
      business_id,
      widget_id,
      session_hash
    ) values (
      widget_row.business_id,
      widget_row.public_id,
      p_session_hash
    )
    returning * into session_row;
  else
    update public.website_chat_sessions
    set last_seen_at = clock_timestamp()
    where id = session_row.id;
  end if;

  return query
    select true,
      widget_row.widget_name,
      widget_row.launcher_label,
      widget_row.greeting_text,
      widget_row.welcome_message,
      widget_row.offline_message,
      widget_row.lead_capture_enabled,
      widget_row.accent_color,
      exists (
        select 1
        from public.conversations c
        where c.business_id = session_row.business_id
          and c.id = session_row.conversation_id
          and c.lead_id is not null
      );
end;
$$;

create function public.website_chat_status(
  p_widget_id uuid,
  p_session_hash text
)
returns table(
  available boolean,
  contact_saved boolean,
  conversation_status public.conversation_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.website_chat_sessions%rowtype;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  select s.*
  into session_row
  from public.website_chat_sessions s
  join public.website_chat_widgets w
    on w.business_id = s.business_id
   and w.public_id = s.widget_id
  join public.businesses b on b.id = s.business_id
  where s.widget_id = p_widget_id
    and s.session_hash = p_session_hash
    and s.expires_at > clock_timestamp()
    and w.enabled
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  update public.website_chat_sessions
  set last_seen_at = clock_timestamp()
  where id = session_row.id;

  return query
    select true,
      coalesce(c.lead_id is not null, false),
      c.status
    from (select 1) marker
    left join public.conversations c
      on c.business_id = session_row.business_id
     and c.id = session_row.conversation_id;
end;
$$;

create function public.website_chat_history(
  p_widget_id uuid,
  p_session_hash text
)
returns table(
  sender_type public.message_sender_type,
  direction public.message_direction,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  v_conversation_id := private.website_chat_conversation(p_widget_id, p_session_hash);

  if v_conversation_id is null then
    if not exists (
      select 1
      from public.website_chat_sessions s
      join public.website_chat_widgets w
        on w.business_id = s.business_id
       and w.public_id = s.widget_id
      join public.businesses b on b.id = s.business_id
      where s.widget_id = p_widget_id
        and s.session_hash = p_session_hash
        and s.expires_at > clock_timestamp()
        and w.enabled
        and b.status = 'active'
    ) then
      raise exception 'Chat unavailable' using errcode = '42501';
    end if;
    return;
  end if;

  return query
    select m.sender_type, m.direction, m.body, m.created_at
    from public.messages m
    where m.conversation_id = v_conversation_id
      and m.direction <> 'internal'
    order by m.created_at, m.id
    limit 100;
end;
$$;

create function public.website_chat_send(
  p_widget_id uuid,
  p_session_hash text,
  p_request_id uuid,
  p_body text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_conversation_id uuid;
  visitor_count integer;
  too_soon boolean;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
     or p_request_id is null
     or p_body is null
     or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  v_business_id := private.website_chat_active_business(p_widget_id);
  if v_business_id is null then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  v_conversation_id := private.website_chat_ensure_conversation(
    p_widget_id,
    p_session_hash
  );

  if exists (
    select 1
    from public.messages m
    where m.business_id = v_business_id
      and m.conversation_id = v_conversation_id
      and m.request_id = p_request_id
  ) then
    return false;
  end if;

  select
    count(*)::integer,
    coalesce(
      max(m.created_at) > clock_timestamp() - interval '2 seconds',
      false
    )
  into visitor_count, too_soon
  from public.messages m
  where m.business_id = v_business_id
    and m.conversation_id = v_conversation_id
    and m.sender_type = 'customer'
    and m.direction = 'inbound';

  if visitor_count >= 30 or too_soon then
    raise exception 'Chat unavailable' using errcode = '42501';
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
    v_business_id,
    v_conversation_id,
    'customer',
    null,
    'inbound',
    btrim(p_body),
    p_request_id
  );

  update public.conversations c
  set status = 'open'
  where c.business_id = v_business_id
    and c.id = v_conversation_id
    and status <> 'open';

  update public.website_chat_sessions
  set last_seen_at = clock_timestamp()
  where widget_id = p_widget_id
    and session_hash = p_session_hash;

  return true;
end;
$$;

create function public.website_chat_capture_lead(
  p_widget_id uuid,
  p_session_hash text,
  p_contact_name text,
  p_phone text,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_conversation_id uuid;
  existing_lead_id uuid;
  new_lead_id uuid;
  capture_enabled boolean;
  clean_name text := btrim(coalesce(p_contact_name, ''));
  clean_phone text := btrim(coalesce(p_phone, ''));
  clean_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
     or char_length(clean_name) not between 1 and 120
     or char_length(clean_phone) > 40
     or char_length(clean_email) > 254
     or (clean_phone = '' and clean_email = '')
     or (clean_email <> '' and clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or clean_phone !~ '^[+0-9().[:space:]-]*$' then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  select w.business_id, w.lead_capture_enabled
  into v_business_id, capture_enabled
  from public.website_chat_widgets w
  join public.businesses b on b.id = w.business_id
  where w.public_id = p_widget_id
    and w.enabled
    and b.status = 'active';

  if v_business_id is null or not capture_enabled then
    raise exception 'Chat unavailable' using errcode = '42501';
  end if;

  v_conversation_id := private.website_chat_ensure_conversation(
    p_widget_id,
    p_session_hash
  );

  select c.lead_id
  into existing_lead_id
  from public.conversations c
  where c.business_id = v_business_id
    and c.id = v_conversation_id
  for update;

  if existing_lead_id is null then
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
      v_business_id,
      clean_name,
      clean_phone,
      clean_email,
      'website_chat',
      'Website Chat enquiry',
      'new',
      clock_timestamp(),
      null
    )
    returning id into new_lead_id;

    update public.conversations c
    set lead_id = new_lead_id
    where c.business_id = v_business_id
      and c.id = v_conversation_id;
  else
    update public.leads l
    set contact_name = clean_name,
        phone = clean_phone,
        email = clean_email,
        last_contact_at = clock_timestamp()
    where l.business_id = v_business_id
      and l.id = existing_lead_id;
  end if;

  update public.website_chat_sessions
  set last_seen_at = clock_timestamp()
  where widget_id = p_widget_id
    and session_hash = p_session_hash;

  return true;
end;
$$;

revoke all on function public.website_chat_start(uuid, text)
  from public, anon, authenticated;
revoke all on function public.website_chat_status(uuid, text)
  from public, anon, authenticated;
revoke all on function public.website_chat_history(uuid, text)
  from public, anon, authenticated;
revoke all on function public.website_chat_send(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.website_chat_capture_lead(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.website_chat_start(uuid, text) to codeedge_chat_api;
grant execute on function public.website_chat_status(uuid, text) to codeedge_chat_api;
grant execute on function public.website_chat_history(uuid, text) to codeedge_chat_api;
grant execute on function public.website_chat_send(uuid, text, uuid, text) to codeedge_chat_api;
grant execute on function public.website_chat_capture_lead(uuid, text, text, text, text)
  to codeedge_chat_api;


-- Keep canonical Conversations linked when a captured Lead is later converted.
create function private.link_customer_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set customer_id = new.id
  where business_id = new.business_id
    and lead_id = new.source_lead_id
    and customer_id is null;
  return new;
end;
$$;

revoke all on function private.link_customer_conversations()
  from public, anon, authenticated, codeedge_chat_api;

create trigger customers_link_conversations
after insert on public.customers
for each row execute function private.link_customer_conversations();
