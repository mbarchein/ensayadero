# Documentación — Ensayo

PWA para planificar ensayos de teatro según la disponibilidad del grupo.
Cada miembro pinta su disponibilidad; el director ve el heatmap combinado y
programa sesiones; notificaciones por push y email.

## Índice

| Doc | Contenido |
|-----|-----------|
| [01-overview.md](01-overview.md) | Visión, roles, glosario, recorrido de uso |
| [02-requirements.md](02-requirements.md) | Requisitos funcionales (RF) y no funcionales (RNF) |
| [03-decisions.md](03-decisions.md) | Todas las decisiones de diseño tomadas (D1…) + evolución |
| [04-architecture.md](04-architecture.md) | Stack, diagrama, modelo de datos, seguridad (RLS) |
| [05-implementation.md](05-implementation.md) | Frontend: estructura, lógica núcleo, PWA, i18n |
| [06-database.md](06-database.md) | Esquema SQL, RLS, funciones, triggers, migraciones |
| [07-local-dev.md](07-local-dev.md) | Stack local docker-compose, usuarios demo |
| [08-deployment.md](08-deployment.md) | Terraform, CI/CD, pasos manuales (bootstrap) |

Ver también, en la raíz del repo: `README.md` (resumen) y `BOOTSTRAP.md`
(pasos manuales de puesta en producción).

## Estado

- Frontend: React + Vite + TypeScript + Tailwind, PWA (Workbox/Serwist).
- Backend: Supabase (Postgres + GoTrue + PostgREST + Edge Functions).
- 13 migraciones SQL, 17 tests unitarios de lógica núcleo.
- i18n es/en. Verificado E2E con Playwright a lo largo del desarrollo.
