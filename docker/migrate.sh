#!/usr/bin/env bash
# Local migration runner: applies supabase/migrations/*.sql in order,
# each one only once (tracked in the _migrations table), then seed.sql.
set -euo pipefail

echo "Waiting for GoTrue to create auth.users…"
for i in $(seq 1 60); do
  if psql -tAc "select 1 from information_schema.tables where table_schema='auth' and table_name='users'" | grep -q 1; then
    break
  fi
  sleep 1
done

psql -v ON_ERROR_STOP=1 -c "create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())"

for f in $(ls /migrations/*.sql | sort); do
  name=$(basename "$f")
  if psql -tAc "select 1 from public._migrations where name = '$name'" | grep -q 1; then
    echo "↷ $name (already applied)"
    continue
  fi
  echo "→ $name"
  psql -v ON_ERROR_STOP=1 -f "$f"
  psql -v ON_ERROR_STOP=1 -c "insert into public._migrations (name) values ('$name')"
done

if [ -f /seed.sql ]; then
  echo "→ seed.sql"
  psql -v ON_ERROR_STOP=1 -f /seed.sql
fi

echo "Migrations OK"
