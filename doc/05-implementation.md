# 05 · Implementation (frontend)

## Structure of `app/src`

```
auth/          AuthContext (session + profile + refreshProfile), LoginPage, AuthCallback
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
lib/           supabase, types, ranges, slots, push, roleLabel, dateLocale, plays
i18n/          index.ts + es.json/en.json
sw.ts          service worker (precache + runtime cache + Web Push)
```

Data pattern: `react-query` with per-entity keys (`['session', id]`,
`['my-agenda']`, `['group-members', gid]`…); mutations invalidate the affected
keys. No custom global state. No realtime; updates land on refetch (window focus)
or after your own mutations.

## Core logic (tested)

### `lib/ranges.ts`
Parse/serialize Postgres `tstzrange` (`["2026… +00", …)`), `overlaps`,
`contains`, `subtract` (subtract busy ranges). Tests in `ranges.test.ts`.

### `lib/slots.ts`
Weekly grid: 30-min slots, 08:00–23:00 (`SLOT_MINUTES`, `DAY_START_HOUR`,
`SLOTS_PER_DAY`).
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
- Paint toggles available↔unmarked (preferred removed).
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
- Upcoming: ordered future list, pending notice, inline confirmation, "view in
  my schedule" (jumps to the rehearsal's week).

### Session (`SessionDetailPage`)
Header with group avatar+name; participants with a **role chip** (gendered) and a
**partial availability** note (the hours they can) or no-availability, computed
with `expandAvailability` ∩ range. Director actions: edit, confirm, cancel,
delete draft.

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
