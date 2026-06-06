#!/usr/bin/env bash
# Crea usuarios de prueba locales vía GoTrue admin API (email+password,
# solo existe en local) y monta un grupo de ejemplo con director y actores.
set -euo pipefail

API=${API:-http://localhost:54321}
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MjA4Mjc1ODQwMH0.hKugUZ3psc796Vm1pvDwNp_KGtbvF22bnuyE6pjGQFk"
PSQL="docker compose exec -T -e PGPASSWORD=postgres db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1"

create_user() {
  local email=$1 name=$2
  curl -sf "$API/auth/v1/admin/users" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "apikey: $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"password123\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\"}}" \
    > /dev/null && echo "✓ $email" || echo "↷ $email (ya existe o error)"
}

# El gate de invitación permite al PRIMER usuario entrar sin invitación
# (bootstrap superadmin). Los demás necesitan invitación previa → la creamos por SQL.

create_user "admin@local.test" "Admin Local"
$PSQL -c "update public.profiles set platform_role='SUPERADMIN' where email='admin@local.test'" > /dev/null

$PSQL <<'SQL' > /dev/null
insert into public.groups (id, name)
values ('00000000-0000-0000-0000-000000000001', 'La Tempestad (demo)')
on conflict do nothing;

insert into public.invitations (group_id, email, role, created_by)
select '00000000-0000-0000-0000-000000000001', e.email, e.role::group_role, p.id
from (values
  ('directora@local.test', 'INSTRUCTOR'),
  ('actor1@local.test', 'ACTOR'),
  ('actor2@local.test', 'ACTOR'),
  ('actor3@local.test', 'ACTOR')
) as e(email, role)
cross join (select id from public.profiles where email='admin@local.test') p
where not exists (              -- sin invitación PENDIENTE…
  select 1 from public.invitations i
  where i.email = e.email
    and i.group_id = '00000000-0000-0000-0000-000000000001'
    and i.accepted_at is null
    and i.expires_at > now()
)
and not exists (                -- …y sin cuenta ya creada
  select 1 from public.profiles p where p.email = e.email
);
SQL

create_user "directora@local.test" "Lola Directora"
create_user "actor1@local.test" "Ana Actriz"
create_user "actor2@local.test" "Benito Actor"
create_user "actor3@local.test" "Carmen Actriz"

echo
echo "Usuarios listos (password: password123):"
echo "  admin@local.test       superadmin"
echo "  directora@local.test   directora del grupo demo"
echo "  actor1..3@local.test   actores"
echo
echo "Login local por password (la UI solo tiene Google):"
echo "  curl '$API/auth/v1/token?grant_type=password' -H 'apikey: <anon>' -d '{\"email\":\"...\",\"password\":\"password123\"}'"
