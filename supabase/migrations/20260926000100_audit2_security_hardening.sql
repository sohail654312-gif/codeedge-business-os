-- Audit 2 security hardening: actor-attributed configuration audit events
-- and a tenant/environment-aware Email credential resolution boundary.

create table public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('user','system')),
  event_type text not null check (char_length(event_type) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id text not null check (char_length(resource_id) between 1 and 255),
  before_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(before_metadata) = 'object'),
  after_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(after_metadata) = 'object'),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  check (
    (actor_kind = 'user' and actor_user_id is not null)
    or (actor_kind = 'system' and actor_user_id is null)
  )
);

create index security_audit_events_business_created
  on public.security_audit_events(business_id, created_at desc, id desc);
create index security_audit_events_actor
  on public.security_audit_events(actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.security_audit_events enable row level security;
alter table public.security_audit_events force row level security;

revoke all on public.security_audit_events from public, anon, authenticated;
grant select on public.security_audit_events to authenticated;

create policy security_audit_events_read
on public.security_audit_events
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create function private.reject_security_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Security audit events are append-only' using errcode = '42501';
end;
$$;

revoke all on function private.reject_security_audit_mutation()
  from public, anon, authenticated;

create trigger security_audit_events_append_only
before update or delete on public.security_audit_events
for each row execute function private.reject_security_audit_mutation();

create function private.security_configuration_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_resource_type text;
  v_resource_id text;
  v_actor_user_id uuid := (select auth.uid());
  v_actor_kind text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  v_actor_kind := case when v_actor_user_id is null then 'system' else 'user' end;

  if tg_table_name = 'channel_connections' then
    if tg_op <> 'INSERT' then
      v_business_id := old.business_id;
      v_resource_id := old.id::text;
      v_before := jsonb_build_object(
        'channel', old.channel,
        'provider', old.provider,
        'externalAccountId', old.external_account_id,
        'externalSenderId', old.external_sender_id,
        'displayAddress', old.display_address,
        'credentialKey', old.credential_key,
        'credentialEnvironment', old.credential_environment,
        'enabled', old.enabled
      );
    end if;
    if tg_op <> 'DELETE' then
      v_business_id := new.business_id;
      v_resource_id := new.id::text;
      v_after := jsonb_build_object(
        'channel', new.channel,
        'provider', new.provider,
        'externalAccountId', new.external_account_id,
        'externalSenderId', new.external_sender_id,
        'displayAddress', new.display_address,
        'credentialKey', new.credential_key,
        'credentialEnvironment', new.credential_environment,
        'enabled', new.enabled
      );
    end if;
    v_resource_type := 'channel_connection';

  elsif tg_table_name = 'email_channel_settings' then
    if tg_op <> 'INSERT' then
      v_business_id := old.business_id;
      v_resource_id := old.connection_id::text;
      v_before := jsonb_build_object(
        'senderName', old.sender_name,
        'senderEmail', old.sender_email,
        'replyToEmail', old.reply_to_email,
        'inboundEmail', old.inbound_email
      );
    end if;
    if tg_op <> 'DELETE' then
      v_business_id := new.business_id;
      v_resource_id := new.connection_id::text;
      v_after := jsonb_build_object(
        'senderName', new.sender_name,
        'senderEmail', new.sender_email,
        'replyToEmail', new.reply_to_email,
        'inboundEmail', new.inbound_email
      );
    end if;
    v_resource_type := 'email_channel_settings';

  elsif tg_table_name = 'voice_receptionist_settings' then
    if tg_op <> 'INSERT' then
      v_business_id := old.business_id;
      v_resource_id := old.business_id::text;
      v_before := jsonb_build_object(
        'enabled', old.enabled,
        'provider', old.provider,
        'voice', old.voice,
        'preferredLanguage', old.preferred_language,
        'allowedTools', old.allowed_tools,
        'handoffBehavior', old.handoff_behavior
      );
    end if;
    if tg_op <> 'DELETE' then
      v_business_id := new.business_id;
      v_resource_id := new.business_id::text;
      v_after := jsonb_build_object(
        'enabled', new.enabled,
        'provider', new.provider,
        'voice', new.voice,
        'preferredLanguage', new.preferred_language,
        'allowedTools', new.allowed_tools,
        'handoffBehavior', new.handoff_behavior
      );
    end if;
    v_resource_type := 'voice_receptionist_settings';
  else
    raise exception 'Unsupported security audit resource';
  end if;

  if tg_op = 'UPDATE' and v_before = v_after then
    return new;
  end if;

  insert into public.security_audit_events(
    business_id,
    actor_user_id,
    actor_kind,
    event_type,
    resource_type,
    resource_id,
    before_metadata,
    after_metadata
  ) values (
    v_business_id,
    v_actor_user_id,
    v_actor_kind,
    'security.configuration.' || lower(tg_op),
    v_resource_type,
    v_resource_id,
    v_before,
    v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.security_configuration_audit()
  from public, anon, authenticated;

create trigger security_audit_channel_connections
after insert or update or delete on public.channel_connections
for each row execute function private.security_configuration_audit();

create trigger security_audit_email_channel_settings
after insert or update or delete on public.email_channel_settings
for each row execute function private.security_configuration_audit();

create trigger security_audit_voice_receptionist_settings
after insert or update or delete on public.voice_receptionist_settings
for each row execute function private.security_configuration_audit();

create function private.active_email_connection_v2(p_inbound_email text)
returns table(
  business_id uuid,
  connection_id uuid,
  provider text,
  credential_key text,
  credential_environment public.credential_environment,
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
    cc.credential_environment,
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

revoke all on function private.active_email_connection_v2(text)
  from public, anon, authenticated;
grant execute on function private.active_email_connection_v2(text)
  to codeedge_communication_api;

comment on table public.security_audit_events is
  'Append-only tenant security configuration audit. Raw provider secrets are never stored.';
