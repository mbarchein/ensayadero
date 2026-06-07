-- Exclude I and O from the code alphabet (confused with 1 and 0).
create or replace function public.gen_join_code()
returns text language sql volatile set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', (floor(random() * 34)::int) + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

update public.groups set join_code = public.gen_join_code();
