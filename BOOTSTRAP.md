# BOOTSTRAP — Manual steps to ship Ensayadero to production

This guide takes Ensayadero from an empty repo to a live production deployment on
the **managed stack**: the frontend on Cloudflare Pages and the backend on
Supabase (Postgres, Auth, API, Realtime, Edge Functions). The infrastructure is
provisioned by Terraform (`infra/`) and deployed by GitHub Actions on push.

> Prefer to self-host the whole backend instead of using Supabase/Cloudflare?
> See `DEPLOY.md` (Docker Swarm).

Most of the setup is automated, but a handful of steps **need you to do them by
hand** — either because the provider has no Terraform/API (creating an OAuth app,
verifying a domain) or because they involve **secrets you must generate yourself**
and paste into `infra/terraform.tfvars`. This document lists exactly those manual
steps, in the order you should do them. Follow the sections top to bottom; there's
a quick checklist at the end.

---

## 0. Local prerequisites

### Required

```bash
git
docker
terraform >= 1.9
```

### Optional (convenience)

Node.js and the Supabase CLI make a few commands shorter, but every
`node`/`npx`/`supabase` command below can run through Docker — so the required
tools above are enough.

```bash
node >= 22
npm install -g supabase            # or: brew install supabase/tap/supabase
```

Without them, run through Docker instead — or define these aliases once and use
`node` / `npx` / `supabase` verbatim in every command below:

```bash
alias node='docker run --rm -v "$PWD:/w" -w /w node:22-alpine node'
alias npx='docker run --rm -v "$PWD:/w" -w /w node:22-alpine npx -y'
alias supabase='docker run --rm -e SUPABASE_ACCESS_TOKEN node:22-alpine npx -y supabase'
```

(The `-v "$PWD:/w" -w /w` mounts the current directory so the containers can read
local files; `supabase` reads the token from your shell's `SUPABASE_ACCESS_TOKEN`,
so `export` it first.)

## 1. Required accounts (create if they don't exist)

| Service | URL | Plan |
|---------|-----|------|
| Supabase | https://supabase.com | Free |
| Cloudflare | https://dash.cloudflare.com | Free (the domain must be in a CF zone) |
| Resend | https://resend.com | Free |
| Google Cloud | https://console.cloud.google.com | Free (OAuth only) |
| GitHub | project repo | Free |

## 2. Domain in Cloudflare

1. Buy/transfer a domain (e.g. `ensayoapp.es`) and add it as a zone in Cloudflare.
2. Point the registrar's nameservers to Cloudflare's.
3. Note the **Account ID** (dashboard, right sidebar of the zone).

## 3. API tokens → `infra/terraform.tfvars`

```bash
cd infra && cp terraform.tfvars.example terraform.tfvars
```

| Variable | Where it's generated |
|----------|----------------------|
| `supabase_access_token` | https://supabase.com/dashboard/account/tokens → "Generate new token" |
| `supabase_org_id` | Dashboard → org settings → organization slug |
| `cloudflare_api_token` | https://dash.cloudflare.com/profile/api-tokens → **Create Custom Token** (permissions listed below the table) |
| `cloudflare_account_id` | Step 2.3 |
| `github_token` | https://github.com/settings/tokens (scopes/permissions listed below the table) |
| `github_owner` / `github_repo` | Create an empty GitHub repo and put owner/name here |
| `domain` / `app_subdomain` | Your domain from step 2 |

**`cloudflare_api_token`** — Custom Token permissions (each row is *scope → group → access*):

- **Account** → Cloudflare Pages → **Edit**
- **Account** → Turnstile → **Edit** (only if you enable CAPTCHA, step 6b)
- **Zone** → DNS → **Edit**
- **Zone** → Zone → **Read** (the domain's zone)
- **Zone** → Single Redirect → **Edit** (only if `redirect_root_to_app = true` — apex → app redirect)

**`github_token`** — pick one:

- **Classic PAT:** the `repo` scope (covers Actions secrets + variables).
- **Fine-grained PAT**, on the repo:
  - **Secrets:** Read and write
  - **Variables:** Read and write

  Otherwise `terraform apply` 403s on the secrets/variables endpoints.

## 4. First `terraform apply` (partial)

Google OAuth doesn't exist yet — use placeholders in `google_oauth_client_id/secret`:

```bash
cd infra
terraform init
terraform apply
```

Note the outputs: `supabase_project_ref`, `supabase_url`, `google_oauth_redirect_uri`.

## 5. Google OAuth client (manual — Google doesn't expose it via Terraform)

> Google moved OAuth setup out of *APIs & Services → Credentials* into the
> **Google Auth Platform** section (2025/2026). If you can't find "Credentials",
> that's why. Direct link: <https://console.cloud.google.com/auth/clients>

1. <https://console.cloud.google.com> → create a project (or reuse one).
2. **Google Auth Platform → Get started** (`/auth/overview`): app name "Ensayadero",
   user support email, **Audience: External**, contact email. This replaces the old
   "OAuth consent screen". Its sub-pages are *Branding*, *Audience*, and *Clients*.
3. **Google Auth Platform → Clients → Create client**: type *Web application*.
   - Authorized JavaScript origins: `https://app.yourdomain.es` and `http://localhost:5173`
   - Authorized redirect URIs: **value of the `google_oauth_redirect_uri` output**
     (`https://<project-ref>.supabase.co/auth/v1/callback`)
   - The **Client secret is shown only once, at creation** — copy it immediately.
4. **Google Auth Platform → Audience**: a new app starts in **Testing** mode, where
   only the listed test users can sign in. Click **Publish app → In production** to
   open login to everyone.
   - The scopes Supabase uses are **non-sensitive**, so app/scope verification is
     **not** required — any Google user can log in with no warning. Keep **Data
     Access** limited to these three:
     - `openid`
     - `userinfo.email`
     - `userinfo.profile`

     Adding a sensitive scope (Drive, Gmail, …) would force full verification.
   - Google may still show a *"your app requires verification"* banner — that is
     **brand verification** (name + logo display only) and does **not** block login.
     Ignore it, or remove the logo under **Branding** to clear it.
5. Copy the Client ID and Client Secret to `terraform.tfvars` → `terraform apply` again.

## 5b. Meta/Facebook OAuth — optional (Instagram login)

> Supabase has **no** native Instagram provider. Login with Instagram accounts is
> obtained through **Meta** (Facebook Login): it authenticates Meta accounts,
> covering users with linked Instagram and Facebook accounts. Leaving the
> `facebook_oauth_*` variables empty disables the provider.

1. https://developers.facebook.com → **My Apps → Create App** → type *Consumer*.
2. Add the **Facebook Login** product. (Optional: also add the **Instagram**
   product if you want to show the IG branding on the permission screen.)
3. **Facebook Login → Settings → Valid OAuth Redirect URIs**:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   (same value as the `google_oauth_redirect_uri` output).
4. **Settings → Basic**: copy the **App ID** and **App Secret** to `terraform.tfvars`
   (`facebook_oauth_client_id` / `facebook_oauth_client_secret`) → `terraform apply`.
5. For production, Meta requires the app in **Live** mode and review of the `email`
   permission (business verification). In *Development* mode only users with a role
   in the app (testers) can sign in.

## 6. Resend (email)

1. https://resend.com/domains → **Add domain** → your domain.
2. Resend shows DNS records (DKIM TXT, SPF TXT, MX). Copy them to
   `resend_dkim_records` in `terraform.tfvars` → `terraform apply`.
3. In Resend click **Verify** (takes a few minutes after DNS propagation).
4. https://resend.com/api-keys → create an API key → `resend_api_key` in tfvars →
   `terraform apply` (it uploads it as a GitHub Actions secret).
5. Also upload it to the Edge Functions:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx --project-ref <project-ref>
   supabase secrets set EMAIL_FROM="Ensayadero <notifications@yourdomain.es>" --project-ref <project-ref>
   ```
6. The same `resend_api_key` configures the Auth SMTP (Terraform applies it in
   `supabase_settings`): the **account activation** and **password recovery** emails
   for email+password registration. Without it those emails won't be sent.

## 6b. Hardening the auth forms

Terraform already applies (in `supabase_settings.auth`) the defenses that don't need
external accounts:

- **Anti-enumeration**: `/recover` responds the same whether or not the account
  exists, and with `mailer_autoconfirm=false` registration doesn't reveal existing
  emails. The frontend always shows the same neutral message. **Do not enable
  autoconfirm.**
- **Anti email-bombing**: `rate_limit_email_sent=10` emails/hour.
- **Single-use links with short expiry**: `mailer_otp_exp=900` (15 min).
- **Password policy**: `password_min_length=8`.
- **Open redirect**: `uri_allow_list` with exact paths, **no wildcards**
  (`*`/`**` would open a recovery-token leak). Don't add host wildcards.

Recommended manual steps (need an account/plan):

1. **CAPTCHA (Cloudflare Turnstile)** — the best defense against bots and
   volume-based enumeration. The frontend is **already wired** (Turnstile widget
   on login/signup/recovery, `options.captchaToken` passed through). Terraform
   creates the whole widget — no manual key handling:
   - Set `turnstile_enabled = true` in `terraform.tfvars` → `terraform apply`.
     Terraform creates the widget and derives the site key (→ the
     `VITE_TURNSTILE_SITE_KEY` build variable) and the secret (→
     `security_captcha_secret` in `supabase_settings`).
   - The Cloudflare token needs **Turnstile: Edit** (account level) — see step 3.
     (Locally for dev: `TURNSTILE_*` in `.env`, see `.env.example`.)
2. **Leaked passwords (HIBP)** — `password_hibp_enabled=true` in `terraform.tfvars`.
   Requires the Supabase **Pro plan**.

## 7. VAPID keys (Web Push)

```bash
npx web-push generate-vapid-keys
# no local Node.js? run it through Docker:
# docker run --rm node:22-alpine npx -y web-push generate-vapid-keys
# fully offline (no npm registry — e.g. behind a VPN/proxy where the container
# can't resolve DNS): pure node crypto, no download needed:
# node -e "const c=require('crypto');const{privateKey:k}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=k.export({format:'jwk'});console.log('Public :',Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'));console.log('Private:',j.d);"
```

- **Public** → `vapid_public_key` in `terraform.tfvars` → `terraform apply`
  (Terraform publishes it as the `VITE_VAPID_PUBLIC_KEY` build variable). Also add
  it to `app/.env.local` for local dev.
- **Private** → Edge Functions secrets:
  ```bash
  supabase secrets set VAPID_PRIVATE_KEY=xxx --project-ref <project-ref>
  supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.es --project-ref <project-ref>
  ```

## 8. GitHub Actions variables — automatic

Terraform creates every GitHub Actions variable the pipeline needs, nothing to do
by hand:

- `VITE_SUPABASE_URL`, `VITE_APP_URL` — from the project + domain.
- `VITE_SUPABASE_ANON_KEY` — read from the project via the `supabase_apikeys`
  data source (anon key is public).
- `VITE_VAPID_PUBLIC_KEY`, `VITE_TURNSTILE_SITE_KEY` — created when their
  `terraform.tfvars` values are set (steps 6b and 7).
- `CLOUDFLARE_PROJECT_NAME` — the Cloudflare Pages project name (`project_name`),
  read by the wrangler deploy step so `--project-name` always matches the project
  Terraform created. (A mismatch fails the deploy with *"Project not found"*.)
Legal document data (controller name, tax ID, address, contact emails) is **not**
in the bundle — to keep it away from scrapers it's served by the `legal-info` Edge
Function only after a server-side Turnstile check. Set it as Edge Function secrets:

```bash
supabase secrets set \
  LEGAL_ENTITY="Razón social S.L." LEGAL_TAX_ID="B12345678" \
  LEGAL_ADDRESS="Calle …, Ciudad" PRIVACY_EMAIL="privacidad@tudominio.es" \
  CONTACT_EMAIL="hola@tudominio.es" TURNSTILE_SECRET_KEY="0x…" \
  --project-ref <project-ref>
```

(`TURNSTILE_SECRET_KEY` is the same Turnstile secret; without it the gate is
disabled. Empty fields render as "—".)

## 9. First deploy

Make sure your last `terraform apply` succeeded first — the build/deploy reads the
GitHub Actions variables from step 8 (including `CLOUDFLARE_PROJECT_NAME`), so they
must exist *before* the pipeline runs, or it fails.

```bash
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

GitHub Actions: tests → migrations + Edge Functions → build → Cloudflare Pages.
Verify at `https://app.yourdomain.es`.

## 10. Superadmin bootstrap

1. Open the app and sign in with Google using **your account**.
   Registration is open: anyone can create an account.
2. Supabase dashboard → SQL editor:
   ```sql
   update public.profiles
   set platform_role = 'SUPERADMIN'
   where email = 'you@example.com';
   ```
3. From here on: create groups from `/admin` and invite instructors. Registration
   stays open; access to each group is controlled by its join code/link and email
   invitations.

## 11. Schedule reminders (once, SQL editor)

`pg_cron` and `pg_net` are enabled by migration, but the *schedule* references the
project URL and the service key — create it manually:

```sql
select cron.schedule(
  'process-notifications',
  '* * * * *',  -- every minute
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

(Replace `<project-ref>` and `<SERVICE_ROLE_KEY>` — dashboard → Settings → API.)

## 12. Keep the free tier alive (optional)

Supabase free pauses projects after ~1 week without traffic. The cron from step 11
already generates enough DB activity. If it still pauses: dashboard → Restore, or
consider upgrading to Pro ($25/month).

---

## Quick checklist

- [ ] Domain in Cloudflare, nameservers OK
- [ ] tfvars with all tokens
- [ ] Initial `terraform apply`
- [ ] Google OAuth client + redirect URI + re-apply
- [ ] Resend: domain verified + API key + Edge Functions secrets
- [ ] VAPID: public in tfvars (TF → GH var), private in Edge Functions secrets
- [ ] frontend `VITE_*` vars present in GH (Terraform creates them — verify)
- [ ] push to main → green deploy
- [ ] own login + promotion to SUPERADMIN
- [ ] `process-notifications` cron created
