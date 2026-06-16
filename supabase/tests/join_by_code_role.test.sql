-- join_by_code must NOT degrade an existing member's role: a director who
-- re-follows the group's join link (or re-enters the code) stays a director.
-- The guarantee is the `on conflict do nothing` on memberships' (user_id,
-- group_id) primary key. All fixtures live in a transaction that is rolled
-- back, so the test leaves no trace.
\set ON_ERROR_STOP on
begin;

-- the auth.users insert fires handle_new_user, which creates the profile row
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000aa', 'role-test@local.test');

insert into public.groups (id, name, join_code, join_enabled)
values ('00000000-0000-0000-0000-0000000000bb', 'Role test group', 'ROLET1', true);

insert into public.memberships (user_id, group_id, role)
values (
  '00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000bb',
  'INSTRUCTOR'
);

-- act as that user and follow the join link again
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa"}';
select public.join_by_code('ROLET1');

do $$
declare r public.group_role;
begin
  select role into r from public.memberships
   where user_id = '00000000-0000-0000-0000-0000000000aa'
     and group_id = '00000000-0000-0000-0000-0000000000bb';
  if r is distinct from 'INSTRUCTOR' then
    raise exception 'FAIL: join_by_code degraded role, expected INSTRUCTOR got %', r;
  end if;
  raise notice 'OK: role preserved after re-joining (%)', r;
end $$;

rollback;
