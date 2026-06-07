-- Local development seed. Does NOT run in production.
-- Superadmin promotion in prod: done manually once via the SQL editor:
--   update profiles set platform_role = 'SUPERADMIN' where email = 'you@example.com';

-- Promotes the local demo admin to superadmin (idempotent)
update public.profiles
set platform_role = 'SUPERADMIN'
where email = 'admin@local.test';
