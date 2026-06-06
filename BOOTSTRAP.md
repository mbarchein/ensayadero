# BOOTSTRAP — Pasos manuales para poner Ensayo en producción

Todo lo demás está automatizado (Terraform + GitHub Actions). Estos pasos requieren
intervención humana porque los proveedores no exponen API/Terraform para ellos, o
porque implican secretos que debes generar tú.

Orden recomendado: seguir las secciones de arriba a abajo.

---

## 0. Prerequisitos locales

```bash
# Herramientas
node >= 22, docker, terraform >= 1.9
# Supabase CLI
npm install -g supabase   # o brew install supabase/tap/supabase
```

## 1. Cuentas necesarias (crear si no existen)

| Servicio | URL | Plan |
|----------|-----|------|
| Supabase | https://supabase.com | Free |
| Cloudflare | https://dash.cloudflare.com | Free (el dominio debe estar en una zona CF) |
| Resend | https://resend.com | Free |
| Google Cloud | https://console.cloud.google.com | Free (solo OAuth) |
| GitHub | repo del proyecto | Free |

## 2. Dominio en Cloudflare

1. Comprar/transferir dominio (ej. `ensayoapp.es`) y añadirlo como zona en Cloudflare.
2. Apuntar nameservers del registrador a los de Cloudflare.
3. Anotar **Account ID** (dashboard, sidebar derecha de la zona).

## 3. Tokens de API → `infra/terraform.tfvars`

```bash
cd infra && cp terraform.tfvars.example terraform.tfvars
```

| Variable | Dónde se genera |
|----------|-----------------|
| `supabase_access_token` | https://supabase.com/dashboard/account/tokens → "Generate new token" |
| `supabase_org_id` | Dashboard → org settings → slug de la organización |
| `cloudflare_api_token` | https://dash.cloudflare.com/profile/api-tokens → Custom token con permisos: **Cloudflare Pages: Edit**, **DNS: Edit**, **Zone: Read** (zona del dominio) |
| `cloudflare_account_id` | Paso 2.3 |
| `github_token` | https://github.com/settings/tokens → classic, scopes `repo` (incluye secrets) |
| `github_owner` / `github_repo` | Crear repo vacío en GitHub y poner aquí owner/nombre |
| `domain` / `app_subdomain` | Tu dominio del paso 2 |

## 4. Primer `terraform apply` (parcial)

Google OAuth aún no existe — usar placeholders en `google_oauth_client_id/secret`:

```bash
cd infra
terraform init
terraform apply
```

Anota outputs: `supabase_project_ref`, `supabase_url`, `google_oauth_redirect_uri`.

## 5. Google OAuth client (manual — Google no lo expone vía Terraform)

1. https://console.cloud.google.com → crear proyecto (o reutilizar).
2. **APIs & Services → OAuth consent screen**: tipo *External*, nombre "Ensayo",
   dominios autorizados: tu dominio. Publicar (no hace falta verificación para
   scopes básicos email/profile).
3. **Credentials → Create credentials → OAuth client ID**: tipo *Web application*.
   - Authorized JavaScript origins: `https://app.tudominio.es` y `http://localhost:5173`
   - Authorized redirect URIs: **valor del output `google_oauth_redirect_uri`**
     (`https://<project-ref>.supabase.co/auth/v1/callback`)
4. Copiar Client ID y Client Secret a `terraform.tfvars` → `terraform apply` de nuevo.

## 6. Resend (email)

1. https://resend.com/domains → **Add domain** → tu dominio.
2. Resend muestra records DNS (DKIM TXT, SPF TXT, MX). Copiarlos a
   `resend_dkim_records` en `terraform.tfvars` → `terraform apply`.
3. En Resend pulsar **Verify** (tarda minutos tras propagación DNS).
4. https://resend.com/api-keys → crear API key → `resend_api_key` en tfvars →
   `terraform apply` (la sube como secret de GitHub Actions).
5. Subirla también a Edge Functions:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx --project-ref <project-ref>
   supabase secrets set EMAIL_FROM="Ensayo <notificaciones@tudominio.es>" --project-ref <project-ref>
   ```
6. La misma `resend_api_key` configura el SMTP de Auth (Terraform lo aplica en
   `supabase_settings`): correos de **activación de cuenta** y **recuperación de
   contraseña** del registro email+password. Sin ella esos correos no se envían.

## 7. Claves VAPID (Web Push)

```bash
npx web-push generate-vapid-keys
```

- **Pública** → GitHub → repo → Settings → Secrets and variables → Actions →
  **Variables** → `VITE_VAPID_PUBLIC_KEY` (y a `app/.env.local` para dev).
- **Privada** → secrets de Edge Functions:
  ```bash
  supabase secrets set VAPID_PRIVATE_KEY=xxx --project-ref <project-ref>
  supabase secrets set VAPID_SUBJECT=mailto:admin@tudominio.es --project-ref <project-ref>
  ```

## 8. Variable de frontend restante

GitHub → Variables de Actions: `VITE_SUPABASE_ANON_KEY` = anon key del proyecto
(Supabase dashboard → Settings → API). `VITE_SUPABASE_URL` y `VITE_APP_URL` ya
las creó Terraform.

## 9. Primer deploy

```bash
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

GitHub Actions: tests → migraciones + Edge Functions → build → Cloudflare Pages.
Verificar en `https://app.tudominio.es`.

## 10. Bootstrap del superadmin

1. Entrar en la app y hacer login con Google con **tu cuenta**.
   El registro es abierto: cualquiera puede crear cuenta.
2. Supabase dashboard → SQL editor:
   ```sql
   update public.profiles
   set platform_role = 'SUPERADMIN'
   where email = 'you@example.com';
   ```
3. A partir de aquí: crear grupos desde `/admin` e invitar instructores. El
   registro sigue abierto; el acceso a cada grupo se controla por su código/enlace
   e invitaciones por email.

## 11. Programar recordatorios (una vez, SQL editor)

`pg_cron` y `pg_net` se activan por migración, pero el *schedule* referencia la URL
del proyecto y la service key — crear manualmente:

```sql
select cron.schedule(
  'process-notifications',
  '* * * * *',  -- cada minuto
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

(Sustituir `<project-ref>` y `<SERVICE_ROLE_KEY>` — dashboard → Settings → API.)

## 12. Mantener vivo el free tier (opcional)

Supabase free pausa proyectos tras ~1 semana sin tráfico. El cron del paso 11 ya
genera actividad de DB suficiente. Si aun así se pausa: dashboard → Restore, o
considerar upgrade a Pro (25 $/mes).

---

## Checklist rápido

- [ ] Dominio en Cloudflare, nameservers OK
- [ ] tfvars con todos los tokens
- [ ] `terraform apply` inicial
- [ ] Google OAuth client + redirect URI + re-apply
- [ ] Resend: dominio verificado + API key + secrets Edge Functions
- [ ] VAPID: pública en GH vars, privada en Edge Functions secrets
- [ ] `VITE_SUPABASE_ANON_KEY` en GH vars
- [ ] push a main → deploy verde
- [ ] login propio + promoción a SUPERADMIN
- [ ] cron `process-notifications` creado
