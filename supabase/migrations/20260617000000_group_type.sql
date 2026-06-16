-- Group type: each group declares its activity domain so the UI can adapt its
-- vocabulary (the role labels, the word for a "rehearsal", the welcome copy).
-- THEATRE is the default so every existing group keeps its current wording with
-- no data migration. OTHER carries the neutral vocabulary and doubles as the
-- fallback for users who onboard without a group yet.

create type group_type as enum ('THEATRE', 'MUSIC', 'DANCE', 'SPORTS', 'OTHER');

alter table public.groups
  add column group_type group_type not null default 'THEATRE';

-- update_group_meta gains the type; NULL keeps the current value so the avatar
-- and policy autosave paths can leave it untouched.
drop function if exists
  public.update_group_meta(uuid, text, text, text, member_inclusion_policy);

create or replace function public.update_group_meta(
  gid uuid, new_name text, new_seed text, new_image text default null,
  new_policy member_inclusion_policy default null,
  new_type group_type default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  update groups
  set name = coalesce(nullif(trim(new_name), ''), name),
      avatar_seed = new_seed,
      avatar_image = new_image,
      new_member_policy = coalesce(new_policy, new_member_policy),
      group_type = coalesce(new_type, group_type)
  where id = gid;
end;
$$;

revoke execute on function
  public.update_group_meta(uuid, text, text, text, member_inclusion_policy, group_type)
  from public, anon;
grant execute on function
  public.update_group_meta(uuid, text, text, text, member_inclusion_policy, group_type)
  to authenticated;
