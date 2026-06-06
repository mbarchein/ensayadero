-- Sincroniza passwords de roles internos de la imagen supabase/postgres
-- con POSTGRES_PASSWORD (solo stack local). Se ejecuta una vez en initdb.
alter user supabase_auth_admin with password 'postgres';
alter user authenticator with password 'postgres';
alter user supabase_storage_admin with password 'postgres';
alter user supabase_admin with password 'postgres';
alter user postgres with password 'postgres';

create schema if not exists _realtime authorization supabase_admin;
