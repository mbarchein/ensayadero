-- Revert: only directors can create rehearsals (not any member).
-- Keep the director or the creator able to edit/delete.

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert
  with check (is_instructor(auth.uid(), group_id) and created_by = auth.uid());
