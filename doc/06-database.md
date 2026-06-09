# 06 · Database

PostgreSQL (`supabase/postgres` image). Extensions: `btree_gist`, `pg_cron`,
`pg_net`. RLS on every public table.

## Migrations (order)

| File | Contents |
|------|----------|
| `…000_init` | Enums, core tables, authorization helpers, sign-up trigger with invitation gate (D5), `busy_ranges` view, full RLS. |
| `…001_planner_notifications` | `group_busy_ranges`, triggers `notify_session_change` and `notify_participant_added`, `generate_reminders` + `cron.schedule`. |
| `…002_delete_account` | `delete_my_account()` (deletes `auth.users`, cascade). |
| `…003_profile_phone` | `profiles.phone`. |
| `…004_open_create_and_archive` | `groups.created_by` + creator→director trigger; group insert by authenticated; availability read by co-members; sessions insert/update/delete by director or creator; `session_archives` table. |
| `…005_join_codes` | **Open registration** (drops the gate); `groups.join_code`/`join_enabled`; `join_by_code`, `regenerate_join_code`, `set_join_enabled`. |
| `…006_alnum_join_code` | `gen_join_code()` alphanumeric A-Z0-9. |
| `…007_join_code_no_io` | Alphabet without I/O (confused with 1/0). |
| `…008_leave_group` | Policy: delete your own membership (leave). |
| `…009_only_directors_plan` | Reverts session insert to directors only. |
| `…010_group_meta` | `groups.avatar_seed`; `update_group_meta(name, seed)`. |
| `…011_notify_location_change` | `notify_session_change` also on **location** change; payload with `old_location`; only a time change resets responses. |
| `…012_profile_gender` | `profiles.gender` (`F`/`M`, check). |
| `…013_realtime` | Creates the `supabase_realtime` publication and adds `sessions`, `session_participants`, `availabilities`, `notifications`, `memberships` (delivery respects RLS). |
| `…014_account_deletion_fks` | FK rules so `delete_my_account` doesn't violate FKs: `invitations.created_by` → cascade; `sessions.created_by`, `audit_log.actor_id`, `groups.created_by` → set null (row kept, creator/actor cleared). |
| `…20260609000000_session_short_code` | `sessions.short_code` (unique 6-char base62) for `/s/<code>` share links; insert trigger (`security definer` so the uniqueness probe sees all rows under RLS) + collision-safe backfill. |
| `…20260609000001_group_avatar_image` | `groups.avatar_image` (cropped square uploaded avatar as inline data URL, <100KB check; NULL → generated avatar); `update_group_meta` gains a `new_image` param. |
| `…20260609000002_leave_group_director_handoff` | After-delete trigger on `memberships`: if a group keeps members but no INSTRUCTOR, one is promoted at random (safety net; the UI asks the leaving director to pick a successor). |

## Helper functions (RLS)
`is_superadmin(uid)`, `is_member(uid, gid)`, `is_instructor(uid, gid)` —
`stable security definer`, `search_path=public`.

## RPCs (security definer, with role checks)
| Function | Use |
|----------|-----|
| `group_busy_ranges(gid, search)` | Busy ranges per group member in a window (D1), without revealing session/group. Requires membership. |
| `busy_ranges(uid, search)` | Busy ranges of a user (confirmed sessions in any group). |
| `join_by_code(code)` | Joins the current user as ACTOR to the code's group (if enabled). |
| `regenerate_join_code(gid)` / `set_join_enabled(gid, enabled)` | Director only. |
| `update_group_meta(gid, name, seed)` | Rename/regenerate avatar; director only. |
| `delete_my_account()` | Deletes the current user's account (cascade). |

## Triggers
- `on_auth_user_created` → `handle_new_user`: creates `profiles`, auto-accepts
  pending email invitations (after D5', without blocking sign-up).
- `on_group_created` → `handle_new_group`: adds `created_by` as INSTRUCTOR.
- `on_session_change` → `notify_session_change`: generates `SESSION_CONFIRMED` /
  `SESSION_CANCELLED` / `SESSION_CHANGED` (time and/or location) notifications; a
  time change resets `response` to PENDING.
- `on_participant_added` → `notify_participant_added`: notifies when someone is
  added to an already-confirmed session.

## Jobs (pg_cron)
- `generate-reminders` (`*/15 * * * *`) → `generate_reminders()`: 24h reminders
  (avoids duplicates per session/user).
- `process-notifications` (manual, see BOOTSTRAP §11): `net.http_post` to the
  Edge Function `send-notifications` every minute.

## Notification types (`notifications.type`)
`SESSION_CONFIRMED`, `SESSION_CANCELLED`, `SESSION_CHANGED`, `REMINDER`,
`INVITATION`. The jsonb `payload` carries `session_id`, `title`, `location`,
`starts_at`, `ends_at`, `required`, and for changes `old_starts_at`/`old_location`
(present only if that field changed → distinguishes time/location/both).
