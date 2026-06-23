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

-- Authoritative: correct the type of the fixtures even if a prior test run
-- changed it, so the suite is deterministic on a long-lived dev database.
update public.groups g
set group_type = v.gt::group_type
from (values
  ('E2E Teatro','THEATRE'),
  ('E2E Música','MUSIC'),
  ('E2E Danza','DANCE'),
  ('E2E Deportes','SPORTS'),
  ('E2E Otro','OTHER')
) as v(name, gt)
where g.name = v.name and g.group_type <> v.gt::group_type;
SQL

# ── Null-profile regression fixture ──────────────────────────────────────────
# Eva is a participant of directora's CONFIRMED session but not a member of the
# group (the shape an ex-member left on a PAST session ends up in — the
# drop_future_participations trigger only purges future sessions). profiles RLS
# then hides her from directora (no shared group, and directora is NOT
# superadmin), so the session embeds profiles=null — the exact shape that
# crashed SessionDetailPage. We insert her participation directly (no membership)
# so the leave trigger doesn't remove it. Viewed as directora, not admin: a
# superadmin sees every profile and wouldn't reproduce. Idempotent.
curl -s "$API/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"exmember@local.test","password":"password123","email_confirm":true,"user_metadata":{"full_name":"Eva Exmiembro"}}' \
  -o /dev/null -w 'exmember user: http=%{http_code}\n' || true

$PSQL -c "update public.profiles set onboarded_at=now(), name='Eva Exmiembro' where email='exmember@local.test';"

$PSQL <<'SQL'
-- rebuild authoritatively: drop any prior fixture (cascades to its sessions,
-- participants and memberships) so owner/participants are deterministic
delete from public.groups where name='E2E Sesiones';

-- group owned by directora (on_group_created adds her as INSTRUCTOR)
with dir as (select id from public.profiles where email='directora@local.test')
insert into public.groups (name, group_type, created_by, join_enabled)
select 'E2E Sesiones', 'THEATRE'::group_type, dir.id, true from dir
where not exists (select 1 from public.groups where name='E2E Sesiones');

-- safety: ensure directora INSTRUCTOR membership
insert into public.memberships (user_id, group_id, role)
select d.id, g.id, 'INSTRUCTOR'
from public.profiles d, public.groups g
where d.email='directora@local.test' and g.name='E2E Sesiones'
on conflict (user_id, group_id) do nothing;

-- a CONFIRMED session tomorrow 18:00–20:00 (marker in comments for idempotency)
insert into public.sessions (group_id, location, comments, time_range, status, created_by)
select g.id, 'Sala 1', 'E2E orphan fixture',
       tstzrange((now()::date + interval '1 day' + interval '18 hour'),
                 (now()::date + interval '1 day' + interval '20 hour'), '[)'),
       'CONFIRMED', d.id
from public.groups g, public.profiles d
where g.name='E2E Sesiones' and d.email='directora@local.test'
  and not exists (
    select 1 from public.sessions s
    where s.group_id=g.id and s.comments='E2E orphan fixture');

-- participants: directora (pending) + exmember (accepted)
insert into public.session_participants (session_id, user_id, required, response)
select s.id, d.id, true, 'PENDING'
from public.sessions s join public.profiles d on d.email='directora@local.test'
where s.comments='E2E orphan fixture'
on conflict (session_id, user_id) do nothing;

insert into public.session_participants (session_id, user_id, required, response)
select s.id, e.id, true, 'ACCEPTED'
from public.sessions s join public.profiles e on e.email='exmember@local.test'
where s.comments='E2E orphan fixture'
on conflict (session_id, user_id) do nothing;
SQL

echo "e2e seed ready (admin@local.test / password123, 5 typed groups, orphan-session fixture)"
