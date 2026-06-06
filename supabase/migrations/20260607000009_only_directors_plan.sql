-- Revertir: solo los directores pueden crear ensayos (no cualquier miembro).
-- Mantener que el director o el creador puedan editar/borrar.

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert
  with check (is_instructor(auth.uid(), group_id) and created_by = auth.uid());
