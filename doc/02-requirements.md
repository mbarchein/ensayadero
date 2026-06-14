# 02 · Requirements

Status: ✅ implemented · 🟡 partial · ⬜ pending.

## Functional

### Authentication and access
- ✅ FR1. **Open** sign-up (revised D5'). Auth via GoTrue: Google OAuth,
  Meta/Facebook OAuth (the supported path for "Instagram" login — Supabase has no
  native Instagram provider), and email + password with **email activation**
  (confirmation required) and **password recovery**. Hardened: GoTrue rate limits,
  password min length + HIBP leaked-password check, single-use 15-min OTP links,
  enumeration-resistant recovery, optional Cloudflare Turnstile CAPTCHA.
- 🟡 FR2. Group access: by reusable **group code** (link + QR) and by **email
  invitation** (auto-accepted on sign-up). Registration is open; the invitation/
  code only adds you to a group.
- ✅ FR3. Role per membership (INSTRUCTOR/ACTOR); implicit per-group selection.
- ✅ FR4. A user in several groups, with a different role in each.

### Availability
- ✅ FR5. Paintable weekly calendar (drag; tap toggles).
- 🟡 FR6. Monthly summary view — not implemented; navigation is week by week.
- ✅ FR7. Recurrence: replaced by **copy to N weeks** (D-copy). RRULE supported in
  data/expansion but no longer created from the UI.
- ✅ FR8. Availability states: available / unmarked. "Preferred" removed from the
  UI (kept in data, revised decision).
- ✅ FR9. Partial offline via PWA (cached reads). Autosave on paint.

### Scheduling (director)
- ✅ FR10. Group availability heatmap (color = number available).
- ✅ FR11. Filter by subset of people (chips). Saved subgroups: table exists, UI
  pending (⬜).
- 🟡 FR12. Slot suggestion: `fullCoverageRanges()` exists in lib; no dedicated UI
  (the heatmap already highlights coverage).
- ✅ FR13. Create session: comments, location, start/end time (drag),
  required/optional per person.
- ✅ FR14. Warning if the time falls outside a required person's availability
  (red) or optional (amber); confirmation.
- ✅ FR15. States draft→scheduled→cancelled; time change re-notifies.

### Notifications
- ✅ FR16. On confirm/cancel/change: in-app push + email to affected people.
- ✅ FR17. Confirm/decline attendance (inline in several views).
- 🟡 FR18. Configurable reminders: `generate_reminders` job (24h) created; 2h
  window and antecedence preference not exposed in UI.
- 🟡 FR19. Per-channel preferences: `notification_preferences` table + logic in
  the Edge Function. The profile page exposes **per-event email opt-outs**;
  reminder emails are opt-in for new accounts. Finer per-channel UI still partial.
- ✅ FR20. The director sees response status (pending/going/not going) and an
  aggregate tally; on the Upcoming card the tally opens a "Convocados" modal with
  the full attendee list (sorted by response then name). "Remind pending" queues a
  NUDGE to non-responders (full-width button + confirm modal).

### Non-functional
- ✅ NFR1. Installable PWA (manifest, SW, precache, push). In-app install banner +
  button (captured `beforeinstallprompt`), iOS standalone metas, SW auto-update on
  window focus, stable shell height so the bottom nav survives auto-reload.
- ✅ NFR2. Mobile-first (bottom nav, touch gestures, 44px targets).
- ✅ NFR3. i18n (es default, en).
- ✅ NFR4. Time zones: stored in UTC (`tstzrange`), shown in local time.
- ✅ NFR5. GDPR: own account deletion via `delete_my_account` RPC (cascade; FK
  rules in `20260607000014` keep authored rows by nulling creator/actor), minimal
  data.
- 🟡 NFR6. Accessibility: states don't rely on color alone (icons/borders); full
  WCAG audit pending.

## Requirements from later decisions

- ✅ FR21. Full isolation between groups (D4); only crossing: availability
  discount from confirmed sessions (without revealing the origin).
- ✅ FR22. Director promotes/demotes roles; several directors possible.
- ✅ FR23. Leave group (deletes own membership).
- ✅ FR24. Multi-group home with a geometric avatar per group.
- ✅ FR25–29. Superadmin sees structure, manages groups/users, audit
  (`audit_log`), bootstrap via SQL.
- ✅ FR30. Any user can create a group (becomes director).
- ✅ FR31. **Per-user** archiving of cancelled/past rehearsals.
- ✅ FR32. Optional pronoun → gendered role label (actress/actor…).
- ✅ FR33. Warning when removing availability over a scheduled rehearsal, with an
  option to remove only the selected part or the whole rehearsal slot.
- ✅ FR34. Public legal pages (`/privacy`, `/legal` LSSI-CE, `/cookies`),
  rendered by a generic `LegalDoc` component from i18n and linked from the login
  footer. The controller/contact data is not in the JS bundle: privacy and legal
  notice fetch it from the public `legal-info` Edge Function after a Cloudflare
  Turnstile check (anti-scraping); the cookie policy has no personal data and no
  captcha.
- ✅ FR35. Leave group is a destructive, irreversible action ("Salir del grupo",
  red styling) requiring the user to type "SALIR" to confirm.
- ✅ FR36. First-login onboarding wizard (`/welcome`): name, pronoun, email
  preferences, availability pitch, optional PWA install; gated by
  `profiles.onboarded_at` and run once for every existing user.
- ✅ FR37. Cross-device "what's new" callouts (`profiles.seen_features` +
  `mark_feature_seen`), reinstall-proof, announcing new features after onboarding.
- ✅ FR38. Personal profile photo (gallery or camera, round crop → data URL in
  `profiles.avatar_url`), with initials-avatar fallback and a remove action.
- ✅ FR39. Notification inbox management: swipe-to-archive, mark-all-read /
  archive-all, archived toggle; calm empty state with a random theatre fragment.
- ✅ FR40. Member lifecycle notifications: MEMBER_JOINED (to every other member,
  with one-tap bulk summon of the newcomer to upcoming sessions) and
  MEMBER_PROMOTED (on promotion to director).
- ✅ FR41. Per-invitation email delivery state (sent-on / never-sent), with
  resend and delete of pending invitations.
- ✅ FR42. Session form as routed create/edit pages with start + end time inputs
  (no duration chips); the group/upcoming lists bucket by day and offer a
  swipeable month-calendar view; add-to-calendar `.ics` export from the detail.
