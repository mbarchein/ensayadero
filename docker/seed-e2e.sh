#!/usr/bin/env bash
# Seed data for the e2e suite: a superadmin and one group of each type, with the
# admin as INSTRUCTOR (the on_group_created trigger adds the membership). Run
# against the local stack (docker-compose.yml). Idempotent.
set -euo pipefail

API=${API:-http://localhost:54321}
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MjA4Mjc1ODQwMH0.hKugUZ3psc796Vm1pvDwNp_KGtbvF22bnuyE6pjGQFk"
PSQL="docker compose exec -T -e PGPASSWORD=postgres db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q"

# Superadmin (first user needs no invitation). 422 = already exists → fine.
curl -s "$API/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local.test","password":"password123","email_confirm":true,"user_metadata":{"full_name":"Admin Local"}}' \
  -o /dev/null -w 'admin user: http=%{http_code}\n' || true

$PSQL -c "update public.profiles set platform_role='SUPERADMIN', onboarded_at=now(), name='Admin Local' where email='admin@local.test';"

# A second, ordinary user with her own group (admin is NOT a member) — used by
# the user-switch regression test to prove caches are cleared on login change.
curl -s "$API/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"directora@local.test","password":"password123","email_confirm":true,"user_metadata":{"full_name":"Lola Directora"}}' \
  -o /dev/null -w 'directora user: http=%{http_code}\n' || true

$PSQL -c "update public.profiles set onboarded_at=now(), name='Lola Directora' where email='directora@local.test';"
$PSQL <<'SQL'
with dir as (select id from public.profiles where email='directora@local.test')
insert into public.groups (name, group_type, created_by, join_enabled)
select 'E2E Solo Directora', 'THEATRE'::group_type, dir.id, true
from dir
where not exists (select 1 from public.groups g where g.name = 'E2E Solo Directora');
SQL

$PSQL <<'SQL'
with adm as (select id from public.profiles where email='admin@local.test')
insert into public.groups (name, group_type, created_by, join_enabled)
select v.name, v.gt::group_type, adm.id, true
from adm, (values
  ('E2E Teatro','THEATRE'),
  ('E2E Música','MUSIC'),
  ('E2E Danza','DANCE'),
  ('E2E Deportes','SPORTS'),
  ('E2E Otro','OTHER')
) as v(name, gt)
where not exists (select 1 from public.groups g where g.name = v.name);
SQL

echo "e2e seed ready (admin@local.test / password123, 5 typed groups)"
