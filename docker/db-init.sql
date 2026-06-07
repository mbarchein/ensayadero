-- Syncs the passwords of the supabase/postgres image's internal roles
-- with POSTGRES_PASSWORD (local stack only). Runs once at initdb.
alter user supabase_auth_admin with password 'postgres';
alter user authenticator with password 'postgres';
alter user supabase_storage_admin with password 'postgres';
alter user supabase_admin with password 'postgres';
alter user postgres with password 'postgres';

create schema if not exists _realtime authorization supabase_admin;
