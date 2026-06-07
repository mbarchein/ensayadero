#!/usr/bin/env bash
# Creates local test users via the GoTrue admin API (email+password,
# local-only) and sets up a sample group with a director and actors.
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
    > /dev/null && echo "✓ $email" || echo "↷ $email (already exists or error)"
}

# The invitation gate lets the FIRST user in without an invitation
# (superadmin bootstrap). The rest need a prior invitation → we create it via SQL.

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
where not exists (              -- no PENDING invitation…
  select 1 from public.invitations i
  where i.email = e.email
    and i.group_id = '00000000-0000-0000-0000-000000000001'
    and i.accepted_at is null
    and i.expires_at > now()
)
and not exists (                -- …and no account already created
  select 1 from public.profiles p where p.email = e.email
);
SQL

create_user "directora@local.test" "Lola Directora"
create_user "actor1@local.test" "Ana Actriz"
create_user "actor2@local.test" "Benito Actor"
create_user "actor3@local.test" "Carmen Actriz"

echo
echo "Users ready (password: password123):"
echo "  admin@local.test       superadmin"
echo "  directora@local.test   director of the demo group"
echo "  actor1..3@local.test   actors"
echo
echo "Local password login (the UI only offers Google):"
echo "  curl '$API/auth/v1/token?grant_type=password' -H 'apikey: <anon>' -d '{\"email\":\"...\",\"password\":\"password123\"}'"

# Realtime (local): align the tenant's jwt_secret with JWT_SECRET so that
# channels validate user tokens (otherwise the tenant is seeded with a
# random secret and the subscription fails). Idempotent.
ENC=$(node -e 'const c=require("crypto").createCipheriv("aes-128-ecb",Buffer.from("supabaserealtime"),null);let e=c.update("your-super-secret-jwt-token-with-at-least-32-characters-long","utf8","base64");e+=c.final("base64");process.stdout.write(e)' 2>/dev/null)
if [ -n "$ENC" ]; then
  $PSQL -c "update _realtime.tenants set jwt_secret='$ENC' where external_id='realtime-dev';" >/dev/null 2>&1 \
    && echo "✓ realtime tenant secret aligned" || echo "↷ realtime not ready yet (retry make seed-users)"
fi
