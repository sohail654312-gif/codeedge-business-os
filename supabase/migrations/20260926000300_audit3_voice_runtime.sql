-- Audit 3 FUNC-002: connect authenticated Vapi tool calls to the canonical
-- Codeedge receptionist runtime through the restricted Voice capability role.

create or replace function private.voice_tool_call(
  p_connection_id uuid,
  p_provider_call_id text
)
returns public.voice_calls
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
begin
  select vc.*
  into v_call
  from public.voice_calls vc
  join public.channel_connections cc
    on cc.business_id = vc.business_id
   and cc.id = vc.channel_connection_id
  join public.businesses b
    on b.id = vc.business_id
  where cc.id = p_connection_id
    and cc.channel = 'voice'
    and cc.provider = 'vapi'
    and cc.enabled
    and b.status = 'active'
    and vc.provider = cc.provider
    and vc.provider_call_id = btrim(coalesce(p_provider_call_id, ''))
  limit 1;

  if not found then
    raise exception 'Voice call unavailable' using errcode = '42501';
  end if;

  return v_call;
end;
$$;

revoke all on function private.voice_tool_call(uuid,text)
  from public, anon, authenticated;

create or replace function private.voice_receptionist_tool_enabled(
  p_business_id uuid,
  p_tool text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.voice_receptionist_settings s
    where s.business_id = p_business_id
      and s.enabled
      and s.provider = 'vapi'
      and p_tool = any(s.allowed_tools)
  )
$$;

revoke all on function private.voice_receptionist_tool_enabled(uuid,text)
  from public, anon, authenticated;

create or replace function public.voice_receptionist_runtime_context(
  p_connection_id uuid,
  p_provider_call_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
  v_business public.businesses%rowtype;
  v_settings public.voice_receptionist_settings%rowtype;
begin
  v_call := private.voice_tool_call(p_connection_id, p_provider_call_id);

  select b.* into v_business
  from public.businesses b
  where b.id = v_call.business_id
  limit 1;

  select s.* into v_settings
  from public.voice_receptionist_settings s
  where s.business_id = v_call.business_id
    and s.enabled
    and s.provider = 'vapi'
  limit 1;

  if not found then
    raise exception 'AI Receptionist unavailable' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'businessId', v_business.id,
    'businessName', v_business.name,
    'timezone', v_business.timezone,
    'voiceCallId', v_call.id,
    'conversationId', v_call.conversation_id,
    'leadId', v_call.lead_id,
    'customerId', v_call.customer_id,
    'greeting', v_settings.greeting,
    'preferredLanguage', v_settings.preferred_language,
    'additionalInstructions', v_settings.additional_instructions,
    'allowedTools', to_jsonb(v_settings.allowed_tools),
    'knowledge', jsonb_build_object(
      'profile', coalesce((
        select to_jsonb(bp) - 'business_id' - 'created_at' - 'updated_at'
        from public.business_profiles bp
        where bp.business_id = v_business.id
      ), '{}'::jsonb),
      'services', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'description', s.description,
            'starting_price_pence', s.starting_price_pence,
            'quote_required', s.quote_required,
            'duration_minutes', s.duration_minutes
          )
          order by s.display_order, s.name
        )
        from public.services s
        where s.business_id = v_business.id and s.active
      ), '[]'::jsonb),
      'serviceAreas', coalesce((
        select jsonb_agg(
          jsonb_build_object('name', a.name, 'postcode', a.postcode, 'notes', a.notes)
          order by a.display_order, a.name
        )
        from public.service_areas a
        where a.business_id = v_business.id and a.active
      ), '[]'::jsonb),
      'openingHours', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'weekday', h.weekday,
            'is_closed', h.is_closed,
            'opens_at', h.opens_at,
            'closes_at', h.closes_at
          )
          order by h.weekday
        )
        from public.opening_hours h
        where h.business_id = v_business.id
      ), '[]'::jsonb),
      'faqs', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', f.id, 'question', f.question, 'answer', f.answer)
          order by f.display_order, f.id
        )
        from public.business_faqs f
        where f.business_id = v_business.id and f.is_active
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.voice_receptionist_availability_snapshot(
  p_connection_id uuid,
  p_provider_call_id text,
  p_service_id uuid,
  p_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
  v_timezone text;
  v_duration integer;
  v_weekday integer;
  v_start timestamptz;
  v_end timestamptz;
  v_hours jsonb;
begin
  v_call := private.voice_tool_call(p_connection_id, p_provider_call_id);

  if not private.voice_receptionist_tool_enabled(
    v_call.business_id, 'appointment_availability'
  ) then
    raise exception 'AI Receptionist tool unavailable' using errcode = '42501';
  end if;

  select b.timezone into v_timezone
  from public.businesses b
  where b.id = v_call.business_id and b.status = 'active';

  select s.duration_minutes into v_duration
  from public.services s
  where s.business_id = v_call.business_id
    and s.id = p_service_id
    and s.active;

  if v_timezone is null or v_duration is null then
    raise exception 'Service unavailable' using errcode = '42501';
  end if;

  v_weekday := extract(isodow from p_date)::integer;
  v_start := p_date::timestamp at time zone v_timezone;
  v_end := (p_date + 1)::timestamp at time zone v_timezone;

  select jsonb_build_object(
    'weekday', h.weekday,
    'is_closed', h.is_closed,
    'opens_at', h.opens_at,
    'closes_at', h.closes_at
  )
  into v_hours
  from public.opening_hours h
  where h.business_id = v_call.business_id
    and h.weekday = v_weekday;

  return jsonb_build_object(
    'timezone', v_timezone,
    'durationMinutes', v_duration,
    'openingHours', v_hours,
    'appointments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'starts_at', a.starts_at,
          'ends_at', a.ends_at,
          'status', a.status
        )
        order by a.starts_at, a.id
      )
      from public.appointments a
      where a.business_id = v_call.business_id
        and a.starts_at < v_end
        and a.ends_at > v_start
        and a.status in ('pending','confirmed')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.voice_receptionist_get_appointment(
  p_connection_id uuid,
  p_provider_call_id text,
  p_appointment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
  v_result jsonb;
begin
  v_call := private.voice_tool_call(p_connection_id, p_provider_call_id);

  if not private.voice_receptionist_tool_enabled(
    v_call.business_id, 'get_appointment'
  ) then
    raise exception 'AI Receptionist tool unavailable' using errcode = '42501';
  end if;

  select to_jsonb(a)
  into v_result
  from public.appointments a
  where a.id = p_appointment_id
    and a.business_id = v_call.business_id
    and (
      (v_call.customer_id is not null and a.customer_id = v_call.customer_id)
      or (v_call.lead_id is not null and a.lead_id = v_call.lead_id)
    )
  limit 1;

  if v_result is null then
    raise exception 'Appointment unavailable' using errcode = '42501';
  end if;

  return v_result;
end;
$$;

create or replace function public.voice_receptionist_create_appointment(
  p_connection_id uuid,
  p_provider_call_id text,
  p_service_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_starts_at timestamptz,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
  v_timezone text;
  v_duration integer;
  v_ends_at timestamptz;
  v_id uuid;
begin
  v_call := private.voice_tool_call(p_connection_id, p_provider_call_id);

  if not private.voice_receptionist_tool_enabled(
    v_call.business_id, 'create_appointment'
  ) then
    raise exception 'AI Receptionist tool unavailable' using errcode = '42501';
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
     or (
       btrim(coalesce(p_contact_email, '')) <> ''
       and lower(btrim(p_contact_email))
         !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ) then
    raise exception 'Invalid appointment details' using errcode = '22023';
  end if;

  select b.timezone, s.duration_minutes
  into v_timezone, v_duration
  from public.businesses b
  join public.services s on s.business_id = b.id
  where b.id = v_call.business_id
    and b.status = 'active'
    and s.id = p_service_id
    and s.active
  limit 1;

  if not found then
    raise exception 'Service unavailable' using errcode = '42501';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  perform pg_advisory_xact_lock(hashtextextended(v_call.business_id::text, 0));
  perform private.booking_assert_slot(
    v_call.business_id, p_service_id, p_starts_at, v_ends_at, null
  );

  insert into public.appointments(
    business_id, lead_id, customer_id, service_id,
    contact_name, contact_email, contact_phone,
    starts_at, ends_at, timezone, status, source, notes, created_by
  ) values (
    v_call.business_id, v_call.lead_id, v_call.customer_id, p_service_id,
    btrim(p_contact_name),
    lower(btrim(coalesce(p_contact_email, ''))),
    btrim(coalesce(p_contact_phone, '')),
    p_starts_at, v_ends_at, v_timezone,
    'pending', 'voice', btrim(coalesce(p_notes, '')), null
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.voice_receptionist_reschedule_appointment(
  p_connection_id uuid,
  p_provider_call_id text,
  p_appointment_id uuid,
  p_starts_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
  v_appointment public.appointments%rowtype;
  v_duration integer;
  v_ends_at timestamptz;
begin
  v_call := private.voice_tool_call(p_connection_id, p_provider_call_id);

  if not private.voice_receptionist_tool_enabled(
    v_call.business_id, 'reschedule_appointment'
  ) then
    raise exception 'AI Receptionist tool unavailable' using errcode = '42501';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.id = p_appointment_id
    and a.business_id = v_call.business_id
    and a.status in ('pending','confirmed')
    and (
      (v_call.customer_id is not null and a.customer_id = v_call.customer_id)
      or (v_call.lead_id is not null and a.lead_id = v_call.lead_id)
    )
  limit 1;

  if not found or v_appointment.service_id is null then
    raise exception 'Appointment unavailable' using errcode = '42501';
  end if;

  select s.duration_minutes into v_duration
  from public.services s
  where s.business_id = v_call.business_id
    and s.id = v_appointment.service_id
    and s.active;

  if v_duration is null then
    raise exception 'Service unavailable' using errcode = '42501';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  perform pg_advisory_xact_lock(hashtextextended(v_call.business_id::text, 0));
  perform private.booking_assert_slot(
    v_call.business_id, v_appointment.service_id,
    p_starts_at, v_ends_at, v_appointment.id
  );

  update public.appointments
  set starts_at = p_starts_at, ends_at = v_ends_at
  where business_id = v_call.business_id and id = v_appointment.id;

  return found;
end;
$$;

create or replace function public.voice_receptionist_cancel_appointment(
  p_connection_id uuid,
  p_provider_call_id text,
  p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.voice_calls%rowtype;
  v_status public.appointment_status;
begin
  v_call := private.voice_tool_call(p_connection_id, p_provider_call_id);

  if not private.voice_receptionist_tool_enabled(
    v_call.business_id, 'cancel_appointment'
  ) then
    raise exception 'AI Receptionist tool unavailable' using errcode = '42501';
  end if;

  select a.status
  into v_status
  from public.appointments a
  where a.id = p_appointment_id
    and a.business_id = v_call.business_id
    and (
      (v_call.customer_id is not null and a.customer_id = v_call.customer_id)
      or (v_call.lead_id is not null and a.lead_id = v_call.lead_id)
    )
  limit 1
  for update;

  if not found then
    raise exception 'Appointment unavailable' using errcode = '42501';
  end if;

  if v_status = 'cancelled' then return false; end if;
  if v_status not in ('pending','confirmed') then
    raise exception 'Invalid appointment status transition' using errcode = '22023';
  end if;

  update public.appointments
  set status = 'cancelled'
  where business_id = v_call.business_id and id = p_appointment_id;

  return found;
end;
$$;

revoke all on function public.voice_receptionist_runtime_context(uuid,text)
  from public, anon, authenticated;
revoke all on function public.voice_receptionist_availability_snapshot(uuid,text,uuid,date)
  from public, anon, authenticated;
revoke all on function public.voice_receptionist_get_appointment(uuid,text,uuid)
  from public, anon, authenticated;
revoke all on function public.voice_receptionist_create_appointment(
  uuid,text,uuid,text,text,text,timestamptz,text
) from public, anon, authenticated;
revoke all on function public.voice_receptionist_reschedule_appointment(
  uuid,text,uuid,timestamptz
) from public, anon, authenticated;
revoke all on function public.voice_receptionist_cancel_appointment(uuid,text,uuid)
  from public, anon, authenticated;

grant execute on function public.voice_receptionist_runtime_context(uuid,text)
  to codeedge_voice_api;
grant execute on function public.voice_receptionist_availability_snapshot(uuid,text,uuid,date)
  to codeedge_voice_api;
grant execute on function public.voice_receptionist_get_appointment(uuid,text,uuid)
  to codeedge_voice_api;
grant execute on function public.voice_receptionist_create_appointment(
  uuid,text,uuid,text,text,text,timestamptz,text
) to codeedge_voice_api;
grant execute on function public.voice_receptionist_reschedule_appointment(
  uuid,text,uuid,timestamptz
) to codeedge_voice_api;
grant execute on function public.voice_receptionist_cancel_appointment(uuid,text,uuid)
  to codeedge_voice_api;

comment on function public.voice_receptionist_runtime_context(uuid,text) is
  'Restricted provider tool context derived from the authenticated Vapi connection and active call.';
