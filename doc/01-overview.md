# 01 · Overview

## What it is

Installable web app (PWA) for a theatre group to plan rehearsals. It solves the
scheduling problem: each person marks when they can attend, and the director
schedules rehearsals over the slots where the needed people overlap.

## Roles

Two **independent** role layers:

### Platform role (attribute of `User`)
- **USER** — normal user.
- **SUPERADMIN** — sees the whole structure (groups, members, users), manages
  groups and users. Does **not** see individual availability (decision D2). Gets
  no group notifications except for their own memberships.

### Group role (attribute of `Membership`, per group)
- **INSTRUCTOR** (UI: "Director/Directora") — schedules and creates/edits/cancels
  rehearsals, invites and manages group members, edits the group name/avatar.
- **ACTOR** (UI: "Actor/Actriz") — paints their availability, sees and confirms
  attendance to rehearsals they are convened to.

The same person can be director in one group and actor in another. A group can
have several directors.

## Glossary

| Term | Meaning |
|------|---------|
| Group | Company/production. Isolated tenant (D4). |
| Availability | Slots when a user can rehearse. **Global** per user (D1), not per group. |
| Rehearsal / Session | Event with title, scene, location, time range, participants and status. |
| Session status | `DRAFT`, `CONFIRMED` (shown "Scheduled"/"Programado"), `CANCELLED`. |
| Participant | User convened to a session; `required` or optional; response PENDING/ACCEPTED/DECLINED. |
| Heatmap | Planner weekly grid: intensity = number of people available per slot. |
| Join code | Short reusable code to join the group (link/QR/manual). |

## Typical walkthrough

1. **Sign-up**: open registration (revised D5'). Anyone signs up with Google,
   Meta/Facebook, or email + password (with email activation); or arrives via an
   invitation link/code to a group.
1b. **Onboarding**: first login opens the `/welcome` wizard (name, pronoun, email
   preferences, availability pitch, optional PWA install) until
   `profiles.onboarded_at` is set; every existing user runs it once.
2. **Create group**: any user creates a group and becomes its director.
3. **Invite**: the director shares a code/link/QR or invites by email (bulk).
4. **Availability**: each member paints their weekly availability (autosave).
5. **Schedule**: the director opens the heatmap, filters people, drags a slot and
   creates the rehearsal (required/optional), warnings if a required person has
   no availability.
6. **Confirm**: confirming the session sends push + email to the convened.
7. **Respond**: each convened person marks "Going / Can't" (Upcoming tab, My
   schedule, or the session detail). Once answered, the buttons collapse to a
   "Going / Can't make it" badge plus a "Change" button. The Upcoming card leads
   with the group avatar+name, shows a going/declined/pending tally that opens a
   "Convocados" modal, and is bordered green (attending) or red (declined).
8. **Changes**: time/location changes and cancellations re-notify (cancelling
   uses an in-app confirmation modal).

## Screens (routes)

| Route | Screen |
|-------|--------|
| `/login`, `/auth/callback` | Sign in (Google, Meta/Facebook when configured, email+password); footer links to the legal policies |
| `/signup` | Create account (email + password, email activation) |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/welcome` | First-login onboarding wizard (gated by `profiles.onboarded_at`) |
| `/goodbye` | Confirmation after self-deleting the account |
| `/privacy`, `/legal`, `/cookies` | Public legal pages (privacy / aviso legal LSSI-CE / cookies) |
| `/` | Home: my groups (avatar+role), pending, create/join group, install + "what's new" callouts |
| `/availability` | My schedule: availability calendar + overlaid rehearsals |
| `/upcoming` | Upcoming rehearsals (all groups) + confirmation; list or month-calendar view |
| `/notifications` | Alerts (swipe-to-archive, mark/archive-all, archived toggle) |
| `/profile` | Profile: name, phone, pronoun, photo, email opt-outs, device push, install, delete account |
| `/join`, `/join/:code` | Join a group by code |
| `/s/:code` | Short share link → resolves to a session |
| `/g/:groupId` | Group: rehearsal list (buckets / month view) + nav buttons |
| `/g/:groupId/planner` | Heatmap and scheduling (director) |
| `/g/:groupId/sessions/new`, `/g/:groupId/sessions/:id/edit` | Create / edit a session (routed pages, director) |
| `/g/:groupId/members` | Members + invitation panel (director) |
| `/g/:groupId/members/:memberId/sessions` | Summon a member to upcoming sessions (director) |
| `/g/:groupId/sessions/:id` | Session detail |
| `/admin` | Superadmin panel (structure, newest users first) |
