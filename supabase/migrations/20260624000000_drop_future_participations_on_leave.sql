-- When a member leaves or is removed from a group, drop their participation in
-- the group's FUTURE sessions: they should no longer be convened for events they
-- won't attend, nor count toward attendance. Past sessions keep the row as a
-- historical attendance record. "Future" mirrors the new-member auto-include
-- rule (add_member_to_future_sessions): lower(time_range) > now().
--
-- A trigger (not app code) so every removal path is covered: director removes a
-- member, a member leaves, or a direct API/admin delete.
create or replace function public.drop_future_participations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from session_participants sp
  using sessions s
  where sp.session_id = s.id
    and sp.user_id = old.user_id
    and s.group_id = old.group_id
    and lower(s.time_range) > now();
  return old;
end;
$$;

create trigger memberships_drop_future_participations
  after delete on public.memberships
  for each row execute function public.drop_future_participations();
