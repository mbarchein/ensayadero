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
      "${local.app_url}/reset-password",
      "http://localhost:5173/auth/callback", # dev local
      "http://localhost:5173/reset-password",
    ]

    # Registro abierto: cualquiera puede crear cuenta (Google/email).
    # El acceso a grupos se controla por código/enlace de grupo e invitaciones
    # por email (auto-aceptadas en el trigger handle_new_user).
    disable_signup = false

    external_google_enabled   = true
    external_google_client_id = var.google_oauth_client_id
    external_google_secret    = var.google_oauth_client_secret

    # Email+password con activación obligatoria (mailer_autoconfirm=false).
    # SMTP vía Resend (mismo API key que las notificaciones). Si resend_api_key
    # está vacío, los correos de activación/recuperación no se enviarán.
    mailer_autoconfirm                 = false
    mailer_secure_email_change_enabled = true
    smtp_admin_email                   = "noreply@${var.domain}"
    smtp_host                          = "smtp.resend.com"
    smtp_port                          = 465
    smtp_user                          = "resend"
    smtp_pass                          = var.resend_api_key
    smtp_sender_name                   = "Ensayo"
  })
}
