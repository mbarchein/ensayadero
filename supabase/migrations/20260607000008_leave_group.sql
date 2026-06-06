-- Abandonar grupo: cualquier miembro puede borrar su PROPIA membresía.
create policy memberships_leave on public.memberships for delete
  using (user_id = auth.uid());
