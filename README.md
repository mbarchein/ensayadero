# Ensayadero — Theatre rehearsal planner

PWA for planning rehearsals around the group's availability. Each member paints their
availability on a calendar; the instructor sees the combined heatmap and schedules
sessions with required/optional participants. Push + email notifications.

## Architecture (cloud cost ~€0)

| Piece | Service | Tier |
|-------|---------|------|
| Frontend PWA | Vercel | free (Hobby) |
| DNS | Cloudflare | free (the domain lives in a CF zone) |
| DB + Auth + API + RLS | Supabase | free |
| Scheduled jobs | pg_cron + Edge Functions | free |
| Email | Resend | free (3k/month) |
| Push | Web Push VAPID | free |
| CAPTCHA | Cloudflare Turnstile | free |
| Infra as code | Terraform (`infra/`) | — |

Key design decisions:
- **D1** Global per-user availability; sessions confirmed in any group reduce the
  availability shown in the others (without revealing the origin).
- **D2** Superadmin sees only structure, never availability.
- **D3** Role (`INSTRUCTOR`/`ACTOR`) per group membership; `SUPERADMIN` at platform level.
- **D4** Full isolation between groups.
- **D5** Open registration (Google, Facebook/Meta, or email+password); access to each
  group is controlled by its join code/link and email invitations.
- **D-rls** The frontend talks to Supabase directly with the public anon key;
  authorization is enforced by Postgres Row Level Security (RLS) keyed on the
  signed user's `auth.uid()`. The `service_role` key is server-only (Edge
  Functions / CI). The only public endpoint is the `legal-info` Edge Function,
  gated by a server-side Turnstile check.
- **D-legal** Public legal pages (`/privacy`, `/legal`, `/cookies`). The
  controller/contact data is never in the JS bundle: privacy and legal-notice
  pages fetch it from the `legal-info` Edge Function only after a Turnstile check
  (anti-scraping). MIT licensed (`LICENSE`).

## Structure

```
app/        React + Vite + PWA frontend (vite-plugin-pwa)
supabase/   SQL migrations (schema + RLS), Edge Functions, seed
infra/      Terraform: Supabase, Vercel hosting, Cloudflare DNS/Turnstile, GitHub secrets
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
locally via `.env` (see `.env.example`). **All** local emails (auth activation /
recovery and the transactional notifications) are caught by mailpit at
http://localhost:54324.

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
3. **Tokens** — Supabase access token; Vercel API token + team/org id (frontend
   hosting); Cloudflare API token (DNS:Edit, Zone:Read, Turnstile:Edit, Single
   Redirect:Edit — **no** Pages scope anymore); GitHub token (classic `repo`
   or fine-grained with Secrets+Variables read/write) → tfvars.
4. **Resend** — add the domain in the dashboard, copy the DNS records to
   `resend_dkim_records`, re-apply, verify. Create an API key → tfvars.
5. **VAPID keys** — `npx web-push generate-vapid-keys`; public to the
   `VITE_VAPID_PUBLIC_KEY` variable (GitHub vars) **and** as the
   `VAPID_PUBLIC_KEY` Edge Function secret; private + subject to Edge Functions
   secrets: `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...`
6. **`APP_URL` Edge secret** — `supabase secrets set APP_URL=https://app.yourdomain.es`
   so notification emails and push deep-links point at the live app.
7. **Vercel project** — after the first `terraform apply`, in the Vercel
   dashboard disable Deployment Protection for production (else a login
   interstitial breaks the service worker / manifest).
8. **Superadmin** — after the first login, in the SQL editor:
   `update profiles set platform_role='SUPERADMIN' where email='...';`

Terraform also provisions the Vercel project + custom domain, the Cloudflare DNS
records (app CNAME → Vercel edge as **DNS-only**, the `_vercel` ownership TXT, and
the Resend records), a Cloudflare Turnstile widget (when `turnstile_enabled`), an
apex→app 301 redirect (Cloudflare Single Redirect ruleset), and all GitHub Actions
secrets **and** variables (including `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`,
`VITE_TURNSTILE_SITE_KEY`, `VITE_FACEBOOK_ENABLED`, `VITE_SUPABASE_URL` and
`VITE_APP_URL`). The Turnstile site/secret keys are derived from the widget (TF
outputs `turnstile_site_key` and `turnstile_secret_key`), not entered by hand. The
`turnstile_secret_key` output is also used to set the `legal-info` function's
`TURNSTILE_SECRET_KEY` secret. CI no longer touches Cloudflare (DNS/Turnstile are
Terraform-only).

## Deploy

Push to `main` → GitHub Actions (`paths-ignore` skips docs/infra/docker-only
changes): tests → migrations + Edge Functions (Supabase CLI) → build + deploy to
Vercel (`vercel pull/build/deploy --prebuilt --prod`; the `VITE_*` vars are baked
in at build time, so the Vercel project itself stores no env).

## Free tier limitations (assumed)

- A free Supabase project is **paused after ~1 week without activity**; real weekly use
  keeps it alive. Possible mitigation: external pg_cron ping or upgrade.
- DB 500 MB, 50k auth MAU, Edge Functions 500k invocations/month — plenty for theatre groups.
