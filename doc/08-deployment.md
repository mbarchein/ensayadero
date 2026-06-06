# 08 · Despliegue

Coste objetivo ~0 € (free tier). Infra como código con Terraform; pasos no
automatizables documentados en `BOOTSTRAP.md` (raíz del repo).

## Componentes en producción

| Pieza | Servicio | Plan |
|-------|----------|------|
| Frontend PWA | Cloudflare Pages | free |
| DB + Auth + API + RLS + Edge | Supabase | free |
| Jobs programados | pg_cron + Edge Function | free |
| Email | Resend | free (3k/mes) |
| Push | Web Push (VAPID) | gratis |

## Terraform (`infra/`)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # rellenar
terraform init && terraform apply
```

Provisiona:
- `supabase_project` + `supabase_settings` (auth, Google OAuth, redirect URLs).
- Cloudflare `pages_project` + dominio + DNS (CNAME app + records Resend).
- Secrets/variables de GitHub Actions (tokens, project ref, URLs públicas).

Estado local por defecto; se puede mover a HCP Terraform (comentado en
`versions.tf`).

## CI/CD (`.github/workflows/deploy.yml`)

Push a `main`:
1. **test** — typecheck + vitest.
2. **migrate** — `supabase link` + `supabase db push` + deploy de Edge Functions.
3. **deploy-frontend** — `npm run build` + `wrangler pages deploy` a Cloudflare.

## Pasos manuales (resumen de `BOOTSTRAP.md`)

No automatizables por Terraform:
1. Dominio en Cloudflare (nameservers).
2. Tokens → `terraform.tfvars` (Supabase, Cloudflare, GitHub).
3. **Google OAuth client** (Console): redirect URI = output
   `google_oauth_redirect_uri` (`https://<ref>.supabase.co/auth/v1/callback`).
4. **Resend**: añadir dominio, copiar records DNS a `resend_dkim_records`,
   verificar, crear API key; `supabase secrets set RESEND_API_KEY/EMAIL_FROM`.
5. **VAPID**: `npx web-push generate-vapid-keys`; pública en GH var
   `VITE_VAPID_PUBLIC_KEY`, privada en secrets de Edge Functions.
6. `VITE_SUPABASE_ANON_KEY` en variables de GitHub.
7. Push a `main` → deploy.
8. **Superadmin**: tras login propio, `update profiles set
   platform_role='SUPERADMIN' where email='…'`.
9. **Cron de entrega**: `cron.schedule('process-notifications', '* * * * *', …)`
   con `net.http_post` a la Edge Function (BOOTSTRAP §11).

## Limitaciones del free tier (asumidas)
- Supabase free pausa el proyecto tras ~1 semana sin actividad; el cron del paso
  9 lo mantiene vivo.
- DB 500 MB; 50k MAU auth; 500k invocaciones/mes de Edge Functions — sobra para
  grupos de teatro.
- Vercel descartado (Hobby prohíbe uso comercial y limita crons) → Cloudflare
  Pages.

## OAuth — providers adicionales (no implementados)
Recomendado añadir **Magic Link** (email, sin cuenta social) y opcionalmente
Microsoft/Discord/GitHub/Apple. Cada social requiere credenciales manuales como
Google. Pendiente.
