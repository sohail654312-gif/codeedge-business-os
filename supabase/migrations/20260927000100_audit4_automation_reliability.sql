-- Audit 4 reliability hardening for Automation.
-- Correlation budgets are database-enforced so concurrent workers cannot
-- bypass the guard.

create table private.automation_correlation_budgets (
  business_id uuid not null references public.businesses(id) on delete cascade,
  correlation_id uuid not null,
  event_count integer not null default 0 check (event_count between 0 and 32),
  external_effect_count integer not null default 0
    check (external_effect_count between 0 and 16),
  updated_at timestamptz not null default now(),
  primary key (business_id,correlation_id)
);

revoke all on private.automation_correlation_budgets
from public,anon,authenticated;

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
  v_correlation_id uuid := coalesce(
    nullif(current_setting('codeedge.automation_correlation_id',true),'')::uuid,
    gen_random_uuid()
  );
  v_causation_id uuid :=
    nullif(current_setting('codeedge.automation_causation_id',true),'')::uuid;
  v_depth integer := 0;
  v_event_count integer;
begin
  if p_business_id is null or p_subject_id is null then
    raise exception 'Automation event identity is required.';
  end if;

  if v_causation_id is not null then
    if not exists(
      select 1
      from public.automation_domain_events e
      where e.business_id=p_business_id and e.id=v_causation_id
    ) then
      raise exception 'automation_causation_unavailable' using errcode='42501';
    end if;

    with recursive chain as (
      select e.id,e.causation_id,1 as depth
      from public.automation_domain_events e
      where e.business_id=p_business_id and e.id=v_causation_id
      union all
      select parent.id,parent.causation_id,chain.depth+1
      from public.automation_domain_events parent
      join chain on parent.id=chain.causation_id
      where parent.business_id=p_business_id and chain.depth < 8
    )
    select coalesce(max(depth),0) into v_depth from chain;

    if v_depth >= 8 then
      raise exception 'automation_correlation_depth_exceeded'
        using errcode='54000';
    end if;
  end if;

  insert into private.automation_correlation_budgets(
    business_id,correlation_id,event_count,external_effect_count,updated_at
  ) values (
    p_business_id,v_correlation_id,1,0,now()
  )
  on conflict (business_id,correlation_id) do update
  set event_count=private.automation_correlation_budgets.event_count+1,
      updated_at=now()
  where private.automation_correlation_budgets.event_count < 32
  returning event_count into v_event_count;

  if v_event_count is null then
    raise exception 'automation_correlation_event_budget_exceeded'
      using errcode='54000';
  end if;

  insert into public.automation_domain_events(
    business_id,event_type,subject_type,subject_id,
    correlation_id,causation_id,payload
  ) values (
    p_business_id,p_event_type,p_subject_type,p_subject_id,
    v_correlation_id,v_causation_id,coalesce(p_payload,'{}'::jsonb)
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.automation_claim_external_effect_budget(
  p_run_id uuid
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
  v_correlation_id uuid;
  v_count integer;
begin
  select r.business_id,r.correlation_id
  into v_business_id,v_correlation_id
  from public.automation_runs r
  where r.id=p_run_id and r.status='running'
  for update;

  if not found then
    raise exception 'automation_run_unavailable' using errcode='42501';
  end if;

  insert into private.automation_correlation_budgets(
    business_id,correlation_id,event_count,external_effect_count,updated_at
  ) values (
    v_business_id,v_correlation_id,0,0,now()
  )
  on conflict (business_id,correlation_id) do nothing;

  update private.automation_correlation_budgets b
  set external_effect_count=b.external_effect_count+1,
      updated_at=now()
  where b.business_id=v_business_id
    and b.correlation_id=v_correlation_id
    and b.external_effect_count < 16
  returning external_effect_count into v_count;

  if v_count is null then
    raise exception 'automation_external_effect_budget_exceeded'
      using errcode='54000';
  end if;

  return v_count;
end;
$$;

create or replace function public.automation_runtime_health()
returns table(
  pending_count bigint,
  running_count bigint,
  stale_running_count bigint,
  oldest_pending_age_seconds integer,
  last_started_at text,
  last_completed_at text
)
language sql
security definer
set search_path=''
as $$
  select
    count(*) filter (where r.status='pending')::bigint,
    count(*) filter (where r.status='running')::bigint,
    count(*) filter (
      where r.status='running'
        and r.started_at < now()-interval '10 minutes'
    )::bigint,
    coalesce(
      floor(extract(epoch from (
        now()-min(r.created_at) filter (where r.status='pending')
      )))::integer,
      0
    ),
    max(r.started_at)::text,
    max(r.completed_at)::text
  from public.automation_runs r;
$$;

revoke all on function public.automation_claim_external_effect_budget(uuid)
from public,anon,authenticated;
revoke all on function public.automation_runtime_health()
from public,anon,authenticated;

grant execute on function public.automation_claim_external_effect_budget(uuid)
to codeedge_automation_api;
grant execute on function public.automation_runtime_health()
to codeedge_automation_api;
