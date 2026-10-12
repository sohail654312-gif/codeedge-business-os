-- WhatsApp auto-reply Phase 1: durable suggestions only; no automatic provider send.
-- All controls default OFF and are scoped to one business. Canonical inbound
-- messages and conversations continue to be written by whatsapp_receive_text.

create table public.whatsapp_auto_reply_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  monthly_draft_limit integer not null default 800
    check (monthly_draft_limit between 1 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger whatsapp_auto_reply_settings_updated
before update on public.whatsapp_auto_reply_settings
for each row execute function private.touch_updated_at();

create table public.whatsapp_auto_reply_contacts (
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid not null,
  customer_wa_id text not null check (customer_wa_id ~ '^[0-9]{5,32}$'),
  muted_reason text not null check (muted_reason in ('opt_out','human_requested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, connection_id, customer_wa_id),
  foreign key (business_id, connection_id)
    references public.channel_connections(business_id, id) on delete cascade
);

create trigger whatsapp_auto_reply_contacts_updated
before update on public.whatsapp_auto_reply_contacts
for each row execute function private.touch_updated_at();

create table public.whatsapp_auto_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid not null,
  conversation_id uuid not null,
  inbound_message_id uuid not null,
  decision text not null check (decision in (
    'draft','human_requested','opt_out','muted','limit_reached'
  )),
  reply_text text not null default ''
    check (char_length(reply_text) <= 4000),
  created_at timestamptz not null default now(),
  unique (business_id, inbound_message_id),
  foreign key (business_id, connection_id)
    references public.channel_connections(business_id, id) on delete cascade,
  foreign key (business_id, conversation_id)
    references public.conversations(business_id, id) on delete cascade,
  foreign key (business_id, inbound_message_id)
    references public.messages(business_id, id) on delete cascade,
  check ((decision='draft' and char_length(btrim(reply_text)) > 0)
       or (decision <> 'draft' and reply_text=''))
);

create index whatsapp_auto_reply_drafts_history
  on public.whatsapp_auto_reply_drafts(business_id, conversation_id, created_at desc);
create index whatsapp_auto_reply_drafts_quota
  on public.whatsapp_auto_reply_drafts(business_id, created_at)
  where decision='draft';

alter table public.whatsapp_auto_reply_settings enable row level security;
alter table public.whatsapp_auto_reply_settings force row level security;
alter table public.whatsapp_auto_reply_contacts enable row level security;
alter table public.whatsapp_auto_reply_contacts force row level security;
alter table public.whatsapp_auto_reply_drafts enable row level security;
alter table public.whatsapp_auto_reply_drafts force row level security;

revoke all on public.whatsapp_auto_reply_settings,
  public.whatsapp_auto_reply_contacts, public.whatsapp_auto_reply_drafts
  from public, anon, authenticated;
grant select on public.whatsapp_auto_reply_settings,
  public.whatsapp_auto_reply_contacts, public.whatsapp_auto_reply_drafts
  to authenticated;
grant insert (business_id,enabled,monthly_draft_limit)
  on public.whatsapp_auto_reply_settings to authenticated;
grant update (enabled,monthly_draft_limit)
  on public.whatsapp_auto_reply_settings to authenticated;

create policy whatsapp_auto_reply_settings_read
  on public.whatsapp_auto_reply_settings for select to authenticated
  using (private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]));
create policy whatsapp_auto_reply_settings_insert
  on public.whatsapp_auto_reply_settings for insert to authenticated
  with check (private.has_business_role(
    business_id,array['owner']::public.business_role[]));
create policy whatsapp_auto_reply_settings_update
  on public.whatsapp_auto_reply_settings for update to authenticated
  using (private.has_business_role(
    business_id,array['owner']::public.business_role[]))
  with check (private.has_business_role(
    business_id,array['owner']::public.business_role[]));
create policy whatsapp_auto_reply_contacts_read
  on public.whatsapp_auto_reply_contacts for select to authenticated
  using (private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]));
create policy whatsapp_auto_reply_drafts_read
  on public.whatsapp_auto_reply_drafts for select to authenticated
  using (private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]));

-- A single restricted communication capability plans a reply after signed
-- webhook ingest. No browser role can invoke this or forge drafts/mutes.
-- The settings-row lock serializes quota checks across simultaneous webhooks.
create function public.whatsapp_plan_auto_reply(
  p_external_sender_id text,
  p_inbound_message_id uuid,
  p_action text,
  p_suggestion text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection public.channel_connections%rowtype;
  inbound public.messages%rowtype;
  convo public.conversations%rowtype;
  setting public.whatsapp_auto_reply_settings%rowtype;
  decision text;
  monthly_count integer;
begin
  if p_inbound_message_id is null or p_action is null
     or p_action not in ('draft','human_requested','opt_out') then
    raise exception 'Invalid auto-reply request' using errcode='22023';
  end if;

  connection := private.active_whatsapp_connection(p_external_sender_id);
  select m.*
    into inbound
  from public.messages m
  join public.conversations c
    on c.business_id=m.business_id and c.id=m.conversation_id
  where m.id=p_inbound_message_id
    and m.business_id=connection.business_id
    and m.sender_type='customer'
    and m.direction='inbound'
    and c.channel='whatsapp'
    and c.channel_connection_id=connection.id
    and c.external_thread_id ~ '^[0-9]{5,32}$';
  if not found then
    raise exception 'Inbound unavailable' using errcode='42501';
  end if;

  -- Meta may retry a webhook after the canonical inbound was committed.
  -- Replanning must not create a second suggestion or mutate handoff state.
  if exists (
    select 1 from public.whatsapp_auto_reply_drafts d
    where d.business_id=connection.business_id
      and d.inbound_message_id=inbound.id
  ) then
    return 'duplicate';
  end if;

  select * into setting
  from public.whatsapp_auto_reply_settings s
  where s.business_id=connection.business_id
  for update;

  if not found or not setting.enabled then
    return 'disabled';
  end if;

  select * into convo from public.conversations c
    where c.business_id=connection.business_id and c.id=inbound.conversation_id;
  if not found then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  if p_action in ('human_requested','opt_out') then
    insert into public.whatsapp_auto_reply_contacts(
      business_id,connection_id,customer_wa_id,muted_reason
    ) values(
      connection.business_id,connection.id,convo.external_thread_id,p_action
    )
    on conflict (business_id,connection_id,customer_wa_id)
    do update set muted_reason=case
      when public.whatsapp_auto_reply_contacts.muted_reason='opt_out'
        then 'opt_out'
      else excluded.muted_reason end;
    decision := p_action;
  elsif exists (
    select 1 from public.whatsapp_auto_reply_contacts x
    where x.business_id=connection.business_id
      and x.connection_id=connection.id
      and x.customer_wa_id=convo.external_thread_id
  ) then
    decision := 'muted';
  else
    if p_suggestion is null
       or char_length(btrim(p_suggestion)) not between 1 and 4000 then
      raise exception 'Invalid suggestion' using errcode='22023';
    end if;
    select count(*)::integer into monthly_count
      from public.whatsapp_auto_reply_drafts d
      where d.business_id=connection.business_id
        and d.decision='draft'
        and d.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
        and d.created_at < (date_trunc('month', now() at time zone 'UTC')
          + interval '1 month') at time zone 'UTC';
    decision := case when monthly_count >= setting.monthly_draft_limit
      then 'limit_reached' else 'draft' end;
  end if;

  insert into public.whatsapp_auto_reply_drafts(
    business_id,connection_id,conversation_id,inbound_message_id,decision,reply_text
  ) values (
    connection.business_id,connection.id,inbound.conversation_id,inbound.id,
    decision,case when decision='draft' then btrim(p_suggestion) else '' end
  ) on conflict (business_id,inbound_message_id) do nothing;

  return decision;
end;
$$;

revoke all on function public.whatsapp_plan_auto_reply(text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.whatsapp_plan_auto_reply(text,uuid,text,text)
  to codeedge_communication_api;
