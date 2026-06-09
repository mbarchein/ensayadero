# DEPLOY — Self-hosting Ensayadero on Docker Swarm

This deploys the **whole stack** (Postgres, GoTrue auth, PostgREST, Realtime, the
Deno edge function, the nginx API gateway and the built PWA) onto a Docker Swarm
cluster — no Supabase cloud, no Cloudflare Pages.

> Prefer managed hosting? The Terraform path (Supabase + Cloudflare) lives in
> `infra/` and `BOOTSTRAP.md`. This document is the self-hosted alternative.

Files involved:
- `docker-stack.yml` — the Swarm stack
- `prod.env.example` — all configuration (copy to `prod.env`)
- `docker/migrate.Dockerfile`, `docker/functions.Dockerfile`, `app/Dockerfile` — built images
- `docker/db-init.prod.sh`, `docker/gateway.conf`, `docker/mail-templates/*.html` — Swarm configs
- `docker/gen-keys.mjs` — generates the API keys

---

## Architecture

```
            ┌── TLS reverse proxy (Caddy/Traefik/Cloudflare) ──┐
   app.example.es ─────────────► app    (nginx, built PWA, :80)
   api.example.es ─────────────► gateway(nginx, :8000)
                                   ├─ /auth/v1      → auth     (GoTrue :9999)
                                   ├─ /rest/v1      → rest     (PostgREST :3000)
                                   ├─ /functions/v1 → functions(Deno :8000)
                                   └─ /realtime/v1  → realtime (:4000)
                                 db (Postgres + pg_cron) ◄── all of the above
   cron ── every 60s ─► gateway /functions/v1/send-notifications
```

The browser talks to a single API origin (`PUBLIC_API_URL`, the gateway) and the
app origin (`PUBLIC_APP_URL`). Put TLS in front of both (see §8).

---

## 0. Prerequisites

- A host (or several) with Docker Engine ≥ 25 (for `replicated-job`).
- A domain with two records: app + api (e.g. `ensayadero.es`, `api.ensayadero.es`).
- `node` available locally (only to generate keys), or use the `docker run` variant.

## 1. Initialize the swarm

```bash
docker swarm init            # on the manager node (add --advertise-addr <ip> if multi-NIC)
# join more nodes with the printed `docker swarm join` command (optional)
```

The database uses a node-local volume, so pin it to one node by labelling it:

```bash
docker node update --label-add ensayadero_db=true <node-id>   # e.g. the manager
```

## 2. Configuration

```bash
cp prod.env.example prod.env
chmod 600 prod.env
```

Generate the secrets and fill them into `prod.env`:

```bash
# DB password + JWT secret
openssl rand -hex 32          # → DB_PASSWORD
openssl rand -hex 32          # → JWT_SECRET (min 32 chars)

# Realtime
openssl rand -hex 32          # → REALTIME_SECRET_KEY_BASE
openssl rand -hex 8           # → REALTIME_ENC_KEY (must be 16 chars)

# API keys derived from JWT_SECRET (paste JWT_SECRET as the argument)
node docker/gen-keys.mjs "<JWT_SECRET>"     # prints ANON_KEY and SERVICE_ROLE_KEY

# Web Push
npx web-push generate-vapid-keys            # → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

> **No Node.js on the host?** Run `node`/`npx` through Docker (the swarm host
> already has Docker):
> ```bash
> # node — gen-keys (mounts the docker/ folder so the script is reachable)
> docker run --rm -v "$PWD/docker:/d" node:22-alpine node /d/gen-keys.mjs "<JWT_SECRET>"
>
> # npx — VAPID keys
> docker run --rm node:22-alpine npx -y web-push generate-vapid-keys
>
> # realtime tenant secret (§5) without local node
> docker run --rm -e REALTIME_ENC_KEY -e JWT_SECRET node:22-alpine \
>   node -e 'const c=require("crypto").createCipheriv("aes-128-ecb",Buffer.from(process.env.REALTIME_ENC_KEY),null);process.stdout.write(c.update(process.env.JWT_SECRET,"utf8","base64")+c.final("base64"))'
> ```
> (For the last one, `set -a; source prod.env; set +a` first so the env vars pass through.)

Also set `PUBLIC_APP_URL`, `PUBLIC_API_URL`, the SMTP block (e.g. Resend), and any
optional OAuth / Turnstile values. See `prod.env.example` for the full list.

> `ANON_KEY` and `SERVICE_ROLE_KEY` **must** be generated from the same
> `JWT_SECRET` you put in `prod.env`. Regenerate them whenever `JWT_SECRET` changes.

## 3. Build the images

The frontend bakes its config at build time, so build it with the production values:

```bash
set -a; source prod.env; set +a

docker build -t "$IMAGE_PREFIX/app:$TAG" \
  --build-arg VITE_SUPABASE_URL="$PUBLIC_API_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
  --build-arg VITE_APP_URL="$PUBLIC_APP_URL" \
  --build-arg VITE_VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
  --build-arg VITE_TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}" \
  ./app

docker build -t "$IMAGE_PREFIX/functions:$TAG" -f docker/functions.Dockerfile .
docker build -t "$IMAGE_PREFIX/migrate:$TAG"   -f docker/migrate.Dockerfile .
```

**Multi-node swarm:** push the three images to a registry the nodes can reach
(`docker push $IMAGE_PREFIX/app:$TAG`, etc.) and deploy with
`--with-registry-auth`. **Single-node swarm:** the locally-built images are used
as-is, no registry needed.

## 4. Deploy the stack

```bash
set -a; source prod.env; set +a       # interpolate prod.env into the stack
docker stack deploy -c docker-stack.yml ensayadero --with-registry-auth
```

Watch it come up:

```bash
docker stack services ensayadero
docker service logs -f ensayadero_auth
```

The `migrate` service is a run-once **job**: it waits for auth, applies
`supabase/migrations/*.sql` (tracked in `_migrations`, idempotent) and exits.
Check it finished:

```bash
docker service logs ensayadero_migrate     # ends with "Migrations OK"
```

## 5. Align the Realtime tenant (one-off)

Realtime self-host seeds a tenant with a random secret; align it with `JWT_SECRET`
so user tokens validate (otherwise live updates silently fail). Run once after the
first deploy:

```bash
set -a; source prod.env; set +a
ENC=$(node -e 'const c=require("crypto").createCipheriv("aes-128-ecb",Buffer.from(process.env.REALTIME_ENC_KEY),null);let e=c.update(process.env.JWT_SECRET,"utf8","base64");e+=c.final("base64");process.stdout.write(e)')
docker exec $(docker ps -qf name=ensayadero_db) \
  psql -U supabase_admin -d postgres -c \
  "update _realtime.tenants set jwt_secret='$ENC' where external_id='realtime-dev';"
```

(Re-run only if `JWT_SECRET` or `REALTIME_ENC_KEY` change.)

## 6. TLS / reverse proxy

The stack publishes the app on `APP_PORT` and the API on `API_PORT` over plain
HTTP. Terminate TLS in front. Minimal Caddy example (`/etc/caddy/Caddyfile`):

```
ensayadero.es {
    reverse_proxy localhost:8080
}
api.ensayadero.es {
    reverse_proxy localhost:8000
}
```

Caddy fetches Let's Encrypt certs automatically. (Traefik on the swarm or
Cloudflare in front work too — just make `PUBLIC_APP_URL`/`PUBLIC_API_URL` match
the public HTTPS URLs.)

## 7. Promote the superadmin

Sign in once through the app with your account, then:

```bash
docker exec $(docker ps -qf name=ensayadero_db) \
  psql -U supabase_admin -d postgres -c \
  "update public.profiles set platform_role='SUPERADMIN' where email='you@example.es';"
```

## 8. OAuth redirect URIs

If you enabled Google/Meta, set their authorized redirect URI to
`${PUBLIC_API_URL}/auth/v1/callback` in the provider console (see BOOTSTRAP.md
§5/§5b for the provider setup steps; only the redirect host differs).

---

## Updates

```bash
# rebuild changed images with a new TAG, then:
set -a; source prod.env; set +a
docker stack deploy -c docker-stack.yml ensayadero --with-registry-auth
```

- New migrations: rebuild `migrate` and redeploy — the job reruns and applies only
  the new files.
- Edited `docker/gateway.conf`, `docker/db-init.prod.sh` or any
  `docker/mail-templates/*.html`: bump `CONFIG_VERSION` in `prod.env` (Swarm
  configs are immutable) before redeploying. Note `db-init.prod.sh` only runs
  on a **fresh** database volume.
- Roll back a service: `docker service rollback ensayadero_<service>`.

## Backups

```bash
# dump
docker exec $(docker ps -qf name=ensayadero_db) \
  pg_dump -U supabase_admin -d postgres -Fc > ensayadero-$(date +%F).dump
```

Restore with `pg_restore` against the `db` container. The data lives in the
`ensayadero_pgdata` volume on the labelled node — include it in your backup plan.

## Teardown

```bash
docker stack rm ensayadero
# data persists in the pgdata volume; remove it explicitly if intended:
# docker volume rm ensayadero_pgdata
```

---

## Quick checklist

- [ ] `docker swarm init` + label the DB node (`ensayadero_db=true`)
- [ ] `prod.env` filled (DB/JWT/realtime secrets, ANON/SERVICE keys, SMTP, VAPID)
- [ ] images built (app with build-args, functions, migrate) — pushed if multi-node
- [ ] `docker stack deploy` → all services running, `migrate` job OK
- [ ] realtime tenant aligned
- [ ] TLS proxy in front; DNS for app + api
- [ ] login + promote SUPERADMIN
