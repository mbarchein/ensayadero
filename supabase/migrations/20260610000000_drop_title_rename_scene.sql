-- Sessions lose their free-text title (group + date/time identifies a
-- rehearsal everywhere) and "scene" becomes general comments.

alter table public.sessions rename column scene to comments;

-- Replace the notification payload builders BEFORE dropping the column.
create or replace function public.notify_session_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ntype text;
  time_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'CONFIRMED' then
      ntype := 'SESSION_CONFIRMED';
    else
      return new;
    end if;
  else
    time_changed := old.time_range != new.time_range;
    if old.status != 'CONFIRMED' and new.status = 'CONFIRMED' then
      ntype := 'SESSION_CONFIRMED';
    elsif old.status = 'CONFIRMED' and new.status = 'CANCELLED' then
      ntype := 'SESSION_CANCELLED';
    elsif new.status = 'CONFIRMED'
          and (time_changed or old.location is distinct from new.location) then
      ntype := 'SESSION_CHANGED';
      -- only a time change invalidates the responses
      if time_changed then
        update session_participants set response = 'PENDING' where session_id = new.id;
      end if;
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
      'location', new.location,
      'starts_at', lower(new.time_range),
      'ends_at', upper(new.time_range),
      'required', sp.required,
      'old_starts_at', case when ntype = 'SESSION_CHANGED' and tg_op = 'UPDATE' and old.time_range != new.time_range then lower(old.time_range) end,
      'old_location', case when ntype = 'SESSION_CHANGED' and tg_op = 'UPDATE' and old.location is distinct from new.location then old.location end
    )
  from session_participants sp
  where sp.session_id = new.id;

  return new;
end;
$$;

create or replace function public.notify_participant_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from sessions s where s.id = new.session_id and s.status = 'CONFIRMED') then
    insert into notifications (user_id, group_id, type, payload)
    select new.user_id, s.group_id, 'SESSION_CONFIRMED',
      jsonb_build_object(
        'session_id', s.id, 'location', s.location,
        'starts_at', lower(s.time_range), 'ends_at', upper(s.time_range),
        'required', new.required
      )
    from sessions s where s.id = new.session_id;
  end if;
  return new;
end;
$$;

create or replace function public.generate_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- reminder 24h before (15 min window to avoid duplicates with the every-15-min run)
  insert into notifications (user_id, group_id, type, payload)
  select sp.user_id, s.group_id, 'REMINDER',
    jsonb_build_object(
      'session_id', s.id, 'location', s.location,
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

alter table public.sessions drop column title;
