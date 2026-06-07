-- Group code using the full A-Z0-9 alphabet (not just hex).

create or replace function public.gen_join_code()
returns text language sql volatile set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (floor(random() * 36)::int) + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

alter table public.groups alter column join_code set default public.gen_join_code();

-- regenerate existing codes with the new alphabet
update public.groups set join_code = public.gen_join_code();

create or replace function public.regenerate_join_code(gid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_instructor(auth.uid(), gid) then raise exception 'FORBIDDEN'; end if;
  c := public.gen_join_code();
  update groups set join_code = c where id = gid;
  return c;
end;
$$;
