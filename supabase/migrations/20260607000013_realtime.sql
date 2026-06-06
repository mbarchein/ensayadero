-- Habilitar Realtime (WebSockets) en las tablas que la UI observa.
-- La entrega respeta RLS (cada cliente solo recibe filas que puede leer).

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
      -- ya estaba en la publicación
      null;
    end;
  end loop;
end $$;
