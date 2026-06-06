# Ensayo — Planificador de ensayos de teatro

PWA para planificar ensayos según disponibilidad del grupo. Cada miembro pinta su
disponibilidad en un calendario; el instructor ve el heatmap combinado y programa
sesiones con participantes obligatorios/opcionales. Notificaciones push + email.

## Arquitectura (coste cloud ~0 €)

| Pieza | Servicio | Tier |
|-------|----------|------|
| Frontend PWA | Cloudflare Pages | free |
| DB + Auth + API + RLS | Supabase | free |
| Jobs programados | pg_cron + Edge Functions | free |
| Email | Resend | free (3k/mes) |
| Push | Web Push VAPID | gratis |
| Infra as code | Terraform (`infra/`) | — |

Decisiones de diseño clave:
- **D1** Disponibilidad global por usuario; sesiones confirmadas en cualquier grupo
  descuentan disponibilidad visible en los demás (sin revelar origen).
- **D2** Superadmin ve solo estructura, nunca disponibilidades.
- **D3** Rol (`INSTRUCTOR`/`ACTOR`) por membresía de grupo; `SUPERADMIN` a nivel plataforma.
- **D4** Aislamiento total entre grupos.
- **D5** Registro solo por invitación (gate en trigger de DB).

## Estructura

```
app/        Frontend React + Vite + PWA (vite-plugin-pwa)
supabase/   Migraciones SQL (schema + RLS), Edge Functions, seed
infra/      Terraform: Supabase, Cloudflare Pages + DNS, secrets GitHub
```

## Setup desarrollo local

Requisitos: Node 22+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli), Terraform ≥1.9.

```bash
cp .env.example .env
cp app/.env.example app/.env.local
supabase start                 # stack local (Postgres, Auth, Studio en :54323)
# copiar anon key de `supabase status` a app/.env.local
cd app && npm install && npm run dev
```

O con docker compose: `docker compose up` (frontend) + `supabase start` (backend).

## Provisión de infra (Terraform)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # rellenar
terraform init && terraform apply
```

### Pasos manuales (no automatizables con TF)

1. **Google OAuth client** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → crear OAuth client (Web). Redirect URI: output `google_oauth_redirect_uri`
   (`https://<ref>.supabase.co/auth/v1/callback`). Copiar id/secret a tfvars y re-apply.
2. **Tokens** — Supabase access token, Cloudflare API token, GitHub token → tfvars.
3. **Resend** — añadir dominio en dashboard, copiar records DNS a `resend_dkim_records`,
   re-apply, verificar. Crear API key → tfvars.
4. **VAPID keys** — `npx web-push generate-vapid-keys`; pública a variable
   `VITE_VAPID_PUBLIC_KEY` (GitHub vars), privada a secrets de Edge Functions:
   `supabase secrets set VAPID_PRIVATE_KEY=...`
5. **Superadmin** — tras primer login, en SQL editor:
   `update profiles set platform_role='SUPERADMIN' where email='...';`

## Deploy

Push a `main` → GitHub Actions: tests → migraciones + Edge Functions (Supabase CLI)
→ build → Cloudflare Pages (wrangler).

## Limitaciones free tier (asumidas)

- Proyecto Supabase free se **pausa tras ~1 semana sin actividad**; uso semanal real
  lo mantiene vivo. Mitigación posible: ping pg_cron externo o upgrade.
- DB 500 MB, 50k MAU auth, Edge Functions 500k invocaciones/mes — sobra para grupos de teatro.
- Vercel descartado: plan Hobby prohíbe uso comercial y limita crons.
