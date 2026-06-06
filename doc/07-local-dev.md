# 07 · Local development

Full stack in docker-compose, **without** the Supabase CLI.

## Start

```bash
make up           # bring everything up
make seed-users   # demo users + demo group
make logs         # logs
make reset        # DB from scratch (down -v + up; re-applies migrations + seed)
make help         # other commands
```

| Service | Port | Role |
|---------|------|------|
| app (Vite) | 5173 | Dev frontend |
| gateway (nginx) | 54321 | Emulates Kong: `/auth/v1`, `/rest/v1`, `/functions/v1` (+ CORS) |
| db (supabase/postgres) | 54322 | Postgres with pg_cron/pg_net |
| auth (GoTrue) | — | Auth; email+password enabled only locally |
| rest (PostgREST) | — | API with RLS |
| functions (Deno) | — | `send-notifications` |
| realtime (supabase/realtime) | — | WebSockets (Postgres changes). Tenant `realtime-dev` |
| migrate | — | Applies `supabase/migrations/*` (`_migrations` table) + `seed.sql` |

Details:
- `docker/db-init.sql` syncs internal role passwords with `POSTGRES_PASSWORD`
  (local only).
- `docker/migrate.sh` waits for GoTrue to create `auth.users`, applies migrations
  in order once each, then `seed.sql`.
- `docker/gateway.conf` routes and adds CORS for auth and functions (GoTrue/Deno
  don't emit them; PostgREST does). Without this, browser login fails.
- Local JWT: anon/service pair signed with the compose `JWT_SECRET` (local only).
- Realtime: the WS route forces the `realtime-dev` tenant Host in the gateway.
  `make seed-users` aligns the tenant `jwt_secret` with `JWT_SECRET` (the tenant
  is seeded with a random secret on first boot); re-run it after `make reset`.

## Demo users (`make seed-users`, password `password123`)

| Email | Role |
|-------|------|
| `admin@local.test` | Superadmin |
| `directora@local.test` | Director of the demo group "La Tempestad (demo)" |
| `actor1@…`, `actor2@…`, `actor3@…` | Actors |

The seed creates invitations before each user; sign-up auto-accepts them and
creates the memberships. `seed-users.sh` recreates deleted users (filters by
pending invitation and existing profile).

## Dev login
The UI shows a **"dev login"** box (only `import.meta.env.DEV`, absent in
production) to sign in with email+password. Google optional locally by exporting
`GOOGLE_OAUTH_ENABLED=true` + client id/secret in `.env`.

## Useful commands
```bash
make psql                       # SQL shell
docker compose up migrate       # re-apply new migrations
docker compose exec app npm run typecheck
docker compose exec app npm test
```

## Notes
- Node 24 locally; the `app` container uses its own `node_modules` volume (when
  adding libs: `docker compose exec app npm install`).
- `dist/` may be left owned by root if built in the container; remove with
  `docker compose exec app rm -rf /app/dist` or rebuild.
