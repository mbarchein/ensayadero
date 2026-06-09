-- A group must keep at least one director: after a membership delete (leave or
-- removal), if members remain but none is an INSTRUCTOR, promote one at random.
-- The UI asks the leaving director to pick a successor; this trigger is the
-- safety net for direct API calls.

create or replace function public.ensure_group_director()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from memberships where group_id = old.group_id)
     and not exists (
       select 1 from memberships where group_id = old.group_id and role = 'INSTRUCTOR'
     ) then
    update memberships set role = 'INSTRUCTOR'
    where group_id = old.group_id
      and user_id = (
        select user_id from memberships
        where group_id = old.group_id
        order by random() limit 1
      );
  end if;
  return old;
end;
$$;

create trigger memberships_ensure_director
  after delete on public.memberships
  for each row execute function public.ensure_group_director();
