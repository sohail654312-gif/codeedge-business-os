-- Codeedge Money / Finance Core.
-- Codeedge owns the Finance domain and UX. The selected Finance Engine owns
-- accounting execution. This migration does not create a second production ledger.

alter table public.automation_workflows
  drop constraint if exists automation_workflows_trigger_type_check;

alter table public.automation_workflows
  add constraint automation_workflows_trigger_type_check check (trigger_type in (
    'lead.created','lead.status_changed',
    'conversation.created','message.received',
    'appointment.created','appointment.confirmed',
    'appointment.rescheduled','appointment.cancelled',
    'voice.call.completed','voice.call.failed','voice.handoff.requested',
    'finance.quote.created','finance.invoice.created',
    'finance.payment.recorded','finance.bill.created','finance.expense.created'
  ));

create table public.finance_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  engine text not null check (engine in ('demo_finance','erpnext')),
  enabled boolean not null default true,
  external_account_id text not null default '' check (char_length(external_account_id) <= 255),
  credential_key text not null default '' check (char_length(credential_key) <= 120),
  credential_environment public.credential_environment,
  default_currency text not null check (default_currency ~ '^[A-Z]{3}$'),
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  check (
    (engine='demo_finance' and credential_key='' and credential_environment is null)
    or
    (engine<>'demo_finance' and credential_key<>'' and credential_environment is not null)
  )
);

create unique index finance_connections_one_enabled
  on public.finance_connections(business_id)
  where enabled;

create table public.finance_customer_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  finance_connection_id uuid not null,
  crm_customer_id uuid not null,
  engine text not null check (engine in ('demo_finance','erpnext')),
  engine_customer_ref text not null check (
    char_length(btrim(engine_customer_ref)) between 1 and 255
  ),
  created_at timestamptz not null default now(),
  constraint finance_customer_mapping_connection_same_tenant
    foreign key (business_id,finance_connection_id)
    references public.finance_connections(business_id,id) on delete cascade,
  constraint finance_customer_mapping_crm_same_tenant
    foreign key (business_id,crm_customer_id)
    references public.customers(business_id,id) on delete cascade,
  unique (business_id,crm_customer_id,engine),
  unique (business_id,engine,engine_customer_ref)
);

create type public.finance_execution_status as enum (
  'prepared','succeeded','failed','ambiguous','simulated'
);

create table public.finance_execution_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  finance_connection_id uuid,
  actor_user_id uuid references auth.users(id),
  engine text not null check (engine in ('demo_finance','erpnext')),
  operation text not null check (char_length(operation) between 1 and 120),
  document_type text not null default '' check (char_length(document_type) <= 80),
  codeedge_reference text not null default '' check (char_length(codeedge_reference) <= 255),
  external_reference text not null default '' check (char_length(external_reference) <= 255),
  execution_mode public.execution_mode not null,
  credential_environment public.credential_environment,
  correlation_id uuid not null,
  request_id uuid not null,
  status public.finance_execution_status not null,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint finance_execution_connection_same_tenant
    foreign key (business_id,finance_connection_id)
    references public.finance_connections(business_id,id) on delete restrict,
  unique (business_id,request_id)
);

create index finance_execution_records_business_created
  on public.finance_execution_records(business_id,created_at desc,id desc);

create table public.demo_finance_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_type text not null check (document_type in (
    'customer','supplier','quote','invoice','payment','bill','expense'
  )),
  request_id uuid not null,
  crm_customer_id uuid,
  linked_document_id uuid,
  name text not null default '' check (char_length(name) <= 200),
  email text not null default '' check (char_length(email) <= 320),
  phone text not null default '' check (char_length(phone) <= 80),
  status text not null default '' check (char_length(status) <= 80),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(20,2) not null default 0,
  outstanding numeric(20,2) not null default 0,
  category text not null default '' check (char_length(category) <= 120),
  valid_until timestamptz,
  due_at timestamptz,
  incurred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id,id),
  unique (business_id,request_id),
  constraint demo_finance_crm_customer_same_tenant
    foreign key (business_id,crm_customer_id)
    references public.customers(business_id,id) on delete set null (crm_customer_id),
  constraint demo_finance_link_same_tenant
    foreign key (business_id,linked_document_id)
    references public.demo_finance_documents(business_id,id) on delete restrict
);

create index demo_finance_documents_business_type
  on public.demo_finance_documents(business_id,document_type,created_at desc,id desc);

alter table public.finance_connections enable row level security;
alter table public.finance_connections force row level security;
alter table public.finance_customer_mappings enable row level security;
alter table public.finance_customer_mappings force row level security;
alter table public.finance_execution_records enable row level security;
alter table public.finance_execution_records force row level security;
alter table public.demo_finance_documents enable row level security;
alter table public.demo_finance_documents force row level security;

revoke all on public.finance_connections,
  public.finance_customer_mappings,
  public.finance_execution_records,
  public.demo_finance_documents
from public,anon,authenticated;

grant select on public.finance_connections,
  public.finance_customer_mappings,
  public.finance_execution_records
to authenticated;

grant insert,update,delete on public.finance_connections
to authenticated;

create policy finance_connections_read on public.finance_connections
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

create policy finance_connections_owner_insert on public.finance_connections
for insert to authenticated with check (
  private.has_business_role(
    business_id,array['owner']::public.business_role[]
  )
);

create policy finance_connections_owner_update on public.finance_connections
for update to authenticated using (
  private.has_business_role(
    business_id,array['owner']::public.business_role[]
  )
) with check (
  private.has_business_role(
    business_id,array['owner']::public.business_role[]
  )
);

create policy finance_connections_owner_delete on public.finance_connections
for delete to authenticated using (
  private.has_business_role(
    business_id,array['owner']::public.business_role[]
  )
);

create policy finance_customer_mappings_read on public.finance_customer_mappings
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

create policy finance_execution_records_read on public.finance_execution_records
for select to authenticated using (
  private.has_business_role(
    business_id,array['owner','staff']::public.business_role[]
  )
);

do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_finance_api') then
    create role codeedge_finance_api nologin noinherit nobypassrls;
  elsif exists(
    select 1
    from pg_roles
    where rolname='codeedge_finance_api'
      and (
        rolsuper or rolbypassrls or rolcanlogin or rolinherit or
        rolcreaterole or rolcreatedb or rolreplication
      )
  ) then
    raise exception 'Unsafe pre-existing finance role';
  end if;
end $$;

grant codeedge_finance_api to postgres;
grant usage on schema public, private to codeedge_finance_api;

create or replace function public.finance_configure_demo_connection(
  p_business_id uuid,
  p_user_id uuid,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid Finance currency' using errcode='22023';
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
      and b.execution_mode='demo'
  ) then
    raise exception 'Demo Finance configuration unavailable' using errcode='42501';
  end if;

  update public.finance_connections
  set enabled=false,updated_at=now()
  where business_id=p_business_id
    and enabled
    and engine<>'demo_finance';

  select id into v_id
  from public.finance_connections
  where business_id=p_business_id and engine='demo_finance'
  order by created_at asc,id
  limit 1
  for update;

  if v_id is null then
    insert into public.finance_connections(
      business_id,engine,enabled,external_account_id,credential_key,
      credential_environment,default_currency,provider_metadata
    ) values (
      p_business_id,'demo_finance',true,'','',null,p_currency,'{}'::jsonb
    )
    returning id into v_id;
  else
    update public.finance_connections
    set enabled=true,
        external_account_id='',
        credential_key='',
        credential_environment=null,
        default_currency=p_currency,
        provider_metadata='{}'::jsonb,
        updated_at=now()
    where id=v_id and business_id=p_business_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.finance_active_context(
  p_business_id uuid,
  p_user_id uuid
)
returns table(
  business_id uuid,
  execution_mode public.execution_mode,
  connection_id uuid,
  engine text,
  external_account_id text,
  credential_key text,
  credential_environment public.credential_environment,
  default_currency text
)
language plpgsql
stable
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
      and m.role in ('owner','staff')
      and b.status='active'
  ) then
    raise exception 'Finance unavailable' using errcode='42501';
  end if;

  return query
    select b.id,b.execution_mode,fc.id,fc.engine,
      fc.external_account_id,fc.credential_key,fc.credential_environment,
      fc.default_currency
    from public.businesses b
    join public.finance_connections fc
      on fc.business_id=b.id and fc.enabled
    where b.id=p_business_id and b.status='active'
    limit 1;

  if not found then
    raise exception 'Finance connection unavailable' using errcode='42501';
  end if;
end;
$$;

create or replace function public.finance_prepare_execution(
  p_business_id uuid,
  p_user_id uuid,
  p_operation text,
  p_document_type text,
  p_codeedge_reference text,
  p_correlation_id uuid,
  p_request_id uuid
)
returns table(
  execution_id uuid,
  connection_id uuid,
  engine text,
  execution_mode public.execution_mode,
  credential_environment public.credential_environment,
  status public.finance_execution_status,
  external_reference text,
  created boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_context record;
  v_existing public.finance_execution_records%rowtype;
  v_id uuid;
begin
  if p_correlation_id is null or p_request_id is null then
    raise exception 'Finance request identity required' using errcode='22023';
  end if;

  select * into v_context
  from public.finance_active_context(p_business_id,p_user_id);

  select * into v_existing
  from public.finance_execution_records
  where business_id=p_business_id and request_id=p_request_id
  limit 1;

  if found then
    return query
      select v_existing.id,
        v_existing.finance_connection_id,
        v_existing.engine,
        v_existing.execution_mode,
        v_existing.credential_environment,
        v_existing.status,
        v_existing.external_reference,
        false;
    return;
  end if;

  insert into public.finance_execution_records(
    business_id,finance_connection_id,actor_user_id,engine,operation,
    document_type,codeedge_reference,execution_mode,credential_environment,
    correlation_id,request_id,status
  ) values (
    p_business_id,v_context.connection_id,p_user_id,v_context.engine,p_operation,
    left(coalesce(p_document_type,''),80),
    left(coalesce(p_codeedge_reference,''),255),
    v_context.execution_mode,v_context.credential_environment,
    p_correlation_id,p_request_id,'prepared'
  )
  returning id into v_id;

  return query
    select v_id,
      v_context.connection_id,
      v_context.engine,
      v_context.execution_mode,
      v_context.credential_environment,
      'prepared'::public.finance_execution_status,
      ''::text,
      true;
end;
$$;

create or replace function public.finance_customer_for_business(
  p_business_id uuid,
  p_customer_id uuid
)
returns table(
  customer_id uuid,
  contact_name text,
  email text,
  phone text
)
language sql
stable
security definer
set search_path=''
as $$
  select c.id,c.contact_name,c.email,c.phone
  from public.customers c
  where c.business_id=p_business_id and c.id=p_customer_id
  limit 1
$$;

create or replace function public.finance_upsert_customer_mapping(
  p_business_id uuid,
  p_connection_id uuid,
  p_customer_id uuid,
  p_engine text,
  p_engine_customer_ref text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if p_engine_customer_ref is null
     or char_length(btrim(p_engine_customer_ref)) not between 1 and 255 then
    raise exception 'Finance customer reference invalid' using errcode='22023';
  end if;

  if not exists(
    select 1 from public.finance_connections fc
    where fc.business_id=p_business_id
      and fc.id=p_connection_id
      and fc.engine=p_engine
      and fc.enabled
  ) then
    raise exception 'Finance connection unavailable' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.customers c
    where c.business_id=p_business_id and c.id=p_customer_id
  ) then
    raise exception 'CRM Customer unavailable' using errcode='42501';
  end if;

  insert into public.finance_customer_mappings(
    business_id,finance_connection_id,crm_customer_id,engine,engine_customer_ref
  ) values (
    p_business_id,p_connection_id,p_customer_id,p_engine,btrim(p_engine_customer_ref)
  )
  on conflict (business_id,crm_customer_id,engine) do update
  set finance_connection_id=excluded.finance_connection_id,
      engine_customer_ref=excluded.engine_customer_ref
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.finance_external_effect_context(
  p_execution_id uuid
)
returns table(
  business_id uuid,
  execution_mode public.execution_mode,
  prepared_execution_mode public.execution_mode,
  engine text,
  credential_environment public.credential_environment,
  prepared_credential_environment public.credential_environment,
  correlation_id uuid,
  simulated boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  return query
    select r.business_id,
      b.execution_mode,
      r.execution_mode,
      r.engine,
      fc.credential_environment,
      r.credential_environment,
      r.correlation_id,
      false
    from public.finance_execution_records r
    join public.businesses b on b.id=r.business_id
    join public.finance_connections fc
      on fc.business_id=r.business_id
      and fc.id=r.finance_connection_id
      and fc.engine=r.engine
      and fc.enabled
    where r.id=p_execution_id
      and r.status='prepared'
      and r.engine<>'demo_finance'
      and b.status='active'
      and fc.credential_environment is not null
      and r.credential_environment is not null
    limit 1;

  if not found then
    raise exception 'Finance execution context unavailable' using errcode='42501';
  end if;
end;
$$;

create or replace function public.finance_complete_execution(
  p_execution_id uuid,
  p_status public.finance_execution_status,
  p_external_reference text default '',
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.finance_execution_records%rowtype;
  v_event_type text;
begin
  if p_status not in ('succeeded','failed','ambiguous','simulated') then
    raise exception 'Invalid Finance execution status';
  end if;

  update public.finance_execution_records
  set status=p_status,
      external_reference=left(coalesce(p_external_reference,''),255),
      error_code=p_error_code,
      completed_at=now()
  where id=p_execution_id and status='prepared'
  returning * into v_row;

  if not found then
    raise exception 'Finance execution unavailable';
  end if;

  if p_status in ('succeeded','simulated') then
    v_event_type := case v_row.operation
      when 'finance.quote.create' then 'finance.quote.created'
      when 'finance.invoice.create' then 'finance.invoice.created'
      when 'finance.payment.record' then 'finance.payment.recorded'
      when 'finance.bill.create' then 'finance.bill.created'
      when 'finance.expense.create' then 'finance.expense.created'
      else null
    end;

    if v_event_type is not null then
      perform set_config(
        'codeedge.automation_correlation_id',
        v_row.correlation_id::text,
        true
      );
      perform private.automation_enqueue(
        v_row.business_id,
        v_event_type,
        'finance_execution',
        v_row.id,
        jsonb_build_object(
          'finance',jsonb_build_object(
            'execution_id',v_row.id,
            'operation',v_row.operation,
            'document_type',v_row.document_type,
            'codeedge_reference',v_row.codeedge_reference,
            'external_reference',left(coalesce(p_external_reference,''),255),
            'engine',v_row.engine,
            'execution_mode',v_row.execution_mode,
            'status',p_status
          )
        )
      );
    end if;
  end if;
end;
$$;

create or replace function public.finance_demo_assert_business(
  p_business_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1
    from public.businesses b
    join public.finance_connections fc
      on fc.business_id=b.id
      and fc.engine='demo_finance'
      and fc.enabled
    where b.id=p_business_id
      and b.status='active'
      and b.execution_mode='demo'
  ) then
    raise exception 'Demo Finance unavailable' using errcode='42501';
  end if;
end;
$$;

create or replace function public.finance_demo_upsert_document(
  p_business_id uuid,
  p_document_type text,
  p_request_id uuid,
  p_crm_customer_id uuid,
  p_linked_document_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_status text,
  p_currency text,
  p_amount numeric,
  p_outstanding numeric,
  p_category text,
  p_valid_until timestamptz,
  p_due_at timestamptz,
  p_incurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  perform public.finance_demo_assert_business(p_business_id);

  insert into public.demo_finance_documents(
    business_id,document_type,request_id,crm_customer_id,linked_document_id,
    name,email,phone,status,currency,amount,outstanding,category,
    valid_until,due_at,incurred_at
  ) values (
    p_business_id,p_document_type,p_request_id,p_crm_customer_id,p_linked_document_id,
    left(coalesce(p_name,''),200),left(coalesce(p_email,''),320),
    left(coalesce(p_phone,''),80),left(coalesce(p_status,''),80),
    p_currency,p_amount,p_outstanding,left(coalesce(p_category,''),120),
    p_valid_until,p_due_at,p_incurred_at
  )
  on conflict (business_id,request_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.demo_finance_documents
    where business_id=p_business_id and request_id=p_request_id
    limit 1;
  end if;

  return v_id;
end;
$$;

create or replace function public.finance_demo_list_documents(
  p_business_id uuid,
  p_document_type text
)
returns setof public.demo_finance_documents
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform public.finance_demo_assert_business(p_business_id);

  return query
    select d.*
    from public.demo_finance_documents d
    where d.business_id=p_business_id
      and d.document_type=p_document_type
    order by d.created_at desc,d.id desc;
end;
$$;

create or replace function public.finance_demo_update_invoice(
  p_business_id uuid,
  p_invoice_id uuid,
  p_payment_request_id uuid,
  p_outstanding numeric,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.finance_demo_assert_business(p_business_id);

  if p_status not in ('issued','partially_paid','paid') or p_outstanding < 0 then
    raise exception 'Invalid Demo Finance invoice update' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.demo_finance_documents p
    where p.business_id=p_business_id
      and p.document_type='payment'
      and p.request_id=p_payment_request_id
      and p.linked_document_id=p_invoice_id
  ) then
    raise exception 'Demo Finance payment unavailable' using errcode='42501';
  end if;

  update public.demo_finance_documents
  set outstanding=p_outstanding,status=p_status
  where business_id=p_business_id
    and id=p_invoice_id
    and document_type='invoice';

  if not found then
    raise exception 'Demo Finance invoice unavailable' using errcode='42501';
  end if;

  return p_invoice_id;
end;
$$;

revoke all on function public.finance_configure_demo_connection(uuid,uuid,text)
from public,anon,authenticated;
revoke all on function public.finance_active_context(uuid,uuid)
from public,anon,authenticated;
revoke all on function public.finance_prepare_execution(uuid,uuid,text,text,text,uuid,uuid)
from public,anon,authenticated;
revoke all on function public.finance_customer_for_business(uuid,uuid)
from public,anon,authenticated;
revoke all on function public.finance_upsert_customer_mapping(uuid,uuid,uuid,text,text)
from public,anon,authenticated;
revoke all on function public.finance_external_effect_context(uuid)
from public,anon,authenticated;
revoke all on function public.finance_complete_execution(
  uuid,public.finance_execution_status,text,text
) from public,anon,authenticated;
revoke all on function public.finance_demo_assert_business(uuid)
from public,anon,authenticated;
revoke all on function public.finance_demo_upsert_document(
  uuid,text,uuid,uuid,uuid,text,text,text,text,text,numeric,numeric,text,
  timestamptz,timestamptz,timestamptz
) from public,anon,authenticated;
revoke all on function public.finance_demo_list_documents(uuid,text)
from public,anon,authenticated;
revoke all on function public.finance_demo_update_invoice(uuid,uuid,uuid,numeric,text)
from public,anon,authenticated;

grant execute on function public.finance_configure_demo_connection(uuid,uuid,text)
to codeedge_finance_api;
grant execute on function public.finance_active_context(uuid,uuid)
to codeedge_finance_api;
grant execute on function public.finance_prepare_execution(uuid,uuid,text,text,text,uuid,uuid)
to codeedge_finance_api;
grant execute on function public.finance_customer_for_business(uuid,uuid)
to codeedge_finance_api;
grant execute on function public.finance_upsert_customer_mapping(uuid,uuid,uuid,text,text)
to codeedge_finance_api;
grant execute on function public.finance_external_effect_context(uuid)
to codeedge_finance_api;
grant execute on function public.finance_complete_execution(
  uuid,public.finance_execution_status,text,text
) to codeedge_finance_api;
grant execute on function public.finance_demo_assert_business(uuid)
to codeedge_finance_api;
grant execute on function public.finance_demo_upsert_document(
  uuid,text,uuid,uuid,uuid,text,text,text,text,text,numeric,numeric,text,
  timestamptz,timestamptz,timestamptz
) to codeedge_finance_api;
grant execute on function public.finance_demo_list_documents(uuid,text)
to codeedge_finance_api;
grant execute on function public.finance_demo_update_invoice(uuid,uuid,uuid,numeric,text)
to codeedge_finance_api;
