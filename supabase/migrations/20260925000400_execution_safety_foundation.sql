-- Communication execution safety foundation.
-- Existing workspaces/connections remain production for backward compatibility.
-- External-effect decisions are derived server-side from tenant-owned database state.

create type public.execution_mode as enum (
  'demo',
  'sandbox',
  'production'
);

create type public.credential_environment as enum (
  'sandbox',
  'production'
);

alter table public.businesses
  add column execution_mode public.execution_mode not null default 'production';

alter table public.channel_connections
  add column credential_environment public.credential_environment not null default 'production';

-- Do not let browser roles change execution safety context.
-- Existing column-level grants on businesses and channel_connections deliberately
-- exclude execution_mode and credential_environment.

alter table public.message_deliveries
  add column execution_mode public.execution_mode,
  add column provider_environment public.credential_environment,
  add column correlation_id uuid,
  add column simulated boolean not null default false;

-- Backfill historical deliveries without changing historical business data or status.
update public.message_deliveries d
set execution_mode = b.execution_mode,
    provider_environment = cc.credential_environment,
    correlation_id = m.request_id,
    simulated = false
from public.businesses b,
     public.channel_connections cc,
     public.messages m
where b.id = d.business_id
  and cc.business_id = d.business_id
  and cc.id = d.connection_id
  and m.business_id = d.business_id
  and m.id = d.message_id;

alter table public.message_deliveries
  alter column execution_mode set not null,
  alter column provider_environment set not null;

create function private.snapshot_delivery_execution_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mode public.execution_mode;
  environment public.credential_environment;
  request_id uuid;
begin
  select b.execution_mode, cc.credential_environment, m.request_id
  into mode, environment, request_id
  from public.businesses b
  join public.channel_connections cc
    on cc.business_id = b.id
   and cc.id = new.connection_id
  join public.messages m
    on m.business_id = b.id
   and m.id = new.message_id
  where b.id = new.business_id
    and cc.provider = new.provider
    and m.conversation_id = new.conversation_id
  limit 1;

  if not found or mode is null or environment is null then
    raise exception 'Invalid execution context' using errcode = '42501';
  end if;

  new.execution_mode := mode;
  new.provider_environment := environment;
  new.correlation_id := request_id;
  new.simulated := coalesce(new.simulated, false);
  return new;
end;
$$;

revoke all on function private.snapshot_delivery_execution_context()
  from public, anon, authenticated;

create trigger message_deliveries_execution_context
before insert on public.message_deliveries
for each row execute function private.snapshot_delivery_execution_context();

create function public.communication_execution_context(p_message_id uuid)
returns table(
  business_id uuid,
  execution_mode public.execution_mode,
  prepared_execution_mode public.execution_mode,
  channel public.conversation_channel,
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
  if p_message_id is null then
    raise exception 'Execution context unavailable' using errcode = '42501';
  end if;

  return query
  select
    d.business_id,
    b.execution_mode,
    d.execution_mode,
    c.channel,
    d.provider,
    cc.credential_environment,
    d.provider_environment,
    d.correlation_id,
    d.simulated
  from public.message_deliveries d
  join public.businesses b
    on b.id = d.business_id
  join public.conversations c
    on c.business_id = d.business_id
   and c.id = d.conversation_id
  join public.channel_connections cc
    on cc.business_id = d.business_id
   and cc.id = d.connection_id
   and cc.provider = d.provider
   and cc.channel = c.channel
  where d.message_id = p_message_id
    and c.channel in ('whatsapp','email','sms')
  limit 1;

  if not found then
    raise exception 'Execution context unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.communication_execution_context(uuid)
  from public, anon, authenticated;
grant execute on function public.communication_execution_context(uuid)
  to codeedge_communication_api;

comment on column public.businesses.execution_mode is
  'Server-trusted workspace execution mode. Browser roles cannot update this column.';
comment on column public.channel_connections.credential_environment is
  'Server-trusted credential environment classification. Browser roles cannot update this column.';
comment on column public.message_deliveries.execution_mode is
  'Immutable-at-insert execution mode snapshot used for external-effect auditability.';
comment on column public.message_deliveries.provider_environment is
  'Immutable-at-insert provider credential environment snapshot.';
comment on column public.message_deliveries.correlation_id is
  'Outbound request/correlation UUID copied from the canonical Message request_id.';
