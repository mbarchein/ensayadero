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
| auth (GoTrue) | — | Auth: email+password, Google/Facebook OAuth, activation + recovery, optional Turnstile |
| rest (PostgREST) | — | API with RLS |
| functions (Deno) | — | Edge Functions: `send-notifications`, `legal-info` |
| mailpit | 54324 | Mail catcher (activation/recovery/notification emails); web UI |
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

## Login locally
The login screen offers Google, Meta/Facebook and email+password (the same as
production). The seed creates password users, so no OAuth setup is needed to log
in. **All** local emails land in **mailpit** (`:54324`): GoTrue's activation /
recovery / email-change messages (SMTP) and the `send-notifications` Edge
Function's notification and invitation emails (it posts to mailpit's HTTP API
when `MAILPIT_URL` is set, so Resend is never hit in dev).

Auth emails use the branded bilingual templates in `docker/mail-templates/`
(served to GoTrue by the local nginx gateway). The language comes from
`user_metadata.lang`, stored at signup and kept in sync by the app; the same
metadata drives the language of the notification emails.

Optional `.env` / `.env.example` settings (everything works without them):
- `DEV_HOST` — set to your machine's LAN IP to test from a phone on the same
  Wi-Fi (open `http://<ip>:5173`).
- `GOOGLE_OAUTH_ENABLED` + client id/secret — enable Google locally.
- `FACEBOOK_OAUTH_ENABLED` + client id/secret — enable Meta/Facebook locally.
- `TURNSTILE_CAPTCHA_ENABLED` + `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET` — enable
  the CAPTCHA (Cloudflare publishes always-pass test keys).
- `RESEND_API_KEY`/`EMAIL_FROM` (real email through Resend — also remove
  `MAILPIT_URL` from `docker-compose.yml`, otherwise mailpit wins) and
  `VAPID_*` (Web Push) — optional.

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
