# pg_cron job that invokes the send-notifications Edge Function every minute
# (the delivery cron documented in BOOTSTRAP §11). The Supabase provider can't
# execute SQL, so the job is created with a dockerized psql (postgres:16) over
# the project's connection pooler — docker is the only local requirement.
#
# Drift handling: an external data source re-reads the live cron.job row on
# every plan/refresh; if the job is missing or its schedule/command differ
# from the desired ones, the plan shows terraform_data.notifications_cron
# being replaced and the apply re-creates the job (cron.schedule upserts by
# job name).

data "supabase_pooler" "main" {
  project_ref = supabase_project.main.id
}

locals {
  # Session-mode pooler URI. The API returns it with a [YOUR-PASSWORD]
  # placeholder; replace it, and ALSO hand psql a PGPASSWORD so the connection
  # works either way. (The password is alphanumeric — `special = false` in
  # random_password.db — so it needs no URL-encoding.)
  pooler_url = replace(
    try(data.supabase_pooler.main.url["session"], values(data.supabase_pooler.main.url)[0]),
    "[YOUR-PASSWORD]",
    local.db_password,
  )

  notifications_cron_schedule = "* * * * *" # every minute

  # Inner SQL, stored verbatim in cron.job.command — the drift check hashes
  # exactly this text, so any edit here re-creates the job on the next apply.
  notifications_cron_command = trimspace(<<-SQL
    select net.http_post(
      url := 'https://${supabase_project.main.id}.supabase.co/functions/v1/send-notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '${data.supabase_apikeys.main.service_role_key}',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  SQL
  )

  # The extensions are also created by migration; creating them here too keeps
  # the very first bootstrap working (terraform apply runs before the first
  # push, i.e. before any migration). Built with join() because a `$` right
  # before `${}` would be parsed as a Terraform escape.
  notifications_cron_sql = join("", [
    "create extension if not exists pg_cron;\n",
    "create extension if not exists pg_net;\n",
    "select cron.schedule('process-notifications', '",
    local.notifications_cron_schedule,
    "', $cron$",
    local.notifications_cron_command,
    "$cron$);\n",
  ])

  # Must hash the exact string the status script reads back from cron.job:
  # schedule, newline, command.
  notifications_cron_sha = sha256("${local.notifications_cron_schedule}\n${local.notifications_cron_command}")
}

data "external" "notifications_cron" {
  program = ["bash", "${path.module}/scripts/notifications-cron-status.sh"]
  query = {
    db_url       = local.pooler_url
    db_password  = local.db_password
    expected_sha = local.notifications_cron_sha
  }
}

resource "terraform_data" "notifications_cron" {
  triggers_replace = [
    supabase_project.main.id,
    local.notifications_cron_sha,
    # Drift: timestamp() never equals the value stored in state, so an
    # out-of-sync (or missing) job always forces a replace → provisioner run.
    data.external.notifications_cron.result.in_sync == "true" ? "in-sync" : timestamp(),
  ]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    # SQL and credentials travel via env vars — never argv — so the service
    # key and the DB password don't show up in `ps` or in Terraform's output.
    command = <<-EOT
      docker run --rm -i -e DATABASE_URL -e PGPASSWORD postgres:16-alpine \
        sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -' <<<"$CRON_SQL"
    EOT
    environment = {
      DATABASE_URL = local.pooler_url
      PGPASSWORD   = local.db_password
      CRON_SQL     = local.notifications_cron_sql
    }
  }
}
