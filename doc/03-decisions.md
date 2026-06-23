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

**One account per email, any method.** GoTrue auto-links identities that share a
**verified** email, so signing in with Google, Facebook or email+password on the
same address always lands on the same account. OAuth-only users (no password yet)
can **set a password** from the profile (`updateUser({ password })` adds the email
identity); the signup screen shows a hint — linking to login — for an email
already registered via OAuth (GoTrue obfuscates that case, so the hint is static).

## Infrastructure

### D-stack — Two deployment paths
Two supported paths (see `08-deployment.md`):
- **Managed (free tier)**: Supabase (DB+Auth+RLS+Edge) + Vercel (frontend) +
  Cloudflare (DNS/Turnstile) + Resend + Web Push, provisioned by Terraform in
  `infra/` (`BOOTSTRAP.md`). ~€0 cost; free-tier limits assumed (pause on
  inactivity, 500MB).
- **Self-hosted on Docker Swarm**: the whole backend (Postgres, GoTrue,
  PostgREST, Realtime, Deno edge function, nginx gateway) plus the built PWA via
  `docker-stack.yml` + `docker/*.Dockerfile` (`DEPLOY.md`).

### D-iac — All infra with Terraform
`infra/` provisions everything reproducible: the Supabase project and
`supabase_settings` (auth — SMTP via Resend with `smtp_port` as a string,
`uri_allow_list` redirect allow-list, `rate_limit_verify`, optional Turnstile
captcha), the **Vercel** project + custom domain (`vercel_project`,
`vercel_project_domain`; deployment protection pinned off), the Cloudflare DNS
zone records (app **DNS-only** CNAME to Vercel's edge, the `_vercel` ownership
TXT, the Resend records) and an apex→app **301 redirect** (Cloudflare Single
Redirect ruleset, `http_request_dynamic_redirect`), plus an optional **Turnstile
widget** (`cloudflare_turnstile_widget`) whose sitekey/secret are **derived** (no
manual keys; TF outputs `turnstile_site_key` and the sensitive
`turnstile_secret_key`). It also creates **all** GitHub Actions secrets **and**
variables, including `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`,
`VITE_SUPABASE_ANON_KEY` (from the `supabase_apikeys` data source),
`VITE_VAPID_PUBLIC_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_FACEBOOK_ENABLED`,
`VITE_SUPABASE_URL` and `VITE_APP_URL`. The Cloudflare API token needs DNS/Zone
plus **Turnstile:Edit** and **Single Redirect:Edit** (no Pages scope — CI never
touches Cloudflare); the Vercel token is team-scoped; the GitHub token needs
classic `repo` or fine-grained Secrets+Variables read/write. Non-automatable steps
(OAuth clients, tokens, Resend domain, VAPID, `APP_URL`/`legal-info` secrets,
Vercel protection-off) in `BOOTSTRAP.md`.

### D-vercel — Frontend on Vercel, DNS stays on Cloudflare
The frontend moved from **Cloudflare Pages to Vercel** (static Vite build shipped
by CI with `vercel build` + `vercel deploy --prebuilt`). Cloudflare keeps the DNS
zone and Turnstile; the app host is a **DNS-only** CNAME to Vercel's edge so
Vercel terminates TLS (proxying it would stack two CDNs and break cert issuance).
Vercel Deployment Protection is pinned **off** for production — its login
interstitial would break the service worker and manifest fetches of a public PWA.
On Hobby only static hosting is used (no server functions, no Vercel crons; all
scheduling stays in Supabase pg_cron), keeping it free. (This reverses the earlier
"Vercel discarded → Cloudflare Pages" note.)

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
| D-upcoming-card | Upcoming card leads with group avatar+name, then time (sessions have no title); shows a going/declined/pending tally that opens a "Convocados" modal (full list, sorted by response then name); border green (attending) / red (declined). |
| D-cancel-modal | Cancelling a rehearsal uses the in-app modal, not native `confirm()`. |
| D-facebook-gate | The Facebook/Meta login button is hidden unless configured (`VITE_FACEBOOK_ENABLED`, set by Terraform from `facebook_oauth_client_id`). |
| D-leave-confirm | Leave group relabeled "Salir del grupo" (WhatsApp-style `LogOut` icon), red/danger styling, bold irreversible warning, requires typing "SALIR" to confirm. |
| D-session-pages | The create/edit session form is no longer a modal: it's its own routed pages (`/g/:gid/planner/new`, `…/sessions/:id/edit`) backed by a shared `SessionForm` + `useSessionGrid`. Time is set by **start + end time inputs** (end-time replaced the duration chips); arrows carry the hour when stepping. Creating returns to the group view. |
| D-sessions-list | The group/upcoming session lists bucket by **Today / Tomorrow / This week / Next week / Month** with a calendar date block and an attendance dots+counts glance (`SessionCard`). A list/month **`ViewToggle`** switches to a swipeable **`MonthCalendar`** (3-panel carousel, sliding month label, past-day shading, weekday header, tap-on-pointerup to avoid the swipe race). |
| D-session-detail | Session detail: plain-text location (no maps link), the date card opens the agenda and flashes the rehearsal, attendee responses as colored dots + per-list tally, and "Recordar a pendientes" is a full-width button with a confirm modal listing the pending participants (calls `nudge_pending_participants`). Add-to-calendar via an `.ics` export (`lib/ics.ts`). |
| D-onboarding | First-login `/welcome` wizard (name, pronoun, email preferences, availability pitch, PWA install step) gated by `profiles.onboarded_at`; rolled out to **every** existing user once (doubles as the announcement of the new settings). |
| D-whatsnew | Cross-device "what's new" callouts (`FeatureCallout`) driven by `profiles.seen_features` + `mark_feature_seen`, decoupled from onboarding and reinstall-proof (unlike the localStorage `Tip`). Used to announce push, the PWA install entry and the profile photo. |
| D-reminder-optin | Reminder **emails** are opt-in for new accounts (signup seeds a `REMINDER`/`PUSH` preference); in-app/device alerts unaffected. The profile page exposes per-event email opt-outs. |
| D-member-events | New notification types: `MEMBER_JOINED` (every other member when someone joins — instructors can bulk-summon the newcomer to upcoming sessions via `add_member_to_future_sessions`), `MEMBER_PROMOTED` (when made director), and `NUDGE` (remind-pending). |
| D-profile-photo | Users set a personal photo (gallery or camera, round crop → data URL in `profiles.avatar_url`); the identity card avatar carries a pencil edit badge opening a modal with the large avatar + change/camera/remove. Falls back to an initials avatar. |
| D-pwa-install | In-app install: an `InstallBanner`/button (captured `beforeinstallprompt`), a dedicated wizard install step and a profile install section; iOS standalone metas; the SW auto-updates on window focus; a stable shell height keeps the bottom nav from vanishing on auto-reload. |
| D-push-toggle | Web Push can be enabled **and** disabled per device from the profile; the device-alerts section hides until VAPID is configured. Push notifications deep-link to the rehearsal / group members / group home by type. |
| D-notif-archive | Notifications are archived by **swiping right** (hover icon on desktop), with mark-all-read / archive-all header actions and an archived-toggle; the calm empty state shows a random theatre fragment. Archived rows stay in the table (`archived_at`). |
| D-group-image-input | The group image upload accepts gallery **or** camera on touch devices and **drag & drop** on the card; avatar/photo changes autosave. |
| D-invite-delivery | Pending invitations show their per-invite email delivery state (`email_sent_at` / `email_send_error`) and can be **resent or deleted** from the members page. |
| D-auth-affordances | Login/signup gained a password visibility toggle and clearer, localized rejection reasons. |
| D-admin-recent | The superadmin user list shows newest users first, with their join date. |
| D-member-gallery | The members page has a gallery ("orla") action: a modal grid of every member's avatar large with name + role below, sorted directors-first then alphabetically by name. |
| D-login-any | Any login method maps to the **same account when the email matches** (GoTrue verified-email auto-linking). OAuth-only users **set a password** from the profile to also use email login; signup shows a static hint (linking to login) for an email already registered via OAuth. See **D-auth**. |
| D-profile-per-field | Profile fields save **independently**: name & phone have inline Save buttons, the **pronoun auto-saves** on selection, and the global save button is gone. Each section is a `<fieldset>` with an inset legend. Push is a **toggle** (extends D-push-toggle). |
| D-member-guest | The new-member policy option "opcional" → **"Añadirlo como invitado"** (subtext "Recibe la invitación y decide si asiste"); the policy box gained an explanatory intro (with **nuevos miembros** in bold). |
| D-leave-drop-future | Leaving/being removed from a group **drops the user's participation in future sessions** (trigger `drop_future_participations`); past sessions keep the row as attendance history. |
| D-orphan-profile | Session views **skip participants whose profile RLS hides** (e.g. an ex-member left on a past session — `profiles` embeds null) via `visibleParticipants`, instead of crashing on `profiles.name`. |
| D-didyouknow | Home shows a rotating **"¿Sabías que…?"** tips card (`DidYouKnow`): prev/next + counter, each tip links to its section, **per-group** facts render **clickable group thumbnails** (director-only facts gated to instructor groups), and the last-seen tip is remembered per user so a reload resumes at the **next** one. |
| D-declined-dot | The "No voy" (declined) calendar dot darkened to `red-600` so it reads apart from the amber "pending" dot. |

## Relevant modeling decisions
- Time ranges as `tstzrange` + GiST indexes; overlaps with `&&`.
- Availability recurrence with RRULE + `exception_dates`, materialized on read
  (not on save).
- Session states as enum; transitions trigger notifications via trigger.
