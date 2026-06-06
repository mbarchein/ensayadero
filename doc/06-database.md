# 06 · Base de datos

PostgreSQL (imagen `supabase/postgres`). Extensiones: `btree_gist`, `pg_cron`,
`pg_net`. RLS en todas las tablas públicas.

## Migraciones (orden)

| Fichero | Contenido |
|---------|-----------|
| `…000_init` | Enums, tablas núcleo, helpers de autorización, trigger de alta con gate de invitación (D5), vista de ocupación `busy_ranges`, RLS completo. |
| `…001_planner_notifications` | `group_busy_ranges`, triggers `notify_session_change` y `notify_participant_added`, `generate_reminders` + `cron.schedule`. |
| `…002_delete_account` | `delete_my_account()` (borra `auth.users`, cascada). |
| `…003_profile_phone` | `profiles.phone`. |
| `…004_open_create_and_archive` | `groups.created_by` + trigger creador→director; insert de grupos por autenticados; lectura de disponibilidad por co-miembros; sessions insert/update/delete por director o creador; tabla `session_archives`. |
| `…005_join_codes` | **Registro abierto** (quita el gate); `groups.join_code`/`join_enabled`; `join_by_code`, `regenerate_join_code`, `set_join_enabled`. |
| `…006_alnum_join_code` | `gen_join_code()` alfanumérico A-Z0-9. |
| `…007_join_code_no_io` | Alfabeto sin I/O (confunden con 1/0). |
| `…008_leave_group` | Política: borrar la propia membresía (abandonar). |
| `…009_only_directors_plan` | Revierte insert de sesiones a solo directores. |
| `…010_group_meta` | `groups.avatar_seed`; `update_group_meta(name, seed)`. |
| `…011_notify_location_change` | `notify_session_change` también ante cambio de **lugar**; payload con `old_location`; solo el cambio de hora reinicia respuestas. |
| `…012_profile_gender` | `profiles.gender` (`F`/`M`, check). |

## Funciones helper (RLS)
`is_superadmin(uid)`, `is_member(uid, gid)`, `is_instructor(uid, gid)` —
`stable security definer`, `search_path=public`.

## RPCs (security definer, con chequeo de rol)
| Función | Uso |
|---------|-----|
| `group_busy_ranges(gid, search)` | Ocupación por usuario del grupo en una ventana (D1), sin revelar sesión/grupo. Requiere ser miembro. |
| `busy_ranges(uid, search)` | Ocupación de un usuario (sesiones confirmadas en cualquier grupo). |
| `join_by_code(code)` | Une al usuario actual como ACTOR al grupo del código (si habilitado). |
| `regenerate_join_code(gid)` / `set_join_enabled(gid, enabled)` | Solo director. |
| `update_group_meta(gid, name, seed)` | Renombra/regenera avatar; solo director. |
| `delete_my_account()` | Borra la cuenta del usuario actual (cascada). |

## Triggers
- `on_auth_user_created` → `handle_new_user`: crea `profiles`, autoacepta
  invitaciones por email pendientes (tras D5', sin bloquear el alta).
- `on_group_created` → `handle_new_group`: añade al `created_by` como
  INSTRUCTOR.
- `on_session_change` → `notify_session_change`: genera notificaciones
  `SESSION_CONFIRMED` / `SESSION_CANCELLED` / `SESSION_CHANGED` (hora y/o lugar);
  el cambio de hora reinicia `response` a PENDING.
- `on_participant_added` → `notify_participant_added`: notifica al añadir alguien
  a una sesión ya confirmada.

## Jobs (pg_cron)
- `generate-reminders` (`*/15 * * * *`) → `generate_reminders()`: recordatorios
  24h (evita duplicados por sesión/usuario).
- `process-notifications` (manual, ver BOOTSTRAP §11): `net.http_post` a la Edge
  Function `send-notifications` cada minuto.

## Tipos de notificación (`notifications.type`)
`SESSION_CONFIRMED`, `SESSION_CANCELLED`, `SESSION_CHANGED`, `REMINDER`,
`INVITATION`. El `payload` jsonb lleva `session_id`, `title`, `location`,
`starts_at`, `ends_at`, `required`, y para cambios `old_starts_at`/`old_location`
(presentes solo si ese campo cambió → distingue hora/lugar/ambos).
