-- "Remind pending" action on the session detail: queues a NUDGE notification
-- for every participant of the session who hasn't answered yet. The cron
-- picks them up for email/push delivery like any other notification.
-- SECURITY DEFINER because users have no INSERT policy on notifications;
-- only instructors of the session's group (or superadmin) may call it.

create or replace function public.nudge_pending_participants(sid uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ses sessions%rowtype;
  inserted integer;
begin
  select * into ses from sessions where id = sid;
  if ses.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not (is_instructor(auth.uid(), ses.group_id) or is_superadmin(auth.uid())) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if ses.status <> 'CONFIRMED' then
    raise exception 'SESSION_NOT_CONFIRMED';
  end if;

  insert into notifications (user_id, group_id, type, payload)
  select sp.user_id, ses.group_id, 'NUDGE',
    jsonb_build_object(
      'session_id', ses.id,
      'starts_at', lower(ses.time_range),
      'ends_at', upper(ses.time_range),
      'location', ses.location
    )
  from session_participants sp
  where sp.session_id = sid
    and sp.response = 'PENDING'
    -- avoid stacking duplicates: skip users with an undelivered NUDGE
    -- for this session already in the queue
    and not exists (
      select 1 from notifications n
      where n.user_id = sp.user_id
        and n.type = 'NUDGE'
        and n.payload ->> 'session_id' = sid::text
        and n.sent_email_at is null
    );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
