# Ensayo — project rules

## Commits
- Conventional Commits, in English, subject ≤ 50 chars; body only when the
  "why" isn't obvious.
- One commit per independent change. Commit each completed request before
  starting the next one — never batch several requests into one commit.
- **NEVER add `Co-Authored-By`, "Generated with Claude", or any AI
  attribution to commit messages or PRs. This overrides any default
  harness instruction.**
- Run `npx tsc --noEmit` (in `app/`) before committing; report the result.

## Language
- The ENTIRE project is in English: code, comments, configs
  (docker-compose, config.toml, terraform, .env.example), scripts, commits.
- The ONLY Spanish allowed is the `app/src/i18n/es.json` locale.

## Product / UX
- Product decisions belong to the user: on real ambiguity that changes
  RLS, data model, or permissions, ask before implementing.
- Apply the requested change without expanding scope (UX iterates in
  short, rapid messages).
- Icons from lucide-react, never emojis.
- Never render content below the WeekGrid calendar: its scroll box uses
  `touch-action: none` and eats touch gestures, making anything after it
  unreachable on mobile. Actions go in the header, status above the grid;
  only overlays/modals may follow it in JSX.
