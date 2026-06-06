# Documentation — Ensayo

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
| [08-deployment.md](08-deployment.md) | Terraform, CI/CD, manual steps (bootstrap) |

See also, in the repo root: `README.md` (summary) and `BOOTSTRAP.md` (manual
production setup steps).

## Status

- Frontend: React + Vite + TypeScript + Tailwind, PWA (Workbox/injectManifest).
- Backend: Supabase (Postgres + GoTrue + PostgREST + Edge Functions).
- 13 SQL migrations, 17 unit tests of core logic.
- i18n es/en. Verified E2E with Playwright throughout development.
