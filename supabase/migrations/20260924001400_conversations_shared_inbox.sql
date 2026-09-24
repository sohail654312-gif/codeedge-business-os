-- Channel-independent Conversations + Shared Inbox core.
-- External delivery adapters are intentionally not implemented in this phase.

create type public.conversation_channel as enum (
  'website_chat',
  'whatsapp',
  'email',
  'sms',
  'voice',
  'internal'
);

create type public.conversation_status as enum (
  'open',
  'pending',
  'resolved',
  'closed'
);

create type public.message_sender_type as enum (
  'customer',
  'staff',
  'ai',
  'system'
);

create type public.message_direction as enum (
  'inbound',
  'outbound',
  'internal'
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid,
  customer_id uuid,
  channel public.conversation_channel not null default 'internal',
  status public.conversation_status not null default 'open',
  subject text not null default '' check (char_length(subject) <= 200),
  external_thread_id text check (
    external_thread_id is null or char_length(btrim(external_thread_id)) between 1 and 255
  ),
  assigned_user_id uuid,
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '' check (char_length(last_message_preview) <= 240),
  last_message_direction public.message_direction,
  last_message_sender_type public.message_sender_type,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  constraint conversations_lead_same_tenant foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete set null (lead_id),
  constraint conversations_customer_same_tenant foreign key (business_id, customer_id)
    references public.customers(business_id, id) on delete set null (customer_id),
  constraint conversations_assignee_same_tenant foreign key (business_id, assigned_user_id)
    references public.business_memberships(business_id, user_id) on delete set null (assigned_user_id)
);

create index conversations_business_last_message
  on public.conversations(business_id, last_message_at desc, id);
create index conversations_business_status_last_message
  on public.conversations(business_id, status, last_message_at desc, id);
create index conversations_business_channel_last_message
  on public.conversations(business_id, channel, last_message_at desc, id);
create index conversations_business_lead
  on public.conversations(business_id, lead_id)
  where lead_id is not null;
create index conversations_business_customer
  on public.conversations(business_id, customer_id)
  where customer_id is not null;
create unique index conversations_external_thread_unique
  on public.conversations(business_id, channel, external_thread_id)
  where external_thread_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null,
  sender_type public.message_sender_type not null,
  sender_user_id uuid references auth.users(id) on delete set null,
  direction public.message_direction not null,
  body text not null check (
    char_length(btrim(body)) between 1 and 4000
  ),
  channel_message_id text check (
    channel_message_id is null or char_length(btrim(channel_message_id)) between 1 and 255
  ),
  created_at timestamptz not null default clock_timestamp(),
  unique (business_id, id),
  constraint messages_conversation_same_tenant foreign key (business_id, conversation_id)
    references public.conversations(business_id, id) on delete cascade
);

create index messages_conversation_date
  on public.messages(business_id, conversation_id, created_at, id);
create unique index messages_channel_message_unique
  on public.messages(business_id, conversation_id, channel_message_id)
  where channel_message_id is not null;

create trigger conversations_updated
before update on public.conversations
for each row execute function private.touch_updated_at();

create function private.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = greatest(last_message_at, new.created_at),
      last_message_preview = left(regexp_replace(btrim(new.body), '[[:space:]]+', ' ', 'g'), 240),
      last_message_direction = new.direction,
      last_message_sender_type = new.sender_type,
      updated_at = now()
  where business_id = new.business_id
    and id = new.conversation_id;
  return new;
end;
$$;

revoke all on function private.touch_conversation_from_message()
  from public, anon, authenticated;

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function private.touch_conversation_from_message();

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;

revoke all on public.conversations, public.messages
  from public, anon, authenticated;

grant select on public.conversations, public.messages to authenticated;

-- Browser-authenticated users may create only local/internal threads.
-- Future external channel adapters should use a separately audited trusted path.
grant insert(
  business_id,
  lead_id,
  customer_id,
  channel,
  status,
  subject,
  created_by
) on public.conversations to authenticated;

-- Team members may only change workflow status in this phase.
grant update(status) on public.conversations to authenticated;

-- Browser-authenticated users may append staff-authored local/outbound text only.
-- Provider IDs and customer/AI/system identities remain unavailable to browser writes.
grant insert(
  business_id,
  conversation_id,
  sender_type,
  sender_user_id,
  direction,
  body
) on public.messages to authenticated;

create policy conversations_read on public.conversations
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy conversations_create_internal on public.conversations
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and channel = 'internal'
  and status = 'open'
  and external_thread_id is null
  and assigned_user_id is null
  and private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy conversations_status_update on public.conversations
for update to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
)
with check (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy messages_read on public.messages
for select to authenticated
using (
  private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);

create policy messages_create_staff on public.messages
for insert to authenticated
with check (
  sender_type = 'staff'
  and sender_user_id = (select auth.uid())
  and direction in ('outbound','internal')
  and channel_message_id is null
  and private.has_business_role(
    business_id,
    array['owner','staff']::public.business_role[]
  )
);
