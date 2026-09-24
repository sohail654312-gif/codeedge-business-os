-- Append-oriented CRM activity history for Leads.
-- Events are written only by trusted database triggers, never directly by browser clients.

create type public.crm_activity_type as enum (
  'lead_created',
  'lead_edited',
  'lead_status_changed',
  'lead_note_added',
  'quote_request_created',
  'quote_request_status_changed',
  'lead_converted_to_customer'
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null,
  event_type public.crm_activity_type not null,
  description text not null check (
    char_length(description) between 1 and 240
  ),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at timestamptz not null default now(),
  constraint crm_activities_lead_same_tenant foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete cascade
);

create index crm_activities_business_lead_created
  on public.crm_activities(business_id, lead_id, created_at desc, id desc);
create index crm_activities_actor
  on public.crm_activities(actor_user_id)
  where actor_user_id is not null;

alter table public.crm_activities enable row level security;
alter table public.crm_activities force row level security;

revoke all on public.crm_activities from public, anon, authenticated;
grant select on public.crm_activities to authenticated;

create policy crm_activities_read on public.crm_activities
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create function private.append_crm_activity(
  p_business_id uuid,
  p_lead_id uuid,
  p_event_type public.crm_activity_type,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crm_activities(
    business_id,
    lead_id,
    event_type,
    description,
    actor_user_id,
    metadata
  ) values (
    p_business_id,
    p_lead_id,
    p_event_type,
    p_description,
    (select auth.uid()),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.append_crm_activity(
  uuid, uuid, public.crm_activity_type, text, jsonb
) from public, anon, authenticated;

create function private.crm_activity_from_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.append_crm_activity(
      new.business_id,
      new.id,
      'lead_created',
      'Lead created'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform private.append_crm_activity(
      new.business_id,
      new.id,
      'lead_status_changed',
      'Lead status changed from ' || initcap(replace(old.status::text, '_', ' ')) ||
      ' to ' || initcap(replace(new.status::text, '_', ' ')),
      jsonb_build_object(
        'from_status', old.status::text,
        'to_status', new.status::text
      )
    );
  end if;

  if row(
    old.contact_name,
    old.phone,
    old.email,
    old.source,
    old.service_id,
    old.enquiry_summary,
    old.estimated_value_pence,
    old.last_contact_at
  ) is distinct from row(
    new.contact_name,
    new.phone,
    new.email,
    new.source,
    new.service_id,
    new.enquiry_summary,
    new.estimated_value_pence,
    new.last_contact_at
  ) then
    perform private.append_crm_activity(
      new.business_id,
      new.id,
      'lead_edited',
      'Lead details edited'
    );
  end if;

  return new;
end;
$$;

create trigger crm_activity_leads
after insert or update on public.leads
for each row execute function private.crm_activity_from_lead();

create function private.crm_activity_from_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.append_crm_activity(
    new.business_id,
    new.lead_id,
    'lead_note_added',
    'Internal note added'
  );
  return new;
end;
$$;

create trigger crm_activity_lead_notes
after insert on public.lead_notes
for each row execute function private.crm_activity_from_note();

create function private.crm_activity_from_quote_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'quote_request_created',
      'Quote Request created',
      jsonb_build_object('status', new.status::text)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'quote_request_status_changed',
      'Quote Request status changed from ' ||
      initcap(replace(old.status::text, '_', ' ')) ||
      ' to ' ||
      initcap(replace(new.status::text, '_', ' ')),
      jsonb_build_object(
        'from_status', old.status::text,
        'to_status', new.status::text
      )
    );
  end if;

  return new;
end;
$$;

create trigger crm_activity_quote_requests
after insert or update on public.quote_requests
for each row execute function private.crm_activity_from_quote_request();

create function private.crm_activity_from_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.append_crm_activity(
    new.business_id,
    new.source_lead_id,
    'lead_converted_to_customer',
    'Lead converted to Customer',
    jsonb_build_object('customer_id', new.id)
  );
  return new;
end;
$$;

create trigger crm_activity_customers
after insert on public.customers
for each row execute function private.crm_activity_from_customer();

revoke all on function private.crm_activity_from_lead() from public, anon, authenticated;
revoke all on function private.crm_activity_from_note() from public, anon, authenticated;
revoke all on function private.crm_activity_from_quote_request() from public, anon, authenticated;
revoke all on function private.crm_activity_from_customer() from public, anon, authenticated;
