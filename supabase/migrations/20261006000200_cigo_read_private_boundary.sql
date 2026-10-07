-- Forward-only hardening for staging databases that already applied cigo_read_v1.
-- Fresh databases may already create the function in codeedge_internal; this migration is idempotent.

create schema if not exists codeedge_internal;

revoke all on schema codeedge_internal
from public,anon,authenticated,codeedge_cigo_read_api;

grant usage on schema codeedge_internal to codeedge_cigo_read_api;

do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on schema codeedge_internal from service_role';
  end if;
end $$;

do $$ begin
  if to_regprocedure(
    'public.cigo_read_v1(text,text,uuid,text,integer,timestamp with time zone,text)'
  ) is not null
  and to_regprocedure(
    'codeedge_internal.cigo_read_v1(text,text,uuid,text,integer,timestamp with time zone,text)'
  ) is null then
    alter function public.cigo_read_v1(
      text,text,uuid,text,integer,timestamptz,text
    ) set schema codeedge_internal;
  end if;
end $$;

revoke all on function codeedge_internal.cigo_read_v1(
  text,text,uuid,text,integer,timestamptz,text
) from public,anon,authenticated;

do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on function codeedge_internal.cigo_read_v1(text,text,uuid,text,integer,timestamptz,text) from service_role';
  end if;
end $$;

revoke all on all tables in schema codeedge_internal
from public,anon,authenticated,codeedge_cigo_read_api;

do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on all tables in schema codeedge_internal from service_role';
  end if;
end $$;

grant execute on function codeedge_internal.cigo_read_v1(
  text,text,uuid,text,integer,timestamptz,text
) to codeedge_cigo_read_api;

comment on function codeedge_internal.cigo_read_v1(
  text,text,uuid,text,integer,timestamptz,text
) is 'Private versioned tenant-scoped read-only projection for Codeedge CIGO v1.';
