-- New-member onboarding: when someone joins a group, every other member gets
-- a MEMBER_JOINED notification (instructors use it to summon the newcomer to
-- the already-planned sessions; the rest just learn who arrived). Email
-- delivery follows notification_preferences as usual — no row means BOTH, so
-- the email is on by default and the profile page offers the opt-out.

create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, group_id, type, payload)
  select m.user_id, new.group_id, 'MEMBER_JOINED',
    jsonb_build_object(
      'member_id', new.user_id,
      'member_name', coalesce(nullif(p.name, ''), p.email)
    )
  from memberships m
  cross join (select name, email from profiles where id = new.user_id) p
  where m.group_id = new.group_id
    and m.user_id <> new.user_id;
  return new;
end;
$$;

create trigger trg_notify_member_joined
  after insert on memberships
  for each row execute function public.notify_member_joined();

-- Summon a (new) member to a chosen set of upcoming sessions in one go.
-- SECURITY DEFINER because instructors have no blanket INSERT policy on other
-- users' session_participants rows; only instructors of the group (or
-- superadmin) may call it. Inserting into session_participants fires the
-- existing notify_participant_added trigger, so the member receives the
-- summons for already-confirmed sessions.
create or replace function public.add_member_to_future_sessions(
  gid uuid, uid uuid, req boolean, sids uuid[]
) returns integer language plpgsql security definer set search_path = public as $$
declare
  inserted integer;
begin
  if not (is_instructor(auth.uid(), gid) or is_superadmin(auth.uid())) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if not exists (select 1 from memberships where user_id = uid and group_id = gid) then
    raise exception 'NOT_A_MEMBER';
  end if;

  insert into session_participants (session_id, user_id, required)
  select s.id, uid, req
  from sessions s
  where s.group_id = gid
    and s.id = any (sids)
    and s.status <> 'CANCELLED'
    and lower(s.time_range) > now()
  on conflict (session_id, user_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
