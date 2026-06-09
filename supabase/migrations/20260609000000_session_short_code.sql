-- Short shareable codes for sessions: /s/<code> deep links (members only).

create or replace function public.gen_session_short_code()
returns text language sql volatile as $$
  select string_agg(
    substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
           (floor(random() * 62))::int + 1, 1), '')
  from generate_series(1, 6)
$$;

alter table public.sessions add column short_code text;

-- security definer: the uniqueness probe must see every session, not just the
-- ones visible to the inserting member under RLS.
create or replace function public.set_session_short_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.short_code is null then
    loop
      new.short_code := public.gen_session_short_code();
      exit when not exists (select 1 from public.sessions where short_code = new.short_code);
    end loop;
  end if;
  return new;
end $$;

create trigger sessions_short_code
  before insert on public.sessions
  for each row execute function public.set_session_short_code();

-- Backfill existing sessions one by one (collision-safe).
do $$
declare
  r record;
  c text;
begin
  for r in select id from public.sessions where short_code is null loop
    loop
      c := public.gen_session_short_code();
      exit when not exists (select 1 from public.sessions where short_code = c);
    end loop;
    update public.sessions set short_code = c where id = r.id;
  end loop;
end $$;

alter table public.sessions alter column short_code set not null;
create unique index sessions_short_code_key on public.sessions (short_code);
