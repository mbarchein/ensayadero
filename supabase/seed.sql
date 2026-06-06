-- Seed de desarrollo local. NO se ejecuta en producción.
-- Promoción de superadmin en prod: manual una vez vía SQL editor:
--   update profiles set platform_role = 'SUPERADMIN' where email = 'you@example.com';

-- Promueve a superadmin al primer usuario que coincida (idempotente)
update public.profiles
set platform_role = 'SUPERADMIN'
where email = 'you@example.com';
