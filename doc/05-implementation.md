# 05 · Implementation (frontend)

## Structure of `app/src`

```
auth/          AuthContext (session + profile + refreshProfile), LoginPage
               (Google/Facebook/password + legal-policy footer links),
               SignupPage, ForgotPasswordPage, ResetPasswordPage, GoodbyePage,
               AuthCallback, Turnstile, LegalDoc (privacy/legal/cookies pages)
components/    Layout (bottom nav), ui.tsx (Button/Badge/Modal/Spinner/EmptyState)
features/
  groups/      HomePage, JoinPage, MembersPage, InvitePanel, EditGroupModal,
               GroupAvatar, useGroup
  availability/ AvailabilityPage, WeekGrid (generic paintable grid)
  planner/     PlannerPage (heatmap), CreateSessionModal (create/edit/cancel)
  sessions/    SessionsPage (list + nav), SessionDetailPage
  agenda/      UpcomingPage, ParticipationCard, useMyAgenda
  notifications/ NotificationsPage
  profile/     ProfilePage
  admin/       AdminPage (superadmin)
lib/           supabase, types, ranges, slots, push, roleLabel, dateLocale,
               plays, useRealtime (live updates → react-query invalidation)
i18n/          index.ts + es.json/en.json
sw.ts          service worker (precache + runtime cache + Web Push)
```

Data pattern: `react-query` with per-entity keys (`['session', id]`,
`['my-agenda']`, `['group-members', gid]`…); mutations invalidate the affected
keys. No custom global state. Live updates via Supabase **Realtime**
(`useRealtime`, mounted in `Layout`): table changes invalidate the matching keys;
react-query also refetches on window focus and after your own mutations.

## Auth (`auth/`)
- `LoginPage`: Google + (when configured) Meta/Facebook OAuth buttons
  (`signInWithOAuth`, Facebook gated on `VITE_FACEBOOK_ENABLED`) and an
  email+password form (`signInWithPassword`); friendly localized errors for
  invalid credentials / email-not-confirmed / rate limit. Footer links to the
  privacy / legal / cookie policies (middle-dot separated).
- `SignupPage`: open sign-up (`signUp`) with email activation; shows a
  "check your email" screen.
- `ForgotPasswordPage` / `ResetPasswordPage`: recovery. Forgot is
  enumeration-resistant (same neutral screen regardless of account existence,
  errors swallowed); Reset listens for `PASSWORD_RECOVERY` and `updateUser`.
- `Turnstile`: optional Cloudflare CAPTCHA, gated on `VITE_TURNSTILE_SITE_KEY`
  (`captchaEnabled`). Single-use token refreshed by remounting with a `key`.
- `GoodbyePage`: shown after account self-deletion.
- `LegalDoc`: generic legal page (privacy / aviso legal / cookies) rendered from
  an i18n namespace. On gated pages it fetches the controller/contact data from
  the `legal-info` Edge Function after a Turnstile check, so that data never ships
  in the bundle; the cookie page is ungated (`gated={false}`).

## Core logic (tested)

### `lib/ranges.ts`
Parse/serialize Postgres `tstzrange` (`["2026… +00", …)`), `overlaps`,
`contains`, `subtract` (subtract busy ranges). Tests in `ranges.test.ts`.

### `lib/slots.ts`
Weekly grid: 30-min slots, 09:00–22:00 (`SLOT_MINUTES=30`, `DAY_START_HOUR=9`,
`DAY_END_HOUR=22`, `SLOTS_PER_DAY=26` derived).
- `expandAvailability(av, start, end)` — materializes one-off and recurring
  (RRULE) availabilities within a window, applying `exception_dates`.
- `weekGrid(avs, monday)` — `[day][slot]` matrix of a user's state.
- `heatmap(users, monday)` — per cell: `available` (free after subtracting
  `busy`, D1), `preferred`, `busy` (painted but busy with another session).
- `fullCoverageRanges(grid, required, monday)` — contiguous slots where all
  required people overlap.
Tests in `slots.test.ts` (rrule expansion, D1 discount, coverage).

### `WeekGrid.tsx`
Reusable grid (painting or display). Pointer Events for mouse+touch
(`touch-action: none`). The "painting" flag is a **ref** (not React state)
because the `pointermove` handler runs synchronously after `pointerdown` and a
`setState` wouldn't be applied yet (it caused only the first cell to be painted).
`setPointerCapture` wrapped in try/catch. Past slots dimmed and non-editable
(`isPast`).

### Availability (`AvailabilityPage`)
- **Two view modes**: the week grid is **read-only** (scroll only); the day
  header is a carousel of day-buttons — tap a day to open an editable **single-day
  view**, a corner button returns to the week, and horizontal swipe on the header
  changes week (replacing the old prev/next selector). Editing is only possible in
  day view. Week-view rehearsal cells show the group avatar.
- Paint (in day view) toggles available↔unmarked (preferred removed).
- **Autosave** with 600ms debounce on gesture end; an edit counter re-saves if
  strokes arrive during an in-flight save.
- Per-week persistence: deletes one-off availability overlapping the week and
  reinserts the painted blocks (contiguous ranges).
- **Copy to N weeks** (modal) instead of recurrence.
- **Clear week**: one-off out; recurring → adds the 7 days as exceptions.
- Overlay of convened rehearsals over the slots (group bold + name), border by
  response (green/red/amber) and a lucide icon.
- **Guard**: removing availability over a scheduled rehearsal opens a modal with
  the rehearsal details and options (only the selected part / the whole slot),
  each option showing its start–end time. The warning runs on gesture end.

### Planner (`PlannerPage` + `CreateSessionModal`)
- Weekly heatmap with people-selection chips; intensity by % available; border
  if 100% of required. Cells with a rehearsal use a distinct **background**
  (violet=scheduled, amber=draft).
- Dragging selects consecutive slots; the detail shows chips of
  available/busy/unavailable (own chip highlighted "(tú)").
- `CreateSessionModal` creates or edits: default title "<group> d-M", scene,
  location, start time + duration (derived from the drag), required/optional
  participants; red/amber warnings if outside availability; reconciles
  participants (add/remove/upsert) on edit; cancel (confirmed→CANCELLED with
  notification, draft→delete).
- Overlay of the week's sessions in the grid + editable list. Edit button only
  for the creator or the director. Opening via `?d=&edit=<id>` link.

### Group view (`SessionsPage`)
Header (back + avatar + name + edit group). Navigation via **buttons**
("Programar" director, "Miembros"), not tabs. "Ensayos" title above the upcoming
list; collapsible past/cancelled with a per-card archive button.

### Agenda (`useMyAgenda`, `UpcomingPage`, `ParticipationCard`)
- `useMyAgenda`: my participations (non-cancelled, non-archived) with all
  participants for the tally; `respond` mutation. `tallyResponses` counts
  going/not-going/pending and total.
- Upcoming: ordered future list; cards lead with group avatar+name, then title,
  then time; border green (attending) / red (declined). The going/declined/pending
  tally opens a "Convocados" modal (full list, sorted by response then name).
  Inline confirmation that **collapses to a "Voy/No voy" badge + "Change" button**
  once answered; "view in my schedule" jumps to the rehearsal's week.

### Session (`SessionDetailPage`)
Header with group avatar+name; participants with a **role chip** (gendered) and a
**partial availability** note (the hours they can) or no-availability, computed
with `expandAvailability` ∩ range. The attendance buttons collapse to a "Voy/No
voy" badge + "Change" button once answered. Director actions: edit, confirm,
cancel (in-app modal), delete draft. Sharing a rehearsal uses the short link
`/s/<short_code>` (6-char code on `sessions`); `ShortLinkPage` resolves it for
members and, if logged out, stashes the code and resumes after login (same
pattern as `/join/:code`).

### Invite (`InvitePanel`, `JoinPage`)
Group code, link (Web Share API + copy), QR (canvas), regenerate /
enable-disable, bulk email. When the code is **disabled**, the code and actions
are hidden; only the note and re-enable toggle remain. `JoinPage` joins by code;
if there's no session, it stashes the code and resumes after login
(`AuthCallback`).

## PWA (`sw.ts`, `vite.config.ts`)
- `injectManifest`: asset precache, runtime `NetworkFirst` for `/rest/v1/`
  (offline reads), SPA navigation with `/auth/` denylist.
- Web Push: `push` shows a notification; `notificationclick` focuses/opens the
  URL.
- `lib/push.ts` subscribes (VAPID) and stores in `push_subscriptions`.

## i18n
`i18next` + language detection, fallback `es`. Plurals (`_one/_other`).
`lib/roleLabel.ts` resolves the role label by pronoun (`roles.INSTRUCTOR_F`…).
Dates with dynamic locale (`lib/dateLocale.ts`). Spanish UI uses "Programar".

## Tests
`vitest` over pure logic (`ranges`, `slots`): 17 cases. The UI was verified with
Playwright during development (not in the repo).
