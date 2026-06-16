-- New-member inclusion policy: each group decides how members who join from
-- now on are added to its already-planned future rehearsals. MANDATORY (the
-- default) and OPTIONAL auto-insert a session_participants row for every
-- upcoming non-cancelled session; NONE leaves the newcomer out (instructors
-- can still summon them by hand via add_member_to_future_sessions).

create type member_inclusion_policy as enum ('MANDATORY', 'OPTIONAL', 'NONE');

alter table public.groups
  add column new_member_policy member_inclusion_policy not null default 'MANDATORY';

-- Auto-include a freshly joined member into the group's future sessions per
-- the group policy. SECURITY DEFINER: membership inserts run in many contexts
-- (join code, invitation accept) and none holds a blanket INSERT grant on
-- other users' session_participants rows. Inserting fires the existing
-- notify_participant_added trigger, so the member is summoned to confirmed
-- rehearsals. At group-creation time the creator's membership lands here too,
-- but there are no future sessions yet, so it is a no-op.
create or replace function public.auto_include_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  policy member_inclusion_policy;
begin
  select new_member_policy into policy from groups where id = new.group_id;
  if policy = 'NONE' then
    return new;
  end if;

  insert into session_participants (session_id, user_id, required)
  select s.id, new.user_id, policy = 'MANDATORY'
  from sessions s
  where s.group_id = new.group_id
    and s.status <> 'CANCELLED'
    and lower(s.time_range) > now()
  on conflict (session_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trg_auto_include_member
  after insert on memberships
  for each row execute function public.auto_include_member();

-- update_group_meta gains the policy; NULL keeps the current value so the
-- avatar autosave path can leave it untouched.
drop function if exists public.update_group_meta(uuid, text, text, text);

create or replace function public.update_group_meta(
  gid uuid, new_name text, new_seed text, new_image text default null,
  new_policy member_inclusion_policy default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  update groups
  set name = coalesce(nullif(trim(new_name), ''), name),
      avatar_seed = new_seed,
      avatar_image = new_image,
      new_member_policy = coalesce(new_policy, new_member_policy)
  where id = gid;
end;
$$;

revoke execute on function
  public.update_group_meta(uuid, text, text, text, member_inclusion_policy)
  from public, anon;
grant execute on function
  public.update_group_meta(uuid, text, text, text, member_inclusion_policy)
  to authenticated;
