-- Codeedge-owned Automation Engine foundation.
-- Existing domain tables remain authoritative; Automation connects them through trusted events.

create type public.automation_run_status as enum (
  'pending','running','succeeded','skipped','failed'
);

create type public.automation_action_status as enum (
  'pending','succeeded','simulated','failed'
);

create table public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in (
    'lead.created','lead.status_changed',
    'conversation.created','message.received',
    'appointment.created','appointment.confirmed',
    'appointment.rescheduled','appointment.cancelled',
    'voice.call.completed','voice.call.failed','voice.handoff.requested'
  )),
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);

create table public.automation_domain_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  subject_type text not null,
  subject_id uuid not null,
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid null references public.automation_domain_events(id),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (business_id,id)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  workflow_id uuid not null,
  workflow_version integer not null,
  event_id uuid not null,
  status public.automation_run_status not null default 'pending',
  execution_mode public.execution_mode not null,
  correlation_id uuid not null,
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  foreign key (business_id,workflow_id)
    references public.automation_workflows(business_id,id) on delete cascade,
  foreign key (business_id,event_id)
    references public.automation_domain_events(business_id,id) on delete cascade,
  unique (workflow_id,event_id)
);

create table public.automation_action_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  action_index integer not null check (action_index >= 0),
  action_type text not null,
  status public.automation_action_status not null default 'pending',
  external_effect boolean not null default false,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (run_id,action_index)
);

create index automation_workflows_trigger_idx
  on public.automation_workflows(business_id,trigger_type)
  where enabled;
create index automation_runs_pending_idx
  on public.automation_runs(status,created_at)
  where status='pending';
create index automation_events_business_idx
  on public.automation_domain_events(business_id,created_at desc);

alter table public.automation_workflows enable row level security;
alter table public.automation_workflows force row level security;
alter table public.automation_domain_events enable row level security;
alter table public.automation_domain_events force row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_runs force row level security;
alter table public.automation_action_runs enable row level security;
alter table public.automation_action_runs force row level security;

create policy automation_workflows_read on public.automation_workflows
for select to authenticated using (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_workflows.business_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

create policy automation_workflows_owner_insert on public.automation_workflows
for insert to authenticated with check (
  created_by=(select auth.uid()) and exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_workflows.business_id
      and m.user_id=(select auth.uid())
      and m.status='active' and m.role='owner'
  )
);

create policy automation_workflows_owner_update on public.automation_workflows
for update to authenticated using (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_workflows.business_id
      and m.user_id=(select auth.uid())
      and m.status='active' and m.role='owner'
  )
) with check (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_workflows.business_id
      and m.user_id=(select auth.uid())
      and m.status='active' and m.role='owner'
  )
);

create policy automation_workflows_owner_delete on public.automation_workflows
for delete to authenticated using (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_workflows.business_id
      and m.user_id=(select auth.uid())
      and m.status='active' and m.role='owner'
  )
);

create policy automation_events_read on public.automation_domain_events
for select to authenticated using (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_domain_events.business_id
      and m.user_id=(select auth.uid()) and m.status='active'
  )
);

create policy automation_runs_read on public.automation_runs
for select to authenticated using (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_runs.business_id
      and m.user_id=(select auth.uid()) and m.status='active'
  )
);

create policy automation_action_runs_read on public.automation_action_runs
for select to authenticated using (
  exists (
    select 1 from public.business_memberships m
    where m.business_id=automation_action_runs.business_id
      and m.user_id=(select auth.uid()) and m.status='active'
  )
);

create role codeedge_automation_api nologin noinherit nobypassrls;
grant usage on schema public to codeedge_automation_api;
grant select,insert,update on public.automation_domain_events to codeedge_automation_api;
grant select on public.automation_workflows to codeedge_automation_api;
grant select,insert,update on public.automation_runs to codeedge_automation_api;
grant select,insert,update on public.automation_action_runs to codeedge_automation_api;
grant select on public.businesses to codeedge_automation_api;
grant select,insert on public.crm_activities to codeedge_automation_api;
grant select,update on public.leads to codeedge_automation_api;
grant select,update on public.conversations to codeedge_automation_api;

create or replace function private.automation_enqueue(
  p_business_id uuid,
  p_event_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event_id uuid;
begin
  if p_business_id is null or p_subject_id is null then
    raise exception 'Automation event identity is required.';
  end if;

  insert into public.automation_domain_events(
    business_id,event_type,subject_type,subject_id,payload
  ) values (
    p_business_id,p_event_type,p_subject_type,p_subject_id,coalesce(p_payload,'{}'::jsonb)
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function private.automation_enqueue(uuid,text,text,uuid,jsonb)
from public,anon,authenticated;

create or replace function private.automation_schedule_runs()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.automation_runs(
    business_id,workflow_id,workflow_version,event_id,execution_mode,correlation_id
  )
  select
    new.business_id,w.id,w.version,new.id,b.execution_mode,new.correlation_id
  from public.automation_workflows w
  join public.businesses b on b.id=w.business_id
  where w.business_id=new.business_id
    and w.enabled
    and w.trigger_type=new.event_type
    and b.status='active'
  on conflict (workflow_id,event_id) do nothing;

  return new;
end;
$$;

create trigger automation_schedule_runs
after insert on public.automation_domain_events
for each row execute function private.automation_schedule_runs();

create or replace function private.automation_lead_events()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    perform private.automation_enqueue(
      new.business_id,'lead.created','lead',new.id,
      jsonb_build_object(
        'lead',jsonb_build_object(
          'id',new.id,'status',new.status,'source',new.source,
          'service_id',new.service_id,'estimated_value_pence',new.estimated_value_pence
        )
      )
    );
  elsif new.status is distinct from old.status then
    perform private.automation_enqueue(
      new.business_id,'lead.status_changed','lead',new.id,
      jsonb_build_object(
        'lead',jsonb_build_object(
          'id',new.id,'status',new.status,'previous_status',old.status,
          'source',new.source,'service_id',new.service_id
        )
      )
    );
  end if;
  return new;
end;
$$;

create trigger automation_lead_events
after insert or update of status on public.leads
for each row execute function private.automation_lead_events();

create or replace function private.automation_conversation_events()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.automation_enqueue(
    new.business_id,'conversation.created','conversation',new.id,
    jsonb_build_object(
      'conversation',jsonb_build_object(
        'id',new.id,'channel',new.channel,'status',new.status,
        'lead_id',new.lead_id,'customer_id',new.customer_id
      )
    )
  );
  return new;
end;
$$;

create trigger automation_conversation_events
after insert on public.conversations
for each row execute function private.automation_conversation_events();

create or replace function private.automation_message_events()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_channel text;
begin
  if new.direction <> 'inbound' then return new; end if;

  select c.channel::text into v_channel
  from public.conversations c
  where c.business_id=new.business_id and c.id=new.conversation_id;

  perform private.automation_enqueue(
    new.business_id,'message.received','conversation',new.conversation_id,
    jsonb_build_object(
      'message',jsonb_build_object(
        'id',new.id,'sender_type',new.sender_type,'direction',new.direction
      ),
      'conversation',jsonb_build_object(
        'id',new.conversation_id,'channel',v_channel
      )
    )
  );
  return new;
end;
$$;

create trigger automation_message_events
after insert on public.messages
for each row execute function private.automation_message_events();

create or replace function private.automation_appointment_events()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event text;
begin
  if tg_op='INSERT' then
    v_event := 'appointment.created';
  elsif new.starts_at is distinct from old.starts_at then
    v_event := 'appointment.rescheduled';
  elsif new.status is distinct from old.status and new.status::text='confirmed' then
    v_event := 'appointment.confirmed';
  elsif new.status is distinct from old.status and new.status::text='cancelled' then
    v_event := 'appointment.cancelled';
  else
    return new;
  end if;

  perform private.automation_enqueue(
    new.business_id,v_event,'appointment',new.id,
    jsonb_build_object(
      'appointment',jsonb_build_object(
        'id',new.id,'status',new.status,'service_id',new.service_id,
        'lead_id',new.lead_id,'customer_id',new.customer_id,
        'starts_at',new.starts_at,'ends_at',new.ends_at
      )
    )
  );
  return new;
end;
$$;

create trigger automation_appointment_events
after insert or update of status,starts_at on public.appointments
for each row execute function private.automation_appointment_events();

create or replace function private.automation_voice_events()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event text;
begin
  if new.handoff_required and (tg_op='INSERT' or not coalesce(old.handoff_required,false)) then
    perform private.automation_enqueue(
      new.business_id,'voice.handoff.requested','voice_call',new.id,
      jsonb_build_object(
        'voice',jsonb_build_object(
          'id',new.id,'status',new.status,'direction',new.direction,
          'conversation_id',new.conversation_id,'lead_id',new.lead_id
        )
      )
    );
  end if;

  if tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status::text='completed' then
      v_event := 'voice.call.completed';
    elsif new.status::text='failed' then
      v_event := 'voice.call.failed';
    else
      return new;
    end if;

    perform private.automation_enqueue(
      new.business_id,v_event,'voice_call',new.id,
      jsonb_build_object(
        'voice',jsonb_build_object(
          'id',new.id,'status',new.status,'direction',new.direction,
          'conversation_id',new.conversation_id,'lead_id',new.lead_id,
          'handoff_required',new.handoff_required
        )
      )
    );
  end if;
  return new;
end;
$$;

create trigger automation_voice_events
after insert or update of status,handoff_required on public.voice_calls
for each row execute function private.automation_voice_events();

create or replace function public.automation_claim_runs(p_limit integer default 10)
returns table(
  run_id uuid,business_id uuid,workflow_id uuid,event_id uuid,
  execution_mode public.execution_mode,correlation_id uuid
)
language sql
security definer
set search_path=''
as $$
  with claimed as (
    select r.id
    from public.automation_runs r
    where r.status='pending'
    order by r.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  )
  update public.automation_runs r
  set status='running',
      attempts=r.attempts+1,
      started_at=coalesce(r.started_at,now()),
      error_code=null
  from claimed c
  where r.id=c.id
  returning r.id,r.business_id,r.workflow_id,r.event_id,
            r.execution_mode,r.correlation_id;
$$;

create or replace function public.automation_complete_run(
  p_run_id uuid,
  p_status public.automation_run_status,
  p_error_code text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_status not in ('succeeded','skipped','failed') then
    raise exception 'Invalid terminal Automation status.';
  end if;

  update public.automation_runs
  set status=p_status,completed_at=now(),error_code=p_error_code
  where id=p_run_id and status='running';

  if not found then
    raise exception 'Automation run unavailable.';
  end if;
end;
$$;

create or replace function public.automation_record_action(
  p_run_id uuid,
  p_action_index integer,
  p_action_type text,
  p_status public.automation_action_status,
  p_external_effect boolean,
  p_result jsonb default '{}'::jsonb,
  p_error_code text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.automation_runs where id=p_run_id;

  if v_business_id is null then
    raise exception 'Automation run unavailable.';
  end if;

  insert into public.automation_action_runs(
    business_id,run_id,action_index,action_type,status,
    external_effect,result,error_code,completed_at
  ) values (
    v_business_id,p_run_id,p_action_index,p_action_type,p_status,
    p_external_effect,coalesce(p_result,'{}'::jsonb),p_error_code,
    case when p_status='pending' then null else now() end
  )
  on conflict (run_id,action_index) do update
  set status=excluded.status,
      action_type=excluded.action_type,
      external_effect=excluded.external_effect,
      result=excluded.result,
      error_code=excluded.error_code,
      completed_at=excluded.completed_at
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.automation_claim_runs(integer)
to codeedge_automation_api;
grant execute on function public.automation_complete_run(uuid,public.automation_run_status,text)
to codeedge_automation_api;
grant execute on function public.automation_record_action(
  uuid,integer,text,public.automation_action_status,boolean,jsonb,text
) to codeedge_automation_api;

revoke all on function public.automation_claim_runs(integer)
from public,anon,authenticated;
revoke all on function public.automation_complete_run(uuid,public.automation_run_status,text)
from public,anon,authenticated;
revoke all on function public.automation_record_action(
  uuid,integer,text,public.automation_action_status,boolean,jsonb,text
) from public,anon,authenticated;
