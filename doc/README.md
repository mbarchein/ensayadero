# Documentation — Ensayadero

PWA to plan a theatre group's rehearsals based on members' availability. Each
member paints their availability; the director sees the combined heatmap and
schedules sessions; notifications via push and email.

## Index

| Doc | Contents |
|-----|----------|
| [01-overview.md](01-overview.md) | Vision, roles, glossary, usage walkthrough |
| [02-requirements.md](02-requirements.md) | Functional (FR) and non-functional (NFR) requirements |
| [03-decisions.md](03-decisions.md) | All design decisions (D1…) + evolution |
| [04-architecture.md](04-architecture.md) | Stack, diagram, data model, security (RLS) |
| [05-implementation.md](05-implementation.md) | Frontend: structure, core logic, PWA, i18n |
| [06-database.md](06-database.md) | SQL schema, RLS, functions, triggers, migrations |
| [07-local-dev.md](07-local-dev.md) | Local docker-compose stack, demo users |
| [08-deployment.md](08-deployment.md) | Managed (Terraform/Cloudflare) and self-hosted (Docker Swarm) paths |

See also, in the repo root: `README.md` (summary), `BOOTSTRAP.md` (manual
managed-deploy steps) and `DEPLOY.md` (self-hosting on Docker Swarm).

## Status

- Frontend: React + Vite + TypeScript + Tailwind, PWA (Workbox/injectManifest).
- Backend: Supabase (Postgres + GoTrue + PostgREST + Realtime + Edge Functions).
- Auth: open sign-up — Google, Meta/Facebook, email+password (activation +
  recovery); optional Turnstile CAPTCHA. **Same email = same account** across
  methods (verified-email auto-linking); OAuth users can set a password from the
  profile. Group access via join code/link/QR + email invites.
- Live updates via Supabase Realtime.
- Public legal pages (`/privacy`, `/legal`, `/cookies`); controller/contact data
  served by a Turnstile-gated `legal-info` Edge Function (kept out of the bundle).
- Two Edge Functions: `send-notifications`, `legal-info`. MIT licensed.
- 32 SQL migrations; 28 `vitest` unit tests of core logic.
- i18n es/en. **Playwright e2e suite in `e2e/`** (dockerized, `make e2e`) covering
  the main flows + a null-profile session-detail regression.
