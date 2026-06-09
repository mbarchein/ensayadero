-- Uploaded group avatar: cropped square image stored inline as a data URL
-- (~10-20KB webp). NULL → the generated avatar (avatar_seed) is used.

alter table public.groups add column avatar_image text
  check (avatar_image is null or length(avatar_image) < 100000);

-- update_group_meta now also sets/clears the uploaded image (director only).
drop function if exists public.update_group_meta(uuid, text, text);

create or replace function public.update_group_meta(
  gid uuid, new_name text, new_seed text, new_image text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  update groups
  set name = coalesce(nullif(trim(new_name), ''), name),
      avatar_seed = new_seed,
      avatar_image = new_image
  where id = gid;
end;
$$;

revoke execute on function public.update_group_meta(uuid, text, text, text) from public, anon;
grant execute on function public.update_group_meta(uuid, text, text, text) to authenticated;
