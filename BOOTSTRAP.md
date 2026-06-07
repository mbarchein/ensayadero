# BOOTSTRAP — Manual steps to ship Ensayadero to production

Everything else is automated (Terraform + GitHub Actions). These steps need human
intervention because the providers don't expose an API/Terraform for them, or
because they involve secrets you must generate yourself.

Recommended order: follow the sections top to bottom.

---

## 0. Local prerequisites

```bash
# Tools
node >= 22, docker, terraform >= 1.9
# Supabase CLI
npm install -g supabase   # or brew install supabase/tap/supabase
```

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
| `cloudflare_api_token` | https://dash.cloudflare.com/profile/api-tokens → Custom token with permissions: **Cloudflare Pages: Edit**, **DNS: Edit**, **Zone: Read** (the domain's zone) |
| `cloudflare_account_id` | Step 2.3 |
| `github_token` | https://github.com/settings/tokens → classic, `repo` scopes (includes secrets) |
| `github_owner` / `github_repo` | Create an empty GitHub repo and put owner/name here |
| `domain` / `app_subdomain` | Your domain from step 2 |

## 4. First `terraform apply` (partial)

Google OAuth doesn't exist yet — use placeholders in `google_oauth_client_id/secret`:

```bash
cd infra
terraform init
terraform apply
```

Note the outputs: `supabase_project_ref`, `supabase_url`, `google_oauth_redirect_uri`.

## 5. Google OAuth client (manual — Google doesn't expose it via Terraform)

1. https://console.cloud.google.com → create a project (or reuse one).
2. **APIs & Services → OAuth consent screen**: type *External*, name "Ensayadero",
   authorized domains: your domain. Publish (no verification needed for the basic
   email/profile scopes).
3. **Credentials → Create credentials → OAuth client ID**: type *Web application*.
   - Authorized JavaScript origins: `https://app.yourdomain.es` and `http://localhost:5173`
   - Authorized redirect URIs: **value of the `google_oauth_redirect_uri` output**
     (`https://<project-ref>.supabase.co/auth/v1/callback`)
4. Copy the Client ID and Client Secret to `terraform.tfvars` → `terraform apply` again.

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
- **Open redirect**: `additional_redirect_urls` with exact paths, **no wildcards**
  (`*`/`**` would open a recovery-token leak). Don't add host wildcards.

Recommended manual steps (need an account/plan):

1. **CAPTCHA (Cloudflare Turnstile)** — the best defense against bots and
   volume-based enumeration. The frontend is **already wired** (Turnstile widget
   on login/signup/recovery, `options.captchaToken` passed through); it stays off
   until you provide keys:
   - Create a widget at https://dash.cloudflare.com/?to=/:account/turnstile.
   - **Secret key** → `turnstile_secret_key` in `terraform.tfvars` → `terraform
     apply` (Terraform enables `security_captcha_enabled` automatically when set).
   - **Site key** (public) → GitHub → Actions **Variables** →
     `VITE_TURNSTILE_SITE_KEY`. (Locally: `TURNSTILE_*` in `.env`, see `.env.example`.)
2. **Leaked passwords (HIBP)** — `password_hibp_enabled=true` in `terraform.tfvars`.
   Requires the Supabase **Pro plan**.

## 7. VAPID keys (Web Push)

```bash
npx web-push generate-vapid-keys
# no local Node.js? run it through Docker:
# docker run --rm node:22-alpine npx -y web-push generate-vapid-keys
```

- **Public** → GitHub → repo → Settings → Secrets and variables → Actions →
  **Variables** → `VITE_VAPID_PUBLIC_KEY` (and to `app/.env.local` for dev).
- **Private** → Edge Functions secrets:
  ```bash
  supabase secrets set VAPID_PRIVATE_KEY=xxx --project-ref <project-ref>
  supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.es --project-ref <project-ref>
  ```

## 8. Remaining frontend variable

GitHub → Actions Variables: `VITE_SUPABASE_ANON_KEY` = the project's anon key
(Supabase dashboard → Settings → API). `VITE_SUPABASE_URL` and `VITE_APP_URL` were
already created by Terraform.

## 9. First deploy

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
- [ ] VAPID: public in GH vars, private in Edge Functions secrets
- [ ] `VITE_SUPABASE_ANON_KEY` in GH vars
- [ ] push to main → green deploy
- [ ] own login + promotion to SUPERADMIN
- [ ] `process-notifications` cron created
