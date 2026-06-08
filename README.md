# Ensayadero — Theatre rehearsal planner

PWA for planning rehearsals around the group's availability. Each member paints their
availability on a calendar; the instructor sees the combined heatmap and schedules
sessions with required/optional participants. Push + email notifications.

## Architecture (cloud cost ~€0)

| Piece | Service | Tier |
|-------|---------|------|
| Frontend PWA | Cloudflare Pages | free |
| DB + Auth + API + RLS | Supabase | free |
| Scheduled jobs | pg_cron + Edge Functions | free |
| Email | Resend | free (3k/month) |
| Push | Web Push VAPID | free |
| Infra as code | Terraform (`infra/`) | — |

Key design decisions:
- **D1** Global per-user availability; sessions confirmed in any group reduce the
  availability shown in the others (without revealing the origin).
- **D2** Superadmin sees only structure, never availability.
- **D3** Role (`INSTRUCTOR`/`ACTOR`) per group membership; `SUPERADMIN` at platform level.
- **D4** Full isolation between groups.
- **D5** Open registration (Google, Facebook/Meta, or email+password); access to each
  group is controlled by its join code/link and email invitations.

## Structure

```
app/        React + Vite + PWA frontend (vite-plugin-pwa)
supabase/   SQL migrations (schema + RLS), Edge Functions, seed
infra/      Terraform: Supabase, Cloudflare Pages + DNS, GitHub secrets
```

## Local development setup

Requirements: Docker + make. **No Supabase CLI** — the whole stack is docker compose
(Postgres with pg_cron, GoTrue, PostgREST, nginx gateway, Edge Function on Deno, frontend).

```bash
make up           # everything: app http://localhost:5173, API :54321, db :54322
make seed-users   # test users (password123) + demo group
make logs         # logs
make reset        # DB from scratch (migrations + seed)
make help         # remaining commands
```

Demo users: `admin@local.test` (superadmin), `directora@local.test` (instructor),
`actor1..3@local.test`. The UI offers email/password sign-in, Google, and Facebook;
sign in locally with the demo password (`password123`). You can enable real Google
locally via `.env` (see `.env.example`). Activation and recovery emails are caught by
mailpit at http://localhost:54324.

## Infra provisioning (Terraform)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in
terraform init && terraform apply
```

### Manual steps (not automatable with TF)

1. **Google OAuth client** — [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)
   (moved out of *APIs & Services → Credentials* in 2025/2026) → create OAuth client
   (Web). Redirect URI: output `google_oauth_redirect_uri`
   (`https://<ref>.supabase.co/auth/v1/callback`). Copy id/secret to tfvars and re-apply.
   Then **Audience → Publish app → In production** (else login is limited to test users).
2. **Meta/Facebook OAuth** (optional, Instagram login path) — create a Meta app, add
   Facebook Login, set the same redirect URI, copy App ID/Secret to tfvars. See BOOTSTRAP.
3. **Tokens** — Supabase access token, Cloudflare API token, GitHub token → tfvars.
4. **Resend** — add the domain in the dashboard, copy the DNS records to
   `resend_dkim_records`, re-apply, verify. Create an API key → tfvars.
5. **VAPID keys** — `npx web-push generate-vapid-keys`; public to the
   `VITE_VAPID_PUBLIC_KEY` variable (GitHub vars), private to Edge Functions secrets:
   `supabase secrets set VAPID_PRIVATE_KEY=...`
6. **Superadmin** — after the first login, in the SQL editor:
   `update profiles set platform_role='SUPERADMIN' where email='...';`

## Deploy

Push to `main` → GitHub Actions: tests → migrations + Edge Functions (Supabase CLI)
→ build → Cloudflare Pages (wrangler).

## Free tier limitations (assumed)

- A free Supabase project is **paused after ~1 week without activity**; real weekly use
  keeps it alive. Possible mitigation: external pg_cron ping or upgrade.
- DB 500 MB, 50k auth MAU, Edge Functions 500k invocations/month — plenty for theatre groups.
