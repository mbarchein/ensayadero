-- Enable Realtime (WebSockets) on the tables the UI observes.
-- Delivery respects RLS (each client only receives rows it can read).

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'session_participants', 'availabilities', 'notifications', 'memberships'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      -- already in the publication
      null;
    end;
  end loop;
end $$;
