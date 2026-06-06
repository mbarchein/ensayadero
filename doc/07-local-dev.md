# 07 · Desarrollo local

Stack completo en docker-compose, **sin** Supabase CLI.

## Arranque

```bash
make up           # levanta todo
make seed-users   # usuarios demo + grupo demo
make logs         # logs
make reset        # DB desde cero (down -v + up; re-aplica migraciones + seed)
make help         # resto de comandos
```

| Servicio | Puerto | Rol |
|----------|--------|-----|
| app (Vite) | 5173 | Frontend dev |
| gateway (nginx) | 54321 | Emula Kong: `/auth/v1`, `/rest/v1`, `/functions/v1` (+ CORS) |
| db (supabase/postgres) | 54322 | Postgres con pg_cron/pg_net |
| auth (GoTrue) | — | Auth; email+password habilitado solo en local |
| rest (PostgREST) | — | API con RLS |
| functions (Deno) | — | `send-notifications` |
| migrate | — | Aplica `supabase/migrations/*` (tabla `_migrations`) + `seed.sql` |

Detalles:
- `docker/db-init.sql` sincroniza contraseñas de roles internos con
  `POSTGRES_PASSWORD` (solo local).
- `docker/migrate.sh` espera a que GoTrue cree `auth.users`, aplica migraciones
  en orden una sola vez, luego `seed.sql`.
- `docker/gateway.conf` enruta y añade CORS para auth y functions (GoTrue/Deno no
  los emiten; PostgREST sí). Sin esto, el login por navegador falla.
- JWT local: par anon/service firmado con `JWT_SECRET` del compose (solo local).

## Usuarios demo (`make seed-users`, password `password123`)

| Email | Rol |
|-------|-----|
| `admin@local.test` | Superadmin |
| `directora@local.test` | Directora del grupo demo «La Tempestad (demo)» |
| `actor1@…`, `actor2@…`, `actor3@…` | Actores |

El seed crea invitaciones antes de cada usuario; el alta las autoacepta y crea
las membresías. `seed-users.sh` recrea usuarios borrados (filtra por invitación
pendiente y por perfil ya existente).

## Login en dev
La UI muestra una caja **«dev login»** (solo `import.meta.env.DEV`, ausente en
producción) para entrar por email+password. Google opcional en local exportando
`GOOGLE_OAUTH_ENABLED=true` + client id/secret en `.env`.

## Comandos útiles
```bash
make psql                       # shell SQL
docker compose up migrate       # re-aplicar migraciones nuevas
docker compose exec app npm run typecheck
docker compose exec app npm test
```

## Notas
- Node 24 local; el contenedor `app` usa su propio volumen de `node_modules`
  (al añadir libs: `docker compose exec app npm install`).
- `dist/` puede quedar como root si se construyó en contenedor; borrar con
  `docker compose exec app rm -rf /app/dist` o reconstruir.
