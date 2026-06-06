# 02 · Requirements

Status: ✅ implemented · 🟡 partial · ⬜ pending.

## Functional

### Authentication and access
- ✅ FR1. OAuth login with Google (GoTrue). Other providers prepared.
- 🟡 FR2. Invitation: by email, by reusable **group code**, link and QR.
  *Note:* registration became **open** (D5'); the invitation adds you to a group.
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
- ✅ FR13. Create session: title, scene, location, start/end time (drag),
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
  the Edge Function; preferences UI pending (⬜).
- ✅ FR20. The director sees response status (pending/going/not going) and an
  aggregate tally.

### Non-functional
- ✅ NFR1. Installable PWA (manifest, SW, precache, push).
- ✅ NFR2. Mobile-first (bottom nav, touch gestures, 44px targets).
- ✅ NFR3. i18n (es default, en).
- ✅ NFR4. Time zones: stored in UTC (`tstzrange`), shown in local time.
- ✅ NFR5. GDPR: own account deletion (cascade), minimal data.
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
