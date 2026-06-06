# 04 · Arquitectura

## Diagrama

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  PWA (React+Vite+TS)      │  HTTPS │  Supabase                   │
│  - Tailwind, lucide       │───────▶│  - GoTrue (Auth/OAuth)      │
│  - @tanstack/react-query  │        │  - PostgREST (REST + RLS)   │
│  - Workbox SW + Web Push  │        │  - Postgres (pg_cron/pg_net)│
│  - i18next (es/en)        │        │  - Edge Functions (Deno)    │
└──────────────────────────┘        └─────────────────────────────┘
        │                                   │            │
   Cloudflare Pages                    Resend (email)  Web Push (VAPID)
        │                                   ▲
   GitHub Actions (CI/CD) ─ migraciones ────┘ (Edge Function entrega)
```

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3 |
| Estado/datos | @tanstack/react-query; sin store global |
| Routing | react-router-dom 6 |
| PWA | vite-plugin-pwa (injectManifest), Workbox, SW propio (`src/sw.ts`) |
| Auth | Supabase GoTrue, OAuth Google (password solo dev) |
| API | PostgREST con Row Level Security |
| DB | PostgreSQL 15 (imagen supabase: `btree_gist`, `pg_cron`, `pg_net`) |
| Jobs | pg_cron (recordatorios) → pg_net → Edge Function |
| Email | Resend (Edge Function) |
| Push | Web Push estándar (VAPID), sin Firebase |
| Avatares | DiceBear «shapes» (cliente) |
| QR | qrcode (cliente) |
| Infra | Terraform; Cloudflare Pages; GitHub Actions |

## Modelo de datos (núcleo)

```
profiles(id↔auth.users, email, name, phone, gender F|M, avatar_url, platform_role)
groups(id, name, archived_at, created_by, join_code, join_enabled, avatar_seed)
memberships(user_id, group_id, role INSTRUCTOR|ACTOR)            PK(user,group)
invitations(id, group_id, email, role, token, expires_at, accepted_at, created_by)
availabilities(id, user_id, time_range tstzrange, kind, rrule, exception_dates[])
subgroups(id, group_id, name) · subgroup_members(subgroup_id, user_id)
sessions(id, group_id, title, scene, location, time_range tstzrange,
         status DRAFT|CONFIRMED|CANCELLED, created_by, updated_at)
session_participants(session_id, user_id, required, response)    PK(session,user)
session_archives(user_id, session_id, archived_at)               PK(user,session)
notifications(id, user_id, group_id, type, payload jsonb, read_at,
              sent_email_at, sent_push_at)
notification_preferences(user_id, event_type, channel)
push_subscriptions(id, user_id, endpoint, keys jsonb)
audit_log(id, actor_id, action, target_type, target_id, created_at)
```

Claves de diseño:
- `tstzrange` + GiST (`availabilities_user_range`, `sessions_group_range`).
- `availabilities` **sin** `group_id` (D1).
- Enums Postgres para roles, estados y respuestas.

## Seguridad (RLS)

RLS activado en todas las tablas. Patrón: funciones helper `is_member`,
`is_instructor`, `is_superadmin` (security definer, `search_path=public`).

Resumen de políticas:
- **profiles**: el propio, co-miembros de grupo y superadmin (estructura).
- **groups**: miembros y superadmin leen; cualquier autenticado inserta
  (creador→director por trigger); superadmin gestiona.
- **memberships**: visibles en el grupo + superadmin; instructor gestiona;
  cualquiera borra **su propia** membresía (abandonar).
- **invitations**: instructor del grupo + superadmin.
- **availabilities**: dueño CRUD; **co-miembros** leen (para el heatmap);
  superadmin **sin** política (D2).
- **sessions**: miembros leen, superadmin lee; insertan **directores**
  (`is_instructor` + `created_by=auth.uid()`); editan/borran director o creador.
- **session_participants**: visibles en el grupo; gestiona instructor o creador;
  el participante actualiza su propia `response`.
- **session_archives / notification_preferences / push_subscriptions**: solo el
  dueño.
- **notifications**: solo el destinatario (select/marcar leído).
- **audit_log**: solo superadmin lee; escritura desde service role.

Operaciones que necesitan saltarse el scoping usan **RPC security definer** con
chequeo explícito de rol: `join_by_code`, `regenerate_join_code`,
`set_join_enabled`, `update_group_meta`, `delete_my_account`, `group_busy_ranges`.

## Flujo de notificaciones

1. Trigger `notify_session_change` (INSERT/UPDATE de `sessions`) y
   `notify_participant_added` insertan filas en `notifications`.
2. `generate_reminders` (pg_cron */15) crea recordatorios 24h.
3. La Edge Function `send-notifications` (invocada por pg_cron y por la app tras
   confirmar/cancelar) entrega email (Resend) y Web Push (VAPID) según
   `notification_preferences`, y marca `sent_email_at`/`sent_push_at`.

## Zonas horarias
Todo en UTC en DB (`tstzrange`/`timestamptz`). El cliente formatea en local con
`date-fns`; los emails formatean en `Europe/Madrid`.
