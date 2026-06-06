-- Teléfono opcional en el perfil (contacto del grupo).
alter table public.profiles add column if not exists phone text;
