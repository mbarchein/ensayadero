-- Calendar import: the feed link is write-only, imported events stay private
-- to their owner, co-members only get anonymous busy ranges, ignored events
-- drop out, and removing a calendar removes its blocks. All fixtures live in
-- a transaction that is rolled back, so the test leaves no trace.
\set ON_ERROR_STOP on
begin;

-- the auth.users insert fires handle_new_user, which creates the profile row
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cal-a@local.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'cal-b@local.test');
insert into public.groups (id, name)
values ('00000000-0000-0000-0000-0000000000d9', 'Calendar test group');
insert into public.memberships (user_id, group_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d9', 'ACTOR'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d9', 'ACTOR');

-- A subscribes through the API role
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
with ins as (
  insert into public.calendar_sources (name, url)
  values ('Trabajo', 'webcal://calendar.example.com/private-abc123/basic.ics')
  returning id
)
select set_config('test.sid', id::text, true) from ins;

do $$
declare h text;
begin
  select url_hint into h from public.calendar_sources;
  if h is distinct from 'calendar.example.com…/basic.ics' then
    raise exception 'FAIL: unexpected url_hint %', h;
  end if;
  raise notice 'OK: hint shows host and tail only (%)', h;
end $$;

do $$
begin
  perform url from public.calendar_sources;
  raise exception 'FAIL: the feed link can be read back';
exception when insufficient_privilege then
  raise notice 'OK: the feed link is write-only';
end $$;

do $$
begin
  perform public.replace_external_busy(current_setting('test.sid')::uuid, '[]');
  raise exception 'FAIL: a user can write busy blocks';
exception when insufficient_privilege then
  raise notice 'OK: only the server writes busy blocks';
end $$;

-- the sync (server) stores two events, webcal:// was normalized to https://
reset role;
do $$
begin
  if (select url from public.calendar_sources where id = current_setting('test.sid')::uuid)
     not like 'https://%' then
    raise exception 'FAIL: webcal link not normalized';
  end if;
end $$;
select public.replace_external_busy(current_setting('test.sid')::uuid, '[
  {"uid":"gym@x","starts_at":"2030-01-07T17:00:00Z","ends_at":"2030-01-07T18:00:00Z","summary":"Gimnasio","recurring":true},
  {"uid":"dentist@x","starts_at":"2030-01-08T10:00:00Z","ends_at":"2030-01-08T11:00:00Z","summary":"Dentista"}
]');

-- B, a co-member: anonymous busy ranges only
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2"}';
do $$
declare n int;
begin
  select count(*) into n from public.external_busy;
  if n <> 0 then raise exception 'FAIL: B reads A''s events (%)', n; end if;
  select count(*) into n from public.calendar_sources;
  if n <> 0 then raise exception 'FAIL: B reads A''s calendars (%)', n; end if;
  select count(*) into n
    from public.group_busy_ranges('00000000-0000-0000-0000-0000000000d9', tstzrange('2030-01-01', '2030-02-01'))
   where user_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 2 then raise exception 'FAIL: expected 2 busy ranges for A, got %', n; end if;
  raise notice 'OK: co-members see A as busy, without titles or rows';
end $$;

do $$
begin
  insert into public.external_busy_ignores (source_id, uid)
  values (current_setting('test.sid')::uuid, 'gym@x');
  raise exception 'FAIL: B ignored an event of A';
exception when insufficient_privilege then
  raise notice 'OK: only the owner can ignore their events';
end $$;

-- A ignores the gym series: it stops counting as busy for the group
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
insert into public.external_busy_ignores (source_id, uid, summary)
values (current_setting('test.sid')::uuid, 'gym@x', 'Gimnasio');
do $$
declare n int;
begin
  select count(*) into n from public.external_busy;
  if n <> 2 then raise exception 'FAIL: A should still see both own events, got %', n; end if;
  select count(*) into n
    from public.group_busy_ranges('00000000-0000-0000-0000-0000000000d9', tstzrange('2030-01-01', '2030-02-01'))
   where user_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'FAIL: ignored series still busy (% ranges)', n; end if;
  raise notice 'OK: an ignored series no longer counts as busy';
end $$;

-- at most 5 calendars per user
insert into public.calendar_sources (name, url)
select 'Extra ' || i, 'https://calendar.example.com/feed' || i || '.ics' from generate_series(1, 4) i;
do $$
begin
  insert into public.calendar_sources (name, url) values ('Sixth', 'https://calendar.example.com/6.ics');
  raise exception 'FAIL: a sixth calendar was accepted';
exception when check_violation then
  raise notice 'OK: calendars are capped at 5 (%)', sqlerrm;
end $$;

-- removing the calendar removes its blocks and ignores
delete from public.calendar_sources where id = current_setting('test.sid')::uuid;
reset role;
do $$
begin
  if exists (select 1 from public.external_busy where source_id = current_setting('test.sid')::uuid)
     or exists (select 1 from public.external_busy_ignores where source_id = current_setting('test.sid')::uuid) then
    raise exception 'FAIL: blocks or ignores left behind';
  end if;
  raise notice 'OK: removing a calendar removes its blocks';
end $$;

rollback;
