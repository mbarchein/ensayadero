# 05 · Implementation (frontend)

## Structure of `app/src`

```
auth/          AuthContext (session + profile + refreshProfile), LoginPage
               (Google/Facebook/password, visibility toggle, legal footer links),
               SignupPage, ForgotPasswordPage, ResetPasswordPage, GoodbyePage,
               AuthCallback, Turnstile, LegalDoc (privacy/legal/cookies pages)
components/    Layout (bottom nav + active-tab indicator), Tip (first-visit hint),
               ui.tsx (Button/Badge/Modal[body portal]/Spinner/EmptyState/
               BackButton/InitialsAvatar/useBackClose)
features/
  groups/      HomePage, NewGroupPage, EditGroupPage, AvatarPicker, JoinPage,
               MembersPage, InvitePanel, ConvokeMemberPage (bulk summon),
               GroupAvatar, useGroup
  availability/ AvailabilityPage, WeekGrid (generic paintable grid)
  planner/     PlannerPage (heatmap), NewSessionPage, EditSessionPage,
               SessionForm (shared create/edit form), useSessionGrid
  sessions/    SessionsPage (buckets + view toggle), SessionCard, MonthCalendar,
               ViewToggle, SessionDetailPage, ShortLinkPage
  agenda/      UpcomingPage, ParticipationCard, useMyAgenda
  notifications/ NotificationsPage
  onboarding/  WelcomePage (first-login wizard)
  pwa/         InstallBanner, installPrompt (beforeinstallprompt capture)
  whatsnew/    FeatureCallout (seen_features-driven "what's new")
  profile/     ProfilePage, AvatarEditor
  admin/       AdminPage (superadmin)
lib/           supabase, types, ranges, slots, push, ics, roleLabel, dateLocale,
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
  email+password form (`signInWithPassword`) with a password **visibility
  toggle**; friendly localized errors for invalid credentials /
  email-not-confirmed / rate limit. Footer links to the privacy / legal / cookie
  policies (middle-dot separated).
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
- **Two view modes**: the week grid is **read-only**; tapping a day in the
  header strip opens an editable **single-day view** (exit via the header X or by
  tapping the selected day again). Week changes by horizontal swipe on the header
  strip **or on the cells**: both drive a synced 3-panel carousel that shows the
  incoming week's real occupation (computed from already-loaded data); the hour
  column stays fixed. Tapping a rehearsal cell in week view opens its detail.
  Week-view rehearsal cells show the group avatar + initials (max 3); day-view
  cells show the group name. Arriving via "view in my agenda" (?d=&s=) scrolls to
  the rehearsal and blinks it once (the ?s param is consumed so back doesn't
  re-flash).
- Paint (in day view) toggles available↔unmarked (preferred removed).
- **Autosave** with 600ms debounce on gesture end; an edit counter re-saves if
  strokes arrive during an in-flight save.
- Per-week persistence: deletes one-off availability overlapping the week and
  reinserts the painted blocks (contiguous ranges).
- **Copy to N weeks** (modal) instead of recurrence.
- **Clear week**: one-off out; recurring → adds the 7 days as exceptions.
- Rehearsals render as enclosed boxes over the availability background
  (light-violet = available): 4px left stripe + 2px right edge + top/bottom on
  the block boundaries, colored by my response (violet=accepted,
  orange=unconfirmed, red=declined).
- **Guard**: removing availability over a scheduled rehearsal opens a modal with
  the rehearsal details and options (only the selected part / the whole slot),
  each option showing its start–end time. The warning runs on gesture end.

### Planner (`PlannerPage`, `SessionForm`, `NewSessionPage`/`EditSessionPage`)
- Weekly heatmap with people-selection chips; intensity by % available; border
  if 100% of required. Rehearsal cells are enclosed boxes (violet=scheduled,
  amber=draft; first slot shows the start time); tapping one in week view opens
  its detail. The week carousel shows real adjacent-week data (busy + sessions
  fetched over a 3-week window).
- Dragging selects consecutive slots; the detail shows chips of
  available/busy/unavailable (own chip highlighted "(tú)").
- Session creation/editing are **routed pages** (`/g/:gid/sessions/new`,
  `…/sessions/:id/edit`), not a modal: `NewSessionPage`/`EditSessionPage` wrap a
  shared `SessionForm` over `useSessionGrid`. Sessions have **no title** — they
  are identified by group + date/time everywhere (cards, notifications, email
  subjects, share text). Fields: comments, location, **start + end time inputs**
  (end-time replaced the duration chips; arrows carry the hour when stepping),
  required/optional participants; red/amber warnings if outside availability;
  reconciles participants (add/remove/upsert) on edit; cancel (confirmed→CANCELLED
  with notification, draft→delete). Creating returns to the group view.
- Overlay of the week's sessions in the grid + editable list. Edit only for the
  creator or the director. The planner deep-links to the edit page (`?edit=<id>`
  consumed on open so back returns correctly).

### Group view (`SessionsPage`, `SessionCard`, `MonthCalendar`, `ViewToggle`)
Header (back + avatar + name). Equal-width action **buttons** ("Programar"
director, "Miembros", "Editar" director), not tabs. A list/month **`ViewToggle`**
switches between:
- **List** — sessions bucketed by **Today / Tomorrow / This week / Next week /
  Month**, each `SessionCard` showing a calendar date block and an attendance
  dots+counts glance; rehearsals where I'm not summoned get a muted background.
- **Month** — `MonthCalendar`, a 3-panel swipe carousel (strip width 300%,
  translateX center, imperative drag, snap on release, `useLayoutEffect` recenter,
  keyed panels to avoid swap flicker). Sliding month/year label, past-day shading,
  weekday header, selection cleared on month change, tap detected on `pointerup`
  via `elementFromPoint`+`data-date` to avoid the swipe race. Reused in "Upcoming".

Collapsible past/cancelled with a per-card archive button.

### Agenda (`useMyAgenda`, `UpcomingPage`, `ParticipationCard`)
- `useMyAgenda`: my participations (non-cancelled, non-archived) with all
  participants for the tally; `respond` mutation. `tallyResponses` counts
  going/not-going/pending and total.
- Upcoming: list (bucketed by week) **or** the shared month-calendar view
  (`ViewToggle`); cards lead with group avatar+name, then time (with a small
  "view in my agenda" icon button); border green (attending) / red (declined). A
  right-floating block on the group-name line holds the "Voy/No voy" badge with
  the summoned count below (opens the "Convocados" modal — full list, "Yo"
  highlighted and always first). Pending rehearsals keep inline accept/decline
  buttons; responses are otherwise changed from the detail. The whole card opens
  the session detail.

### Session (`SessionDetailPage`)
Header with group avatar+name; **plain-text location** (no maps link); a date card
that opens the agenda and flashes the rehearsal (same `?d=&s=` pattern as
Upcoming). Participants with a **role chip** (gendered) and a **partial
availability** note (the hours they can) or no-availability, computed with
`expandAvailability` ∩ range; responses render as colored dots with a per-list
tally. Participants whose embedded `profiles` is null (RLS hides users you no
longer share a group with) are dropped via `lib/participants.visibleParticipants`
(same in `SessionCard`) — see **D-orphan-profile**. The declined dot is `red-600`
to read apart from the amber pending dot (`responseDotColor`, **D-declined-dot**). The attendance buttons collapse to a "Voy/No voy" badge + "Change" button
once answered (with a note the answer can change later). Director actions: edit,
confirm, cancel (in-app modal), delete draft, and a full-width **"Recordar a
pendientes"** that opens a confirm modal listing the pending participants and
calls `nudge_pending_participants`. Add-to-calendar via an `.ics` download
(`lib/ics.ts`). Sharing uses the short link `/s/<short_code>` (6-char code on
`sessions`); `ShortLinkPage` resolves it for members and, if logged out, stashes
the code and resumes after login (same pattern as `/join/:code`).

### Invite / members (`InvitePanel`, `JoinPage`, `MembersPage`, `ConvokeMemberPage`)
Group code, link (Web Share API + copy), QR (canvas), regenerate /
enable-disable, bulk email. When the code is **disabled**, the code and actions
are hidden; only the note and re-enable toggle remain. Pending invitations show
their **email delivery state** (`email_sent_at` / `email_send_error` → "sent on
X" / "never sent") and can be **resent or deleted**. A `MEMBER_JOINED`
notification lets a director jump to `ConvokeMemberPage` to **bulk-summon** the
newcomer to chosen upcoming sessions in one call
(`add_member_to_future_sessions`). A header action opens the **gallery ("orla")**
modal: a grid of every member's avatar large with name + role below, sorted
directors-first then alphabetically by name. `JoinPage` joins by code; if there's no
session, it stashes the code and resumes after login (`AuthCallback`).

### Group management (`NewGroupPage`, `EditGroupPage`, `AvatarPicker`)
Create/edit group are standalone pages (no modals). `AvatarPicker`: two
side-by-side cards — generated avatar (default, reroll dice) vs uploaded image
(on touch devices a gallery/camera chooser; the card also accepts **drag &
drop**; react-easy-crop square crop with bounded zoom/pan → 256px webp data URL
persisted in `groups.avatar_image`; the cropped image is cached so switching
modes doesn't force a re-upload). Avatar/photo changes **autosave**. On New Group
the avatar follows the typed name until a custom seed is rolled. Leaving a group
as the only director forces picking a successor in the leave modal (random
preselected); a DB trigger backs it up by promoting a random member if a group is
left with no director (and the promoted member gets a `MEMBER_PROMOTED`
notification). Home cards show member + upcoming-rehearsal (from today 00:00)
counters, plus the install and "what's new" callouts.

### Navigation & modals
`BackButton` is history-aware: `location.key !== 'default'` → `navigate(-1)`,
else the route's parent fallback. Every main tab header (agenda, upcoming,
notifications, profile) has one. The bottom nav shows an **active-tab indicator**.
`useBackClose` (used by `Modal` and the routed forms) pushes a history entry on
open so the device back button closes the overlay instead of leaving the page;
entries inherit react-router's `idx` and are consumed on UI close only when still
on top (StrictMode-safe, transition-based — no effect cleanup). `Modal` renders in
a **body portal**. First-visit `Tip` hints appear on every main view (localStorage,
resettable from the profile).

### Onboarding & "what's new"
- `WelcomePage` (`/welcome`): first-login wizard (name, pronoun, email
  preferences, availability pitch, optional PWA install step) shown until
  `profiles.onboarded_at` is set; rolled out once to every existing user.
- `FeatureCallout` (`features/whatsnew/`): cross-device "what's new" banner driven
  by `profiles.seen_features`; shows for any feature key the user hasn't dismissed
  and appends it via `mark_feature_seen` on dismiss (reinstall-proof, unlike the
  localStorage `Tip`). Used for push, the install entry and the profile photo.

### Notifications (`NotificationsPage`)
List of alerts; **swipe right to archive** (hover icon on desktop), header actions
to mark-all-read / archive-all, and an archived toggle. Notifications mark
themselves read on click and deep-link by type (session detail, group members,
group home). A calm empty state shows a random theatre fragment.

### Home (`HomePage`, `DidYouKnow`)
Greeting, pending-confirmations callout, the group cards (avatar, role, member &
upcoming counts), join/create actions, and the **"¿Sabías que…?"** rotating tips
card. `DidYouKnow` shows one tip with prev/next + a counter; global tips link to
their section, while **per-group** tips render up to four **clickable group
thumbnails** (each → that group's members/planner/edit…). Director-only tips are
hidden unless the user instructs some group. The last tip shown is stored per user
in `localStorage` (`dyk-last:<uid>`) so a reload/return advances to the next one.

### Profile (`ProfilePage`, `AvatarEditor`)
Sections are `<fieldset>`s with an inset `<legend>`. Fields save **per field**:
name & phone have inline **Save** buttons (enabled only when dirty), the pronoun
(inline segmented pills) **auto-saves** on selection, and there is no global save
button — one mutation patches just the touched column. A **password** section lets
OAuth-only users set a password (or any user change it; `updateUser({ password })`,
button reads "Crear"/"Cambiar" by whether an email identity exists — see
**D-login-any**). Plus the linked sign-in methods, **per-event email opt-outs**,
the device push **toggle** (hidden until VAPID is configured), the PWA install
section, and account deletion. `AvatarEditor` is the identity-card avatar with a
pencil edit badge; tapping it opens a modal showing the large current avatar plus
gallery / camera / remove (round crop → data URL in `profiles.avatar_url`,
initials fallback).

## PWA (`sw.ts`, `vite.config.ts`, `features/pwa/`)
- `injectManifest`: asset precache, runtime `NetworkFirst` for `/rest/v1/`
  (offline reads), SPA navigation with `/auth/` denylist. The SW checks for
  updates when the window regains focus; a stable shell height keeps the bottom
  nav from vanishing on auto-reload.
- Install: `installPrompt` captures `beforeinstallprompt`; `InstallBanner` (+ the
  home/wizard/profile entries) triggers it, with iOS standalone metas and an
  "add to home screen" hint where the prompt isn't available.
- Web Push: `push` shows a notification (monochrome status-bar badge);
  `notificationclick` focuses/opens the deep-link URL.
- `lib/push.ts` subscribes (VAPID) and stores in `push_subscriptions`; push can be
  **disabled** again per device from the profile.

## i18n
`i18next` + language detection, fallback `es`. Plurals (`_one/_other`).
`lib/roleLabel.ts` resolves the role label by pronoun (`roles.INSTRUCTOR_F`…).
Dates with dynamic locale (`lib/dateLocale.ts`). Spanish UI uses "Programar".

## Tests
- **`vitest`** over pure logic — `ranges`, `slots`, the `i18n/groupType` wording
  guard, and `lib/participants` (the null-profile filter, regression guard for the
  session-detail crash): 28 cases. Run with `npm test` in `app/`.
- **Playwright e2e** in `e2e/` (dockerized — `make e2e` brings the stack up, runs
  `docker/seed-e2e.sh`, then the suite in the Playwright image; nothing installed
  on the host). Logs in as the seeded users and covers home/did-you-know, profile
  (per-field save), group screens, members, planner, the personal screens
  (availability/upcoming/notifications/admin), the public auth pages, group
  creation/edit per type, user-switch, and the **null-profile session-detail
  regression** (a seeded orphan participant viewed as a non-superadmin director).
