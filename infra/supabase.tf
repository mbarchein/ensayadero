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
    # Avoid recreating the project when the password changes
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
      "http://localhost:5173/auth/callback", # local dev
      "http://localhost:5173/reset-password",
    ]

    # Open registration: anyone can create an account (Google/email).
    # Group access is controlled by the group join code/link and email
    # invitations (auto-accepted in the handle_new_user trigger).
    disable_signup = false

    external_google_enabled   = true
    external_google_client_id = var.google_oauth_client_id
    external_google_secret    = var.google_oauth_client_secret

    # Meta/Facebook (supported path for login with Instagram accounts).
    # Enabled only if the Meta app credentials have been filled in.
    external_facebook_enabled   = var.facebook_oauth_client_id != ""
    external_facebook_client_id = var.facebook_oauth_client_id
    external_facebook_secret    = var.facebook_oauth_client_secret

    # Email+password with mandatory activation (mailer_autoconfirm=false).
    # SMTP via Resend (same API key as the notifications). If resend_api_key
    # is empty, the activation/recovery emails won't be sent.
    mailer_autoconfirm                 = false
    mailer_secure_email_change_enabled = true
    smtp_admin_email                   = "noreply@${var.domain}"
    smtp_host                          = "smtp.resend.com"
    smtp_port                          = 465
    smtp_user                          = "resend"
    smtp_pass                          = var.resend_api_key
    smtp_sender_name                   = "Ensayadero"

    # --- Auth form hardening ---
    # Activation/recovery links: expire after 15 min, single-use.
    mailer_otp_exp = 900
    # Password policy: minimum length + (optional) HIBP leaked check.
    password_min_length   = 8
    password_hibp_enabled = var.password_hibp_enabled
    # Anti email-bombing / volume-based enumeration.
    rate_limit_email_sent          = 10
    rate_limit_token_verifications = 30
    # Turnstile CAPTCHA (anti-bot). Active only if a secret is set.
    security_captcha_enabled  = var.turnstile_secret_key != ""
    security_captcha_provider = "turnstile"
    security_captcha_secret   = var.turnstile_secret_key
  })
}
