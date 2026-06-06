resource "random_password" "db" {
  count   = var.supabase_db_password == null ? 1 : 0
  length  = 32
  special = false
}

locals {
  db_password = coalesce(var.supabase_db_password, try(random_password.db[0].result, null))
  app_url     = "https://${var.app_subdomain != "" ? "${var.app_subdomain}." : ""}${var.domain}"
}

resource "supabase_project" "main" {
  organization_id   = var.supabase_org_id
  name              = "${var.project_name}-${var.environment}"
  database_password = local.db_password
  region            = var.supabase_region

  lifecycle {
    # Evita recreación del proyecto por cambio de password
    ignore_changes = [database_password]
  }
}

resource "supabase_settings" "main" {
  project_ref = supabase_project.main.id

  api = jsonencode({
    db_schema            = "public"
    db_extra_search_path = "public,extensions"
    max_rows             = 1000
  })

  auth = jsonencode({
    site_url = local.app_url
    additional_redirect_urls = [
      "${local.app_url}/auth/callback",
      "http://localhost:5173/auth/callback", # dev local
    ]

    # Registro abierto desactivado: solo invitación (RF2).
    # Las cuentas se crean vía invite o al aceptar invitación con token propio.
    disable_signup = false # OAuth necesita signup habilitado; el gate de invitación se aplica en DB (trigger valida invitación pendiente)

    external_google_enabled   = true
    external_google_client_id = var.google_oauth_client_id
    external_google_secret    = var.google_oauth_client_secret

    mailer_autoconfirm = false
  })
}
