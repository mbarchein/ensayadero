-- ============================================================
-- Planner: busy times of a group's members (D1, without revealing source)
-- + Notifications: session triggers and pg_cron reminders
-- ============================================================

-- Busy times of all members of a group within a window.
-- Only group instructors may call it. Does not expose which session/group is busy.
create or replace function public.group_busy_ranges(gid uuid, search tstzrange)
returns table (user_id uuid, busy tstzrange)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) and not is_member(auth.uid(), gid) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select sp.user_id, s.time_range
  from sessions s
  join session_participants sp on sp.session_id = s.id
  join memberships m on m.user_id = sp.user_id and m.group_id = gid
  where s.status = 'CONFIRMED'
    and s.time_range && search;
end;
$$;

-- ============================================================
-- Automatic notifications on session changes
-- ============================================================

create or replace function public.notify_session_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ntype text;
begin
  -- INSERT created directly as confirmed
  if tg_op = 'INSERT' then
    if new.status = 'CONFIRMED' then
      ntype := 'SESSION_CONFIRMED';
    else
      return new;
    end if;
  else
    -- UPDATE: relevant transitions
    if old.status != 'CONFIRMED' and new.status = 'CONFIRMED' then
      ntype := 'SESSION_CONFIRMED';
    elsif old.status = 'CONFIRMED' and new.status = 'CANCELLED' then
      ntype := 'SESSION_CANCELLED';
    elsif new.status = 'CONFIRMED' and old.time_range != new.time_range then
      ntype := 'SESSION_CHANGED';
      -- time change → responses revert to pending
      update session_participants set response = 'PENDING' where session_id = new.id;
    else
      return new;
    end if;
  end if;

  insert into notifications (user_id, group_id, type, payload)
  select
    sp.user_id,
    new.group_id,
    ntype,
    jsonb_build_object(
      'session_id', new.id,
      'title', new.title,
      'location', new.location,
      'starts_at', lower(new.time_range),
      'ends_at', upper(new.time_range),
      'required', sp.required,
      'old_starts_at', case when ntype = 'SESSION_CHANGED' then lower(old.time_range) end
    )
  from session_participants sp
  where sp.session_id = new.id;

  return new;
end;
$$;

create trigger on_session_change
  after insert or update on public.sessions
  for each row execute function public.notify_session_change();

-- Participant added to an already confirmed session → notify them
create or replace function public.notify_participant_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from sessions s where s.id = new.session_id and s.status = 'CONFIRMED') then
    insert into notifications (user_id, group_id, type, payload)
    select new.user_id, s.group_id, 'SESSION_CONFIRMED',
      jsonb_build_object(
        'session_id', s.id, 'title', s.title, 'location', s.location,
        'starts_at', lower(s.time_range), 'ends_at', upper(s.time_range),
        'required', new.required
      )
    from sessions s where s.id = new.session_id;
  end if;
  return new;
end;
$$;

create trigger on_participant_added
  after insert on public.session_participants
  for each row execute function public.notify_participant_added();

-- ============================================================
-- Reminders: pg_cron job that generates REMINDER notifications
-- (email/push DELIVERY is handled by the Edge Function — the HTTP cron
--  is created manually, see BOOTSTRAP.md §11)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.generate_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- reminder 24h before (15 min window to avoid duplicates with the every-15-min run)
  insert into notifications (user_id, group_id, type, payload)
  select sp.user_id, s.group_id, 'REMINDER',
    jsonb_build_object(
      'session_id', s.id, 'title', s.title, 'location', s.location,
      'starts_at', lower(s.time_range), 'ends_at', upper(s.time_range),
      'hours_before', 24
    )
  from sessions s
  join session_participants sp on sp.session_id = s.id
  where s.status = 'CONFIRMED'
    and lower(s.time_range) between now() + interval '24 hours'
                                and now() + interval '24 hours 15 minutes'
    and not exists (
      select 1 from notifications n
      where n.user_id = sp.user_id
        and n.type = 'REMINDER'
        and (n.payload ->> 'session_id')::uuid = s.id
        and (n.payload ->> 'hours_before')::int = 24
    );
end;
$$;

select cron.schedule('generate-reminders', '*/15 * * * *', 'select public.generate_reminders()');
