-- Automatically provision a brand-new isolated CodeEdge workspace for
-- supported Supabase Auth signups. This never grants access to an existing tenant.

create or replace function private.bootstrap_codeedge_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_id uuid;
  requested_name text;
  workspace_name text;
  workspace_slug text;
begin
  if coalesce(new.raw_user_meta_data ->> 'codeedge_signup', '') <> 'true' then
    return new;
  end if;

  requested_name := btrim(coalesce(new.raw_user_meta_data ->> 'business_name', ''));
  workspace_name := case
    when char_length(requested_name) between 2 and 120 then requested_name
    else 'My CodeEdge Business'
  end;

  workspace_slug := 'workspace-' || replace(new.id::text, '-', '');
  workspace_id := gen_random_uuid();

  insert into public.businesses(id, name, slug, timezone)
  values (workspace_id, workspace_name, workspace_slug, 'UTC');

  insert into public.business_memberships(business_id, user_id, role, status)
  values (workspace_id, new.id, 'owner', 'active');

  return new;
end;
$$;

revoke all on function private.bootstrap_codeedge_owner() from public, anon, authenticated;

drop trigger if exists codeedge_auth_user_created on auth.users;
create trigger codeedge_auth_user_created
after insert on auth.users
for each row execute function private.bootstrap_codeedge_owner();
