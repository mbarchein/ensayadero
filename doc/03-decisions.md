# 03 · Design decisions

Decisions made during design and evolution. Lightweight ADR format. Revised ones
show the current version.

## Core (agreed at the start)

### D1 — Global per-user availability + cross-group busy
Availability is NOT per group: a single agenda per person
(`availabilities.user_id`, no `group_id`). A **confirmed** session in any group
discounts that slot from the availability shown in other groups, **without
revealing** which group or why.
- Why: reflects reality (a person has a single agenda), avoids double-booking
  across groups.
- How: `group_busy_ranges()` (security definer) returns busy ranges per user
  without exposing the originating session/group; the heatmap discounts them.

### D2 — Superadmin sees structure only
The superadmin sees groups, members, roles, sessions, invitations and stats, but
**never** individual availability.
- How: `availabilities` RLS policies include no superadmin bypass.

### D3 — Role per membership + platform layer
`INSTRUCTOR`/`ACTOR` live in `Membership` (per group). `USER`/`SUPERADMIN` in
`User` (platform). Independent layers; same person with different roles per
group; several directors per group.

### D4 — Full isolation between groups
Members, sessions, subgroups and notifications of one group don't cross to
another. Only crossing: the availability discount from D1.

### D5 — Invitation-only registration → **D5' Open registration**
- D5 (initial): sign-up required a pending email invitation (gate in the
  `handle_new_user` trigger).
- **D5' (current)**: once anyone could create groups and join by code, the gate
  no longer made sense. **Open** registration; pending email invitations are
  auto-accepted on sign-up (`handle_new_user`). Migration `20260607000005`.
  Group access is now controlled by the reusable join code/link/QR and by email
  invitations, not by a signup gate.

### D-auth — Auth methods and hardening
GoTrue with **Google OAuth**, **Meta/Facebook OAuth** (the supported route for
"Instagram" login — Supabase has no native Instagram provider) and **email +
password** with **email activation** (confirmation required) and **password
recovery**. Hardening: rate limits, password min length + HIBP leaked-password
check, single-use 15-min OTP links, neutral enumeration-resistant recovery
responses, and an optional **Cloudflare Turnstile** CAPTCHA (enabled when a site
key is configured). Account self-deletion via `delete_my_account` (GDPR).

## Infrastructure

### D-stack — Two deployment paths
Two supported paths (see `08-deployment.md`):
- **Managed (free tier)**: Supabase (DB+Auth+RLS+Edge) + Cloudflare Pages +
  Resend + Web Push, provisioned by Terraform in `infra/` (`BOOTSTRAP.md`). ~€0
  cost; free-tier limits assumed (pause on inactivity, 500MB).
- **Self-hosted on Docker Swarm**: the whole backend (Postgres, GoTrue,
  PostgREST, Realtime, Deno edge function, nginx gateway) plus the built PWA via
  `docker-stack.yml` + `docker/*.Dockerfile` (`DEPLOY.md`).

### D-iac — All infra with Terraform
`infra/` provisions everything reproducible: the Supabase project and
`supabase_settings` (auth — SMTP via Resend with `smtp_port` as a string,
`uri_allow_list` redirect allow-list, `rate_limit_verify`, optional Turnstile
captcha), Cloudflare Pages project + custom domain + DNS, an apex→app **301
redirect** (Cloudflare Single Redirect ruleset, `http_request_dynamic_redirect`),
and an optional **Turnstile widget** (`cloudflare_turnstile_widget`) whose
sitekey/secret are **derived** (no manual keys; TF outputs `turnstile_site_key`
and the sensitive `turnstile_secret_key`). It also creates **all** GitHub Actions
secrets **and** variables, including `VITE_SUPABASE_ANON_KEY` (from the
`supabase_apikeys` data source), `VITE_VAPID_PUBLIC_KEY`, `VITE_TURNSTILE_SITE_KEY`,
`VITE_FACEBOOK_ENABLED`, `VITE_SUPABASE_URL`, `VITE_APP_URL` and
`CLOUDFLARE_PROJECT_NAME`. The Cloudflare API token needs Pages/DNS/Zone plus
**Turnstile:Edit** and **Single Redirect:Edit** (Zone); the GitHub token needs
classic `repo` or fine-grained Secrets+Variables read/write. Non-automatable steps
(OAuth clients, tokens, Resend domain, VAPID, `legal-info` secrets) in
`BOOTSTRAP.md`.

### D-rls — Direct-to-Supabase with RLS as the trust boundary
The frontend talks to Supabase directly with the **public anon key**; all
authorization is enforced by Postgres **Row Level Security** keyed on `auth.uid()`
from the signed user JWT (helpers `is_member`/`is_instructor`/`is_superadmin`).
The `service_role` key is server-only (Edge Functions / CI). The only public
endpoint is the `legal-info` Edge Function, which gates itself with a server-side
Turnstile check.

### D-legal — Public legal pages, contact data out of the bundle
Public routes `/privacy`, `/legal` (aviso legal, LSSI-CE) and `/cookies`,
rendered by a generic `LegalDoc` component (`auth/LegalDoc.tsx`) from i18n and
linked from the login footer (middle-dot separated). The controller/contact data
(entity, tax id, address, privacy/contact emails) is **never** in the JS bundle:
privacy and legal notice fetch it at runtime from the **public** `legal-info`
Edge Function (`config.toml`: `verify_jwt = false`), which verifies a Cloudflare
Turnstile token server-side and returns the values from its **own** secrets
(`LEGAL_ENTITY`, `LEGAL_TAX_ID`, `LEGAL_ADDRESS`, `PRIVACY_EMAIL`,
`CONTACT_EMAIL`, `TURNSTILE_SECRET_KEY`) — anti-scraping. The cookie policy holds
no personal data and shows no captcha.

### D-local — Full local stack in docker-compose (no Supabase CLI)
Postgres (supabase image with pg_cron/pg_net), GoTrue, PostgREST, Realtime, nginx
gateway (emulates Kong), Edge Function in Deno, mailpit (mail catcher), migration
runner, Vite frontend. All auth methods work locally; emails (activation,
recovery, notifications) are caught by mailpit at `:54324`.

### D-realtime — Live updates via Supabase Realtime
Supabase **Realtime** websockets push table changes (`sessions`,
`session_participants`, `availabilities`, `notifications`, `memberships`) to
clients; the `useRealtime` hook invalidates the affected react-query keys.
Delivery respects RLS (each client only receives rows it can read). Replaces the
earlier focus-refetch-only approach.

## Product / UX (evolution)

| Decision | Summary |
|----------|---------|
| D-create-open | Any user creates a **group** (becomes director) and, initially, rehearsals. Later reverted: **only directors schedule** (`20260607000009`). |
| D-availability-read | To let a member schedule, availability read was widened to co-members; with the revert to directors-only, read remains co-member scoped (needed for the director's heatmap). |
| D-archive | **Per-user** archiving (hides only for you) of cancelled/past sessions (`session_archives`). |
| D-join | Easy invite: reusable **group code** (alphanumeric A-Z0-9 **without I/O** to avoid confusion with 1/0), `/join/:code` link, QR and bulk email. Links/codes are **open** (whoever has them joins); the director can regenerate/disable. |
| D-copy | "Repeat every week" (recurrence) replaced by **copy the week to N following weeks** (explicit copy, not RRULE). |
| D-preferred-out | "Preferred" state removed from painting; only available/unmarked. |
| D-autosave | Availability saved with autosave (600ms debounce) on gesture end, no button. |
| D-past | Past slots dimmed and non-editable; back navigation limited to 6 weeks. |
| D-avatar | Deterministic geometric avatar per group (DiceBear "shapes"), with regenerable `avatar_seed` (director). |
| D-pronoun | Optional pronoun (F/M) that only adapts the role label (actress/actor, directora/director). Used for nothing else. |
| D-icons | Action iconography with `lucide-react`. |
| D-clear-guard | Removing availability over a scheduled rehearsal opens a modal with details and an option to remove only the selected part or the whole rehearsal slot. The warning runs on **gesture end** (not `confirm()` inside the gesture, which swallowed `pointerup`). |
| D-notify-change | Notifications distinguish time / location / both changes; a location-only change does not reset responses. |
| D-term-programar | In the Spanish UI, "Planificar" → "Programar" (tab/title). The `CONFIRMED` state shows as "Programado"/"Scheduled". Code (role `INSTRUCTOR`, RPCs, `planner.*` i18n keys) unchanged. |
| D-group-nav | Group navigation stopped being chip tabs: **buttons** "Programar" (CalendarPlus, director only) and "Miembros" (Users). The redundant "Ensayos" chip → title above the list. |
| D-planner-bg | In the planner, cells with a rehearsal have their own **background** (violet=scheduled, amber=draft) plus a left border, to stand out from the availability color. |
| D-invite-disabled | Disabling the join code hides the code and all actions (share/copy/QR/email/regenerate); only a note and the re-enable toggle remain. |
| D-back-consistent | The "back" link sits tight above the title inside `<header>` in every view (same spacing). |
| D-promote-icons | Role change button with icon: `UserCog` (make director), `UserMinus` (make actor). |
| D-agenda-views | The week grid (`WeekGrid`/`AvailabilityPage`) is **read-only** (scroll only). The day header is a **carousel of day-buttons**: tap a day to open an editable single-day view; a corner button returns to the week; horizontal swipe on the header changes week (replacing the old prev/next selector). Editing availability happens **only** in day view. Rehearsal cells in week view show the group avatar. Day hour range is **09:00–22:00** (`SLOTS_PER_DAY=26`, derived from `DAY_START_HOUR`/`DAY_END_HOUR`/`SLOT_MINUTES`). |
| D-attendance-collapse | Once a user answers, the Going/Can't-make-it buttons collapse to a "Voy/No voy" badge + a "Change" button (session detail and the agenda `ParticipationCard`). |
| D-upcoming-card | Upcoming card leads with group avatar+name, then title, then time; shows a going/declined/pending tally that opens a "Convocados" modal (full list, sorted by response then name); border green (attending) / red (declined). |
| D-cancel-modal | Cancelling a rehearsal uses the in-app modal, not native `confirm()`. |
| D-facebook-gate | The Facebook/Meta login button is hidden unless configured (`VITE_FACEBOOK_ENABLED`, set by Terraform from `facebook_oauth_client_id`). |
| D-leave-confirm | Leave group relabeled "Salir del grupo" (WhatsApp-style `LogOut` icon), red/danger styling, bold irreversible warning, requires typing "SALIR" to confirm. |

## Relevant modeling decisions
- Time ranges as `tstzrange` + GiST indexes; overlaps with `&&`.
- Availability recurrence with RRULE + `exception_dates`, materialized on read
  (not on save).
- Session states as enum; transitions trigger notifications via trigger.
