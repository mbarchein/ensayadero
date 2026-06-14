# GitHub Actions secrets for CI/CD:
# - deploy frontend to Vercel (vercel CLI)
# - apply Supabase migrations (supabase CLI)
# - deploy Edge Functions
#
# Cloudflare creds are NOT here on purpose: CI no longer touches Cloudflare
# (DNS/Turnstile are managed only by Terraform). The token stays in tfvars.

resource "github_actions_secret" "vercel_token" {
  repository  = var.github_repo
  secret_name = "VERCEL_TOKEN"
  value       = var.vercel_token
}

resource "github_actions_secret" "vercel_org_id" {
  repository  = var.github_repo
  secret_name = "VERCEL_ORG_ID"
  value       = var.vercel_org_id
}

resource "github_actions_secret" "vercel_project_id" {
  repository  = var.github_repo
  secret_name = "VERCEL_PROJECT_ID"
  value       = vercel_project.app.id
}

resource "github_actions_secret" "supabase_access_token" {
  repository  = var.github_repo
  secret_name = "SUPABASE_ACCESS_TOKEN"
  value       = var.supabase_access_token
}

resource "github_actions_secret" "supabase_project_ref" {
  repository  = var.github_repo
  secret_name = "SUPABASE_PROJECT_REF"
  value       = supabase_project.main.id
}

resource "github_actions_secret" "supabase_db_password" {
  repository  = var.github_repo
  secret_name = "SUPABASE_DB_PASSWORD"
  value       = local.db_password
}

resource "github_actions_secret" "resend_api_key" {
  count       = var.resend_api_key != "" ? 1 : 0
  repository  = var.github_repo
  secret_name = "RESEND_API_KEY"
  value       = var.resend_api_key
}

# Public frontend variables (not sensitive)
resource "github_actions_variable" "supabase_url" {
  repository    = var.github_repo
  variable_name = "VITE_SUPABASE_URL"
  value         = "https://${supabase_project.main.id}.supabase.co"
}

resource "github_actions_variable" "app_url" {
  repository    = var.github_repo
  variable_name = "VITE_APP_URL"
  value         = local.app_url
}

# Web Push public key — read by the build as VITE_VAPID_PUBLIC_KEY.
resource "github_actions_variable" "vapid_public_key" {
  count         = var.vapid_public_key != "" ? 1 : 0
  repository    = var.github_repo
  variable_name = "VITE_VAPID_PUBLIC_KEY"
  value         = var.vapid_public_key
}

# Turnstile site key — read by the build as VITE_TURNSTILE_SITE_KEY.
resource "github_actions_variable" "turnstile_site_key" {
  count         = var.turnstile_enabled ? 1 : 0
  repository    = var.github_repo
  variable_name = "VITE_TURNSTILE_SITE_KEY"
  value         = cloudflare_turnstile_widget.auth[0].sitekey
}

# Supabase anon (public) key — read by the build as VITE_SUPABASE_ANON_KEY.
resource "github_actions_variable" "supabase_anon_key" {
  repository    = var.github_repo
  variable_name = "VITE_SUPABASE_ANON_KEY"
  value         = data.supabase_apikeys.main.anon_key
}

# Whether the frontend shows the Facebook login button — true only when the Meta
# OAuth credentials are configured (matches external_facebook_enabled in Supabase).
resource "github_actions_variable" "facebook_enabled" {
  repository    = var.github_repo
  variable_name = "VITE_FACEBOOK_ENABLED"
  value         = tostring(var.facebook_oauth_client_id != "")
}
