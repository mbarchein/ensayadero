# 04 · Architecture

## Diagram

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  PWA (React+Vite+TS)      │  HTTPS │  Supabase                   │
│  - Tailwind, lucide       │───────▶│  - GoTrue (Auth/OAuth)      │
│  - @tanstack/react-query  │   WS   │  - PostgREST (REST + RLS)   │
│  - Workbox SW + Web Push  │◀──────▶│  - Realtime (websockets)    │
│  - i18next (es/en)        │        │  - Postgres (pg_cron/pg_net)│
│  - Realtime (useRealtime) │        │  - Edge Functions (Deno)    │
└──────────────────────────┘        └─────────────────────────────┘
        │                                   │            │
   Cloudflare Pages                    Resend (email)  Web Push (VAPID)
        │                                   ▲
   GitHub Actions (CI/CD) ─ migrations ─────┘ (Edge Function delivers)
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3, lucide-react |
| State/data | @tanstack/react-query; no global store |
| Routing | react-router-dom 6 |
| PWA | vite-plugin-pwa (injectManifest), Workbox, own SW (`src/sw.ts`) |
| Auth | Supabase GoTrue: Google OAuth, Meta/Facebook OAuth, email+password (activation + recovery); optional Turnstile CAPTCHA |
| API | PostgREST with Row Level Security |
| Realtime | Supabase Realtime websockets (`useRealtime` hook) |
| DB | PostgreSQL 15 (supabase image: `btree_gist`, `pg_cron`, `pg_net`) |
| Jobs | pg_cron (reminders) → pg_net → Edge Function |
| Email | Resend (Edge Function) |
| Push | Standard Web Push (VAPID), no Firebase |
| Avatars | DiceBear "shapes" (client) |
| QR | qrcode (client) |
| Infra | Managed: Terraform + Cloudflare Pages + GitHub Actions. Self-hosted: Docker Swarm (`docker-stack.yml`) |

## Data model (core)

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

Design keys:
- `tstzrange` + GiST (`availabilities_user_range`, `sessions_group_range`).
- `availabilities` has **no** `group_id` (D1).
- Postgres enums for roles, states and responses.

## Security (RLS)

RLS enabled on every table. Pattern: helper functions `is_member`,
`is_instructor`, `is_superadmin` (security definer, `search_path=public`).

Policy summary:
- **profiles**: self, group co-members and superadmin (structure).
- **groups**: members and superadmin read; any authenticated user inserts
  (creator→director via trigger); superadmin manages.
- **memberships**: visible within the group + superadmin; instructor manages;
  anyone deletes **their own** membership (leave).
- **invitations**: group instructor + superadmin.
- **availabilities**: owner CRUD; **co-members** read (for the heatmap);
  superadmin **no** policy (D2).
- **sessions**: members read, superadmin reads; **directors** insert
  (`is_instructor` + `created_by=auth.uid()`); director or creator edit/delete.
- **session_participants**: visible within the group; instructor or creator
  manages; the participant updates their own `response`.
- **session_archives / notification_preferences / push_subscriptions**: owner
  only.
- **notifications**: recipient only (select/mark read).
- **audit_log**: superadmin reads only; writes via service role.

Operations that must bypass scoping use **security-definer RPCs** with explicit
role checks: `join_by_code`, `regenerate_join_code`, `set_join_enabled`,
`update_group_meta`, `delete_my_account`, `group_busy_ranges`.

## Notification flow

1. Triggers `notify_session_change` (INSERT/UPDATE on `sessions`) and
   `notify_participant_added` insert rows into `notifications`.
2. `generate_reminders` (pg_cron */15) creates 24h reminders.
3. The Edge Function `send-notifications` (invoked by pg_cron and by the app
   after confirm/cancel) delivers email (Resend) and Web Push (VAPID) per
   `notification_preferences`, and stamps `sent_email_at`/`sent_push_at`.

## Data freshness (realtime)
Supabase **Realtime** websockets push changes on `sessions`,
`session_participants`, `availabilities`, `notifications` and `memberships`. The
`useRealtime` hook (mounted in `Layout`) invalidates the affected react-query
keys, so other users' changes appear live; delivery is filtered by RLS via the
user's JWT. react-query also refetches on window focus and after your own
mutations. Web Push delivers session changes as OS notifications regardless.

## Time zones
Everything in UTC in the DB (`tstzrange`/`timestamptz`). The client formats in
local time with `date-fns`; emails format in `Europe/Madrid`.
