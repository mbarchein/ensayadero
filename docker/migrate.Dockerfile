# Run-once migration job for production. Applies supabase/migrations/*.sql in
# order (tracked in _migrations, idempotent). No seed (superadmin is promoted
# manually — see DEPLOY.md). Build from the repo root:
#   docker build -f docker/migrate.Dockerfile -t ensayadero/migrate:latest .
FROM supabase/postgres:15.8.1.085
COPY supabase/migrations /migrations
COPY docker/migrate.sh /migrate.sh
ENTRYPOINT ["bash", "/migrate.sh"]
