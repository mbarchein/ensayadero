-- ============================================================
-- Easy invitation: open signup + group code/link
--  - Anyone with Google can create an account (the email gate no
--    longer fits: anyone creates groups and joins via link/code).
--    Pending email invitations are still auto-accepted.
--  - groups.join_code: short reusable code → link + QR + code.
--  - RPCs join_by_code / regenerate_join_code.
-- ============================================================

-- ── Open signup (replaces the invitation gate) ──────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- accept pending email invitations → memberships
  insert into memberships (user_id, group_id, role)
  select new.id, i.group_id, i.role
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
    and i.expires_at > now()
  on conflict do nothing;

  update invitations
  set accepted_at = now()
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now();

  return new;
end;
$$;

-- ── Group code (reusable) ───────────────────────────────────
alter table public.groups
  add column if not exists join_code text unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  add column if not exists join_enabled boolean not null default true;

-- backfill existing groups without a code
update public.groups
set join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where join_code is null;

-- Join by code: adds the current user as ACTOR. SECURITY DEFINER
-- so the group can be read by code without exposing the whole table.
create or replace function public.join_by_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select id into gid from groups
    where upper(join_code) = upper(trim(code))
      and join_enabled
      and archived_at is null;
  if gid is null then raise exception 'INVALID_CODE'; end if;
  insert into memberships (user_id, group_id, role)
  values (auth.uid(), gid, 'ACTOR')
  on conflict do nothing;
  return gid;
end;
$$;

-- Regenerate code (group director only)
create or replace function public.regenerate_join_code(gid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  update groups set join_code = c where id = gid;
  return c;
end;
$$;

-- Enable/disable the code (director only)
create or replace function public.set_join_enabled(gid uuid, enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  update groups set join_enabled = enabled where id = gid;
end;
$$;

revoke execute on function public.join_by_code(text) from public, anon;
revoke execute on function public.regenerate_join_code(uuid) from public, anon;
revoke execute on function public.set_join_enabled(uuid, boolean) from public, anon;
grant execute on function public.join_by_code(text) to authenticated;
grant execute on function public.regenerate_join_code(uuid) to authenticated;
grant execute on function public.set_join_enabled(uuid, boolean) to authenticated;
