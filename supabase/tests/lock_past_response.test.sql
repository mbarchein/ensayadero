-- The attendance answer of a rehearsal that is over can't be changed
-- directly, while upcoming ones can, and a director rescheduling a past
-- rehearsal still resets answers to PENDING without failing. All fixtures
-- live in a transaction that is rolled back, so the test leaves no trace.
\set ON_ERROR_STOP on
begin;

-- the auth.users insert fires handle_new_user, which creates the profile row
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000ca', 'lock-test@local.test');

insert into public.groups (id, name)
values ('00000000-0000-0000-0000-0000000000cb', 'Lock test group');

insert into public.memberships (user_id, group_id, role)
values ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000cb', 'ACTOR');

insert into public.sessions (id, group_id, time_range, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000cb',
   tstzrange(now() - interval '3 hours', now() - interval '1 hour'), 'CONFIRMED'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000cb',
   tstzrange(now() + interval '1 day', now() + interval '1 day 2 hours'), 'CONFIRMED');

insert into public.session_participants (session_id, user_id, response) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ca', 'ACCEPTED'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000ca', 'PENDING');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ca"}';

-- 1) over: changing the answer is refused
do $$
begin
  update public.session_participants set response = 'DECLINED'
   where session_id = '00000000-0000-0000-0000-0000000000c1';
  raise exception 'FAIL: answer of a finished rehearsal was changed';
exception when check_violation then
  raise notice 'OK: finished rehearsal answer is locked (%)', sqlerrm;
end $$;

-- 2) upcoming: the answer can still change
update public.session_participants set response = 'ACCEPTED'
 where session_id = '00000000-0000-0000-0000-0000000000c2';
do $$
begin
  if (select response from public.session_participants
       where session_id = '00000000-0000-0000-0000-0000000000c2') is distinct from 'ACCEPTED' then
    raise exception 'FAIL: upcoming rehearsal answer did not change';
  end if;
  raise notice 'OK: upcoming rehearsal answer can change';
end $$;

-- 3) rescheduling the finished rehearsal (still in the past) works and its
--    nested reset to PENDING is not blocked
update public.sessions
   set time_range = tstzrange(now() - interval '5 hours', now() - interval '4 hours')
 where id = '00000000-0000-0000-0000-0000000000c1';
do $$
begin
  if (select response from public.session_participants
       where session_id = '00000000-0000-0000-0000-0000000000c1') is distinct from 'PENDING' then
    raise exception 'FAIL: rescheduling did not reset the answer';
  end if;
  raise notice 'OK: rescheduling a finished rehearsal still resets answers';
end $$;

rollback;
