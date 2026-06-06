-- Borrado de cuenta propia (GDPR, RNF5).
-- Eliminar auth.users cascada a profiles → memberships, availabilities,
-- session_participants, notifications, push_subscriptions (FKs on delete cascade).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
