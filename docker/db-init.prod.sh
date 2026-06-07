#!/bin/bash
# Production initdb: sync the supabase/postgres internal role passwords with
# DB_PASSWORD and create the _realtime schema. Runs ONCE, only when the data
# volume is first created. Changing DB_PASSWORD later needs a manual ALTER USER.
set -e
P="${DB_PASSWORD:-postgres}"
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" <<SQL
alter user supabase_auth_admin with password '${P}';
alter user authenticator with password '${P}';
alter user supabase_storage_admin with password '${P}';
alter user supabase_admin with password '${P}';
alter user postgres with password '${P}';
create schema if not exists _realtime authorization supabase_admin;
SQL
