-- Leave group: any member can delete their OWN membership.
create policy memberships_leave on public.memberships for delete
  using (user_id = auth.uid());
