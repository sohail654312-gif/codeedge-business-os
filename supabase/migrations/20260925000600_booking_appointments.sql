-- Codeedge-native Booking / Appointments core.
-- Internal appointments are the source of truth; external calendars are optional future rails.

alter table public.services
  add column duration_minutes integer not null default 30
    check (duration_minutes between 5 and 480);

grant insert(duration_minutes) on public.services to authenticated;
grant update(duration_minutes) on public.services to authenticated;

create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show'
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid,
  customer_id uuid,
  service_id uuid,
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 120),
  contact_email text not null default '' check (
    char_length(contact_email) <= 254 and
    (
      contact_email = ''
      or contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  contact_phone text not null default '' check (char_length(contact_phone) <= 40),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (char_length(btrim(timezone)) between 1 and 100),
  status public.appointment_status not null default 'pending',
  source text not null default 'staff'
    check (source in (
      'staff','website','whatsapp','email','sms','voice','automation','ai'
    )),
  notes text not null default '' check (char_length(notes) <= 3000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_valid_interval check (ends_at > starts_at),
  constraint appointments_contact_method check (
    contact_email <> '' or btrim(contact_phone) <> ''
  ),
  unique (business_id, id),
  constraint appointments_lead_same_tenant
    foreign key (business_id, lead_id)
    references public.leads(business_id, id)
    on delete set null (lead_id),
  constraint appointments_customer_same_tenant
    foreign key (business_id, customer_id)
    references public.customers(business_id, id)
    on delete set null (customer_id),
  constraint appointments_service_same_tenant
    foreign key (business_id, service_id)
    references public.services(business_id, id)
    on delete set null (service_id)
);

create index appointments_business_start
  on public.appointments(business_id, starts_at, id);
create index appointments_business_status_start
  on public.appointments(business_id, status, starts_at, id);
create index appointments_business_lead
  on public.appointments(business_id, lead_id, starts_at desc)
  where lead_id is not null;
create index appointments_business_customer
  on public.appointments(business_id, customer_id, starts_at desc)
  where customer_id is not null;
create index appointments_business_service
  on public.appointments(business_id, service_id, starts_at)
  where service_id is not null;

create trigger appointments_updated
before update on public.appointments
for each row execute function private.touch_updated_at();

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

revoke all on public.appointments from public, anon, authenticated;
grant select on public.appointments to authenticated;

create policy appointments_read_member on public.appointments
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create function private.booking_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','staff')
      and b.status = 'active'
  );
$$;

revoke all on function private.booking_member(uuid)
  from public, anon, authenticated;

create function private.booking_assert_slot(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_timezone text;
  local_start timestamp without time zone;
  local_end timestamp without time zone;
  hours_row public.opening_hours%rowtype;
  service_duration integer;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid appointment time' using errcode = '22023';
  end if;

  if p_starts_at <= clock_timestamp() then
    raise exception 'Appointment must be in the future' using errcode = '22023';
  end if;

  select b.timezone
  into business_timezone
  from public.businesses b
  where b.id = p_business_id
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;

  if p_service_id is not null then
    select s.duration_minutes
    into service_duration
    from public.services s
    where s.business_id = p_business_id
      and s.id = p_service_id
      and s.active
    limit 1;

    if not found then
      raise exception 'Service unavailable' using errcode = '42501';
    end if;

    if extract(epoch from (p_ends_at - p_starts_at))::integer
       <> service_duration * 60 then
      raise exception 'Appointment duration does not match Service'
        using errcode = '22023';
    end if;
  end if;

  local_start := p_starts_at at time zone business_timezone;
  local_end := p_ends_at at time zone business_timezone;

  if local_start::date <> local_end::date then
    raise exception 'Appointment must stay within one business day'
      using errcode = '22023';
  end if;

  select oh.*
  into hours_row
  from public.opening_hours oh
  where oh.business_id = p_business_id
    and oh.weekday = extract(isodow from local_start)::integer
  limit 1;

  if not found
     or hours_row.is_closed
     or local_start::time < hours_row.opens_at
     or local_end::time > hours_row.closes_at then
    raise exception 'Appointment is outside Opening Hours'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.business_id = p_business_id
      and a.status <> 'cancelled'
      and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.starts_at < p_ends_at
      and a.ends_at > p_starts_at
  ) then
    raise exception 'Appointment time is no longer available'
      using errcode = '23P01';
  end if;
end;
$$;

revoke all on function private.booking_assert_slot(
  uuid,uuid,timestamptz,timestamptz,uuid
) from public, anon, authenticated;

create function public.create_appointment(
  p_business_id uuid,
  p_lead_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_source text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_timezone text;
  effective_lead_id uuid := p_lead_id;
  customer_source_lead uuid;
  new_id uuid;
begin
  if not private.booking_member(p_business_id) then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;

  if p_contact_name is null
     or char_length(btrim(p_contact_name)) not between 1 and 120
     or char_length(coalesce(p_contact_email, '')) > 254
     or char_length(coalesce(p_contact_phone, '')) > 40
     or (
       btrim(coalesce(p_contact_email, '')) = ''
       and btrim(coalesce(p_contact_phone, '')) = ''
     )
     or char_length(coalesce(p_notes, '')) > 3000
     or p_source is null
     or p_source not in (
       'staff','website','whatsapp','email','sms','voice','automation','ai'
     ) then
    raise exception 'Invalid appointment details' using errcode = '22023';
  end if;

  if btrim(coalesce(p_contact_email, '')) <> ''
     and lower(btrim(p_contact_email))
       !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid appointment details' using errcode = '22023';
  end if;

  if p_lead_id is not null and not exists (
    select 1 from public.leads l
    where l.business_id = p_business_id and l.id = p_lead_id
  ) then
    raise exception 'Lead unavailable' using errcode = '42501';
  end if;

  if p_customer_id is not null then
    select c.source_lead_id
    into customer_source_lead
    from public.customers c
    where c.business_id = p_business_id and c.id = p_customer_id
    limit 1;

    if not found then
      raise exception 'Customer unavailable' using errcode = '42501';
    end if;

    if effective_lead_id is null then
      effective_lead_id := customer_source_lead;
    elsif customer_source_lead <> effective_lead_id then
      raise exception 'Customer and Lead relationship mismatch'
        using errcode = '42501';
    end if;
  end if;

  select b.timezone into business_timezone
  from public.businesses b
  where b.id = p_business_id and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;

  -- Serialize booking mutations per business. The conflict check below then
  -- remains race-safe even when two requests target the same free interval.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));

  perform private.booking_assert_slot(
    p_business_id,
    p_service_id,
    p_starts_at,
    p_ends_at,
    null
  );

  insert into public.appointments(
    business_id,
    lead_id,
    customer_id,
    service_id,
    contact_name,
    contact_email,
    contact_phone,
    starts_at,
    ends_at,
    timezone,
    status,
    source,
    notes,
    created_by
  ) values (
    p_business_id,
    effective_lead_id,
    p_customer_id,
    p_service_id,
    btrim(p_contact_name),
    lower(btrim(coalesce(p_contact_email, ''))),
    btrim(coalesce(p_contact_phone, '')),
    p_starts_at,
    p_ends_at,
    business_timezone,
    'pending',
    p_source,
    btrim(coalesce(p_notes, '')),
    (select auth.uid())
  )
  returning id into new_id;

  return new_id;
end;
$$;

create function public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  business_timezone text;
begin
  select a.*
  into appointment_row
  from public.appointments a
  where a.id = p_appointment_id
  limit 1;

  if not found or not private.booking_member(appointment_row.business_id) then
    raise exception 'Appointment unavailable' using errcode = '42501';
  end if;

  if appointment_row.status not in ('pending','confirmed') then
    raise exception 'Appointment cannot be rescheduled' using errcode = '22023';
  end if;

  select b.timezone
  into business_timezone
  from public.businesses b
  where b.id = appointment_row.business_id
    and b.status = 'active'
  limit 1;

  if not found then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(appointment_row.business_id::text, 0));

  perform private.booking_assert_slot(
    appointment_row.business_id,
    appointment_row.service_id,
    p_starts_at,
    p_ends_at,
    appointment_row.id
  );

  update public.appointments
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = business_timezone
  where business_id = appointment_row.business_id
    and id = appointment_row.id;

  return found;
end;
$$;

create function public.set_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
begin
  select a.*
  into appointment_row
  from public.appointments a
  where a.id = p_appointment_id
  limit 1
  for update;

  if not found or not private.booking_member(appointment_row.business_id) then
    raise exception 'Appointment unavailable' using errcode = '42501';
  end if;

  if p_status = appointment_row.status then
    return false;
  end if;

  if not (
    (appointment_row.status = 'pending' and p_status in ('confirmed','cancelled'))
    or
    (appointment_row.status = 'confirmed' and p_status in ('completed','cancelled','no_show'))
  ) then
    raise exception 'Invalid appointment status transition'
      using errcode = '22023';
  end if;

  update public.appointments
  set status = p_status
  where business_id = appointment_row.business_id
    and id = appointment_row.id;

  return found;
end;
$$;

revoke all on function public.create_appointment(
  uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text
) from public, anon;
revoke all on function public.reschedule_appointment(
  uuid,timestamptz,timestamptz
) from public, anon;
revoke all on function public.set_appointment_status(
  uuid,public.appointment_status
) from public, anon;

grant execute on function public.create_appointment(
  uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text
) to authenticated;
grant execute on function public.reschedule_appointment(
  uuid,timestamptz,timestamptz
) to authenticated;
grant execute on function public.set_appointment_status(
  uuid,public.appointment_status
) to authenticated;

create function private.crm_activity_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event public.crm_activity_type;
  description text;
begin
  if new.lead_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'appointment_created',
      'Appointment created',
      jsonb_build_object(
        'appointment_id', new.id,
        'starts_at', new.starts_at,
        'status', new.status::text
      )
    );
    return new;
  end if;

  if old.starts_at is distinct from new.starts_at
     or old.ends_at is distinct from new.ends_at then
    perform private.append_crm_activity(
      new.business_id,
      new.lead_id,
      'appointment_rescheduled',
      'Appointment rescheduled',
      jsonb_build_object(
        'appointment_id', new.id,
        'previous_starts_at', old.starts_at,
        'starts_at', new.starts_at
      )
    );
  end if;

  if old.status is distinct from new.status then
    event := case new.status
      when 'confirmed' then 'appointment_confirmed'::public.crm_activity_type
      when 'cancelled' then 'appointment_cancelled'::public.crm_activity_type
      when 'completed' then 'appointment_completed'::public.crm_activity_type
      when 'no_show' then 'appointment_no_show'::public.crm_activity_type
      else null
    end;

    description := case new.status
      when 'confirmed' then 'Appointment confirmed'
      when 'cancelled' then 'Appointment cancelled'
      when 'completed' then 'Appointment completed'
      when 'no_show' then 'Appointment marked no-show'
      else null
    end;

    if event is not null then
      perform private.append_crm_activity(
        new.business_id,
        new.lead_id,
        event,
        description,
        jsonb_build_object(
          'appointment_id', new.id,
          'starts_at', new.starts_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger crm_activity_appointments
after insert or update on public.appointments
for each row execute function private.crm_activity_from_appointment();

revoke all on function private.crm_activity_from_appointment()
  from public, anon, authenticated;

comment on table public.appointments is
  'Codeedge-native internal appointment source of truth. External calendar sync is optional and separate.';
comment on column public.appointments.timezone is
  'Business IANA timezone captured when the appointment is created.';
