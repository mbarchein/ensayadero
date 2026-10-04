-- Calendar import, editing a calendar: renaming keeps its synced events; a new
-- link drops them and resets the sync state (ignored events stay); the same
-- link again (webcal:// vs https://) changes nothing; the link stays
-- write-only; nobody else can edit it. All fixtures live in a transaction that
-- is rolled back, so the test leaves no trace.
\set ON_ERROR_STOP on
begin;

-- the auth.users insert fires handle_new_user, which creates the profile row
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'edit-a@local.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'edit-b@local.test');

-- A subscribes through the API role
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
with ins as (
  insert into public.calendar_sources (name, url)
  values ('Trabajo', 'https://calendar.example.com/private-old111/basic.ics')
  returning id
)
select set_config('test.sid', id::text, true) from ins;
insert into public.external_busy_ignores (source_id, uid, occurrence, summary)
values (current_setting('test.sid')::uuid, 'gym@example.com', null, 'Gym');

-- the sync (server) stores two events
reset role;
select public.replace_external_busy(current_setting('test.sid')::uuid, '[
  {"uid":"e1@example.com","starts_at":"2026-10-06T08:00:00Z","ends_at":"2026-10-06T09:00:00Z","summary":"Standup"},
  {"uid":"gym@example.com","starts_at":"2026-10-06T17:00:00Z","ends_at":"2026-10-06T18:00:00Z","summary":"Gym"}
]');
update public.calendar_sources set last_attempt_at = now() where id = current_setting('test.sid')::uuid;

-- renaming keeps the events
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
update public.calendar_sources set name = 'Oficina' where id = current_setting('test.sid')::uuid;
do $$
begin
  if (select count(*) from public.external_busy) <> 2 then
    raise exception 'FAIL: renaming dropped the events';
  end if;
  raise notice 'OK: renaming keeps the synced events';
end $$;

-- the same link (as webcal://) is no change
update public.calendar_sources
set url = 'webcal://calendar.example.com/private-old111/basic.ics'
where id = current_setting('test.sid')::uuid;
do $$
begin
  if (select count(*) from public.external_busy) <> 2 then
    raise exception 'FAIL: the same link dropped the events';
  end if;
  raise notice 'OK: the same link (webcal://) keeps the events';
end $$;

-- B can't touch A's calendar
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
update public.calendar_sources set url = 'https://evil.example.com/x.ics', name = 'x'
where id = current_setting('test.sid')::uuid;
reset role;
do $$
begin
  if (select name from public.calendar_sources where id = current_setting('test.sid')::uuid) <> 'Oficina'
     or (select count(*) from public.external_busy where source_id = current_setting('test.sid')::uuid) <> 2 then
    raise exception 'FAIL: another user edited the calendar';
  end if;
  raise notice 'OK: another user cannot edit it';
end $$;

-- a new link drops the events and resets the sync state, keeps the ignores
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
update public.calendar_sources
set url = 'https://calendar.example.com/private-new222/basic.ics'
where id = current_setting('test.sid')::uuid;
do $$
begin
  if (select count(*) from public.external_busy) <> 0 then
    raise exception 'FAIL: the old link''s events are still there';
  end if;
  raise notice 'OK: a new link drops the synced events';
end $$;

do $$
begin
  perform url from public.calendar_sources;
  raise exception 'FAIL: the feed link can be read back';
exception when insufficient_privilege then
  raise notice 'OK: the link stays write-only after editing';
end $$;

reset role;
do $$
declare s record;
begin
  select url, url_hint, last_synced_at, last_attempt_at into s
  from public.calendar_sources where id = current_setting('test.sid')::uuid;
  if s.url <> 'https://calendar.example.com/private-new222/basic.ics'
     or s.last_synced_at is not null or s.last_attempt_at is not null then
    raise exception 'FAIL: sync state not reset (%)', s;
  end if;
  if (select count(*) from public.external_busy_ignores where source_id = current_setting('test.sid')::uuid) <> 1 then
    raise exception 'FAIL: the ignored events were dropped';
  end if;
  raise notice 'OK: a new link resets the sync state and keeps the ignores';
end $$;

rollback;
