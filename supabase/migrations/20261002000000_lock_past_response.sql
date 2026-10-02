-- A rehearsal's attendance answer is frozen once it's over: nobody can
-- change "going / not going" after the session's end (the app already shows
-- it read-only). Only direct updates are blocked: the reset to PENDING that
-- notify_session_change runs when a director reschedules (a nested trigger,
-- depth > 1) still applies, so editing a past rehearsal never fails on it.

create or replace function public.lock_past_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1
     and new.response is distinct from old.response
     and exists (
       select 1 from sessions s
       where s.id = new.session_id and upper(s.time_range) <= now()
     ) then
    raise exception 'SESSION_OVER' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger lock_past_response
  before update of response on public.session_participants
  for each row execute function public.lock_past_response();
