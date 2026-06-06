# 08 · Deployment

Target cost ~€0 (free tier). Infrastructure as code with Terraform;
non-automatable steps documented in `BOOTSTRAP.md` (repo root).

## Production components

| Piece | Service | Plan |
|-------|---------|------|
| Frontend PWA | Cloudflare Pages | free |
| DB + Auth + API + RLS + Edge | Supabase | free |
| Scheduled jobs | pg_cron + Edge Function | free |
| Email | Resend | free (3k/mo) |
| Push | Web Push (VAPID) | free |

## Terraform (`infra/`)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in
terraform init && terraform apply
```

Provisions:
- `supabase_project` + `supabase_settings` (auth, Google OAuth, redirect URLs).
- Cloudflare `pages_project` + domain + DNS (app CNAME + Resend records).
- GitHub Actions secrets/variables (tokens, project ref, public URLs).

Local state by default; can be moved to HCP Terraform (commented in
`versions.tf`).

## CI/CD (`.github/workflows/deploy.yml`)

On push to `main`:
1. **test** — typecheck + vitest.
2. **migrate** — `supabase link` + `supabase db push` + Edge Functions deploy.
3. **deploy-frontend** — `npm run build` + `wrangler pages deploy` to Cloudflare.

## Manual steps (summary of `BOOTSTRAP.md`)

Not automatable by Terraform:
1. Domain on Cloudflare (nameservers).
2. Tokens → `terraform.tfvars` (Supabase, Cloudflare, GitHub).
3. **Google OAuth client** (Console): redirect URI = output
   `google_oauth_redirect_uri` (`https://<ref>.supabase.co/auth/v1/callback`).
4. **Resend**: add domain, copy DNS records to `resend_dkim_records`, verify,
   create API key; `supabase secrets set RESEND_API_KEY/EMAIL_FROM`.
5. **VAPID**: `npx web-push generate-vapid-keys`; public in GH var
   `VITE_VAPID_PUBLIC_KEY`, private in Edge Functions secrets.
6. `VITE_SUPABASE_ANON_KEY` in GitHub variables.
7. Push to `main` → deploy.
8. **Superadmin**: after your own login, `update profiles set
   platform_role='SUPERADMIN' where email='…'`.
9. **Delivery cron**: `cron.schedule('process-notifications', '* * * * *', …)`
   with `net.http_post` to the Edge Function (BOOTSTRAP §11).

## Free-tier limitations (assumed)
- Supabase free pauses the project after ~1 week of inactivity; the step-9 cron
  keeps it alive.
- DB 500 MB; 50k auth MAU; 500k Edge Function invocations/mo — plenty for theatre
  groups.
- Vercel discarded (Hobby forbids commercial use and limits crons) → Cloudflare
  Pages.

## OAuth — additional providers (not implemented)
Recommended to add **Magic Link** (email, no social account) and optionally
Microsoft/Discord/GitHub/Apple. Each social provider needs manual credentials
like Google. Pending.
