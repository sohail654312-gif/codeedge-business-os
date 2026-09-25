-- Codeedge provider-neutral AI Runtime + AI Accountant approval foundation.
-- Model output is untrusted. Codeedge owns tenant identity, tools, approval and Finance execution.

create table public.ai_sessions (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_type text not null check (agent_type in ('accountant')),
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','closed')),
  provider text not null check (char_length(provider) between 1 and 80),
  model text not null default '' check (char_length(model) <= 160),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  provider text not null default '' check (char_length(provider) <= 80),
  model text not null default '' check (char_length(model) <= 160),
  created_at timestamptz not null default now(),
  constraint ai_messages_session_same_tenant
    foreign key (business_id,session_id)
    references public.ai_sessions(business_id,id) on delete cascade
);

create table public.ai_tool_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid not null,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  status text not null check (status in ('succeeded','failed')),
  correlation_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output_summary jsonb not null default '{}'::jsonb check (
    jsonb_typeof(output_summary)='object'
  ),
  error_code text check (
    error_code is null or char_length(error_code) <= 120
  ),
  provider text not null default '' check (char_length(provider) <= 80),
  model text not null default '' check (char_length(model) <= 160),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 600000),
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint ai_tool_runs_session_same_tenant
    foreign key (business_id,session_id)
    references public.ai_sessions(business_id,id) on delete cascade
);

create table public.ai_action_proposals (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid not null,
  action_type text not null check (action_type in (
    'finance.customer.create',
    'finance.quote.create',
    'finance.invoice.create',
    'finance.payment.record',
    'finance.supplier.create',
    'finance.bill.create',
    'finance.expense.create'
  )),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'proposed' check (status in (
    'proposed','executing','succeeded','failed','rejected','expired','cancelled'
  )),
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  execution_mode public.execution_mode not null,
  finance_engine text not null check (
    finance_engine ~ '^[a-z][a-z0-9_]{0,79}$'
  ),
  correlation_id uuid not null,
  request_id uuid not null,
  result_reference text not null default '' check (
    char_length(result_reference) <= 255
  ),
  error_code text check (
    error_code is null or char_length(error_code) <= 120
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  executed_at timestamptz,
  constraint ai_proposals_session_same_tenant
    foreign key (business_id,session_id)
    references public.ai_sessions(business_id,id) on delete cascade,
  unique (business_id,request_id)
);

create table public.ai_request_windows (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (business_id,user_id,window_start)
);

create index ai_sessions_business_created
  on public.ai_sessions(business_id,created_at desc,id desc);
create index ai_messages_session_created
  on public.ai_messages(business_id,session_id,created_at,id);
create index ai_tool_runs_session_created
  on public.ai_tool_runs(business_id,session_id,created_at desc,id desc);
create index ai_proposals_session_created
  on public.ai_action_proposals(business_id,session_id,created_at desc,id desc);
create index ai_proposals_pending
  on public.ai_action_proposals(business_id,status,expires_at)
  where status in ('proposed','executing');

create trigger ai_sessions_updated before update on public.ai_sessions
for each row execute function private.touch_updated_at();

alter table public.ai_sessions enable row level security;
alter table public.ai_sessions force row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_messages force row level security;
alter table public.ai_tool_runs enable row level security;
alter table public.ai_tool_runs force row level security;
alter table public.ai_action_proposals enable row level security;
alter table public.ai_action_proposals force row level security;
alter table public.ai_request_windows enable row level security;
alter table public.ai_request_windows force row level security;

revoke all on public.ai_sessions,
  public.ai_messages,
  public.ai_tool_runs,
  public.ai_action_proposals,
  public.ai_request_windows
from public,anon,authenticated;

grant select on public.ai_sessions,
  public.ai_messages,
  public.ai_tool_runs,
  public.ai_action_proposals
to authenticated;

create policy ai_sessions_read on public.ai_sessions
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

create policy ai_messages_read on public.ai_messages
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

create policy ai_tool_runs_read on public.ai_tool_runs
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

create policy ai_action_proposals_read on public.ai_action_proposals
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_ai_api') then
    create role codeedge_ai_api nologin noinherit nobypassrls;
  elsif exists(
    select 1
    from pg_roles
    where rolname='codeedge_ai_api'
      and (
        rolsuper or rolbypassrls or rolcanlogin or rolinherit or
        rolcreaterole or rolcreatedb or rolreplication
      )
  ) then
    raise exception 'Unsafe pre-existing AI role';
  end if;
end $$;

grant codeedge_ai_api to postgres;
grant usage on schema public,private to codeedge_ai_api;
grant select on public.ai_sessions,
  public.ai_messages,
  public.ai_tool_runs,
  public.ai_action_proposals
to codeedge_ai_api;

create or replace function public.ai_consume_request(
  p_business_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_window timestamptz := date_trunc('minute',clock_timestamp());
  v_count integer;
begin
  if not exists(
    select 1
    from public.business_memberships m
    join public.businesses b on b.id=m.business_id
    where m.business_id=p_business_id
      and m.user_id=p_user_id
      and m.status='active'
      and m.role in ('owner','staff')
      and b.status='active'
  ) then
    raise exception 'AI request unavailable' using errcode='42501';
  end if;

  insert into public.ai_request_windows(
    business_id,user_id,window_start,request_count
  ) values (
    p_business_id,p_user_id,v_window,1
  )
  on conflict (business_id,user_id,window_start) do update
  set request_count=public.ai_request_windows.request_count+1
  returning request_count into v_count;

  return v_count;
end;
$$;

create or replace function public.ai_start_session(
  p_session_id uuid,
  p_business_id uuid,
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_prompt_version text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.ai_sessions%rowtype;
begin
  if p_session_id is null then
    raise exception 'AI session identity required' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.business_memberships m
    join public.businesses b on b.id=m.business_id
    where m.business_id=p_business_id
      and m.user_id=p_user_id
      and m.status='active'
      and m.role in ('owner','staff')
      and b.status='active'
  ) then
    raise exception 'AI session unavailable' using errcode='42501';
  end if;

  insert into public.ai_sessions(
    id,business_id,agent_type,created_by,status,provider,model,prompt_version
  ) values (
    p_session_id,p_business_id,'accountant',p_user_id,'active',
    left(p_provider,80),left(coalesce(p_model,''),160),left(p_prompt_version,80)
  )
  on conflict (id) do nothing;

  select * into v_session
  from public.ai_sessions s
  where s.id=p_session_id
    and s.business_id=p_business_id
    and s.created_by=p_user_id
    and s.agent_type='accountant'
  limit 1;

  if not found then
    raise exception 'AI session identity conflict' using errcode='42501';
  end if;

  return v_session.id;
end;
$$;

create or replace function public.ai_append_message(
  p_business_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_role text,
  p_content text,
  p_provider text default '',
  p_model text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if p_role not in ('user','assistant')
     or char_length(coalesce(p_content,'')) not between 1 and 8000 then
    raise exception 'Invalid AI message' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.ai_sessions s
    join public.business_memberships m
      on m.business_id=s.business_id and m.user_id=p_user_id
    join public.businesses b on b.id=s.business_id
    where s.business_id=p_business_id
      and s.id=p_session_id
      and s.status='active'
      and m.status='active'
      and m.role in ('owner','staff')
      and b.status='active'
  ) then
    raise exception 'AI session unavailable' using errcode='42501';
  end if;

  insert into public.ai_messages(
    business_id,session_id,role,content,provider,model
  ) values (
    p_business_id,p_session_id,p_role,p_content,
    left(coalesce(p_provider,''),80),left(coalesce(p_model,''),160)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ai_record_tool_run(
  p_business_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_tool_name text,
  p_status text,
  p_correlation_id uuid,
  p_input_hash text,
  p_output_summary jsonb,
  p_error_code text,
  p_provider text,
  p_model text,
  p_latency_ms integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if p_status not in ('succeeded','failed')
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_correlation_id is null
     or jsonb_typeof(coalesce(p_output_summary,'{}'::jsonb))<>'object' then
    raise exception 'Invalid AI tool audit record' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.ai_sessions s
    join public.business_memberships m
      on m.business_id=s.business_id and m.user_id=p_user_id
    where s.business_id=p_business_id
      and s.id=p_session_id
      and m.status='active'
      and m.role in ('owner','staff')
  ) then
    raise exception 'AI session unavailable' using errcode='42501';
  end if;

  insert into public.ai_tool_runs(
    business_id,session_id,tool_name,status,correlation_id,input_hash,
    output_summary,error_code,provider,model,latency_ms
  ) values (
    p_business_id,p_session_id,left(p_tool_name,120),p_status,p_correlation_id,
    p_input_hash,coalesce(p_output_summary,'{}'::jsonb),
    left(p_error_code,120),left(coalesce(p_provider,''),80),
    left(coalesce(p_model,''),160),p_latency_ms
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ai_create_action_proposal(
  p_proposal_id uuid,
  p_business_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_action_type text,
  p_payload jsonb,
  p_payload_hash text,
  p_expires_at timestamptz,
  p_correlation_id uuid,
  p_finance_engine text,
  p_execution_mode public.execution_mode
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if p_proposal_id is null
     or p_correlation_id is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object'
     or p_expires_at <= now()
     or p_expires_at > now()+interval '1 hour' then
    raise exception 'Invalid AI action proposal' using errcode='22023';
  end if;

  if p_action_type not in (
    'finance.customer.create','finance.quote.create','finance.invoice.create',
    'finance.payment.record','finance.supplier.create','finance.bill.create',
    'finance.expense.create'
  ) then
    raise exception 'AI action not allowed' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.ai_sessions s
    join public.business_memberships m
      on m.business_id=s.business_id and m.user_id=p_user_id
    join public.businesses b on b.id=s.business_id
    join public.finance_connections fc
      on fc.business_id=b.id and fc.enabled
    where s.business_id=p_business_id
      and s.id=p_session_id
      and s.status='active'
      and m.status='active'
      and m.role in ('owner','staff')
      and b.status='active'
      and b.execution_mode=p_execution_mode
      and fc.engine=p_finance_engine
  ) then
    raise exception 'AI Finance proposal context unavailable' using errcode='42501';
  end if;

  insert into public.ai_action_proposals(
    id,business_id,session_id,action_type,payload,payload_hash,status,
    requested_by,execution_mode,finance_engine,correlation_id,request_id,
    expires_at
  ) values (
    p_proposal_id,p_business_id,p_session_id,p_action_type,p_payload,
    p_payload_hash,'proposed',p_user_id,p_execution_mode,p_finance_engine,
    p_correlation_id,p_proposal_id,p_expires_at
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    select p.id into v_id
    from public.ai_action_proposals p
    where p.id=p_proposal_id
      and p.business_id=p_business_id
      and p.session_id=p_session_id
      and p.payload_hash=p_payload_hash
      and p.action_type=p_action_type;
  end if;

  if v_id is null then
    raise exception 'AI proposal identity conflict' using errcode='42501';
  end if;

  return v_id;
end;
$$;

create or replace function public.ai_claim_action_proposal(
  p_business_id uuid,
  p_user_id uuid,
  p_proposal_id uuid,
  p_payload_hash text
)
returns table(
  proposal_id uuid,
  action_type text,
  payload jsonb,
  request_id uuid,
  correlation_id uuid,
  finance_engine text,
  execution_mode public.execution_mode
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_proposal public.ai_action_proposals%rowtype;
  v_current_mode public.execution_mode;
  v_current_engine text;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AI proposal integrity invalid' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.business_memberships m
    join public.businesses b on b.id=m.business_id
    where m.business_id=p_business_id
      and m.user_id=p_user_id
      and m.status='active'
      and m.role='owner'
      and b.status='active'
  ) then
    raise exception 'AI approval unavailable' using errcode='42501';
  end if;

  select * into v_proposal
  from public.ai_action_proposals p
  where p.business_id=p_business_id
    and p.id=p_proposal_id
  for update;

  if not found then
    raise exception 'AI proposal unavailable' using errcode='42501';
  end if;

  if v_proposal.status='proposed' and v_proposal.expires_at<=now() then
    update public.ai_action_proposals
    set status='expired'
    where business_id=p_business_id and id=p_proposal_id;
    raise exception 'AI proposal expired' using errcode='42501';
  end if;

  if v_proposal.status<>'proposed' then
    raise exception 'AI proposal is not pending' using errcode='42501';
  end if;

  if v_proposal.payload_hash<>p_payload_hash then
    raise exception 'AI proposal integrity invalid' using errcode='42501';
  end if;

  select b.execution_mode,fc.engine
  into v_current_mode,v_current_engine
  from public.businesses b
  join public.finance_connections fc
    on fc.business_id=b.id and fc.enabled
  where b.id=p_business_id and b.status='active'
  limit 1;

  if not found
     or v_current_mode<>v_proposal.execution_mode
     or v_current_engine<>v_proposal.finance_engine then
    raise exception 'AI Finance context changed' using errcode='42501';
  end if;

  update public.ai_action_proposals
  set status='executing',approved_by=p_user_id,approved_at=now()
  where business_id=p_business_id
    and id=p_proposal_id
    and status='proposed';

  if not found then
    raise exception 'AI proposal already claimed' using errcode='42501';
  end if;

  return query
    select v_proposal.id,v_proposal.action_type,v_proposal.payload,
      v_proposal.request_id,v_proposal.correlation_id,
      v_proposal.finance_engine,v_proposal.execution_mode;
end;
$$;

create or replace function public.ai_reject_action_proposal(
  p_business_id uuid,
  p_user_id uuid,
  p_proposal_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1
    from public.business_memberships m
    join public.businesses b on b.id=m.business_id
    where m.business_id=p_business_id
      and m.user_id=p_user_id
      and m.status='active'
      and m.role='owner'
      and b.status='active'
  ) then
    raise exception 'AI rejection unavailable' using errcode='42501';
  end if;

  update public.ai_action_proposals
  set status='rejected',approved_by=p_user_id,approved_at=now()
  where business_id=p_business_id
    and id=p_proposal_id
    and status='proposed'
    and expires_at>now();

  if not found then
    raise exception 'AI proposal is not pending' using errcode='42501';
  end if;

  return true;
end;
$$;

create or replace function public.ai_complete_action_proposal(
  p_business_id uuid,
  p_proposal_id uuid,
  p_status text,
  p_result_reference text default '',
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_status not in ('succeeded','failed') then
    raise exception 'Invalid AI proposal result' using errcode='22023';
  end if;

  update public.ai_action_proposals
  set status=p_status,
      result_reference=left(coalesce(p_result_reference,''),255),
      error_code=left(p_error_code,120),
      executed_at=now()
  where business_id=p_business_id
    and id=p_proposal_id
    and status='executing';

  if found then
    return;
  end if;

  if exists(
    select 1
    from public.ai_action_proposals p
    where p.business_id=p_business_id
      and p.id=p_proposal_id
      and p.status=p_status
  ) then
    return;
  end if;

  raise exception 'AI proposal completion unavailable' using errcode='42501';
end;
$$;

revoke all on function public.ai_consume_request(uuid,uuid)
from public,anon,authenticated;
revoke all on function public.ai_start_session(uuid,uuid,uuid,text,text,text)
from public,anon,authenticated;
revoke all on function public.ai_append_message(uuid,uuid,uuid,text,text,text,text)
from public,anon,authenticated;
revoke all on function public.ai_record_tool_run(
  uuid,uuid,uuid,text,text,uuid,text,jsonb,text,text,text,integer
) from public,anon,authenticated;
revoke all on function public.ai_create_action_proposal(
  uuid,uuid,uuid,uuid,text,jsonb,text,timestamptz,uuid,text,public.execution_mode
) from public,anon,authenticated;
revoke all on function public.ai_claim_action_proposal(uuid,uuid,uuid,text)
from public,anon,authenticated;
revoke all on function public.ai_reject_action_proposal(uuid,uuid,uuid)
from public,anon,authenticated;
revoke all on function public.ai_complete_action_proposal(uuid,uuid,text,text,text)
from public,anon,authenticated;

grant execute on function public.ai_consume_request(uuid,uuid)
to codeedge_ai_api;
grant execute on function public.ai_start_session(uuid,uuid,uuid,text,text,text)
to codeedge_ai_api;
grant execute on function public.ai_append_message(uuid,uuid,uuid,text,text,text,text)
to codeedge_ai_api;
grant execute on function public.ai_record_tool_run(
  uuid,uuid,uuid,text,text,uuid,text,jsonb,text,text,text,integer
) to codeedge_ai_api;
grant execute on function public.ai_create_action_proposal(
  uuid,uuid,uuid,uuid,text,jsonb,text,timestamptz,uuid,text,public.execution_mode
) to codeedge_ai_api;
grant execute on function public.ai_claim_action_proposal(uuid,uuid,uuid,text)
to codeedge_ai_api;
grant execute on function public.ai_reject_action_proposal(uuid,uuid,uuid)
to codeedge_ai_api;
grant execute on function public.ai_complete_action_proposal(uuid,uuid,text,text,text)
to codeedge_ai_api;
