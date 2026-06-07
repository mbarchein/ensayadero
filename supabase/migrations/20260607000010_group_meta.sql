-- Edit the group's name and avatar seed (director only).
alter table public.groups add column if not exists avatar_seed text;

create or replace function public.update_group_meta(gid uuid, new_name text, new_seed text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  update groups
  set name = coalesce(nullif(trim(new_name), ''), name),
      avatar_seed = new_seed
  where id = gid;
end;
$$;

revoke execute on function public.update_group_meta(uuid, text, text) from public, anon;
grant execute on function public.update_group_meta(uuid, text, text) to authenticated;
