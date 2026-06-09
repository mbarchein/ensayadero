# GitHub Actions secrets for CI/CD:
# - deploy frontend to Cloudflare Pages (wrangler)
# - apply Supabase migrations (supabase CLI)
# - deploy Edge Functions

resource "github_actions_secret" "cloudflare_api_token" {
  repository  = var.github_repo
  secret_name = "CLOUDFLARE_API_TOKEN"
  value       = var.cloudflare_api_token
}

resource "github_actions_secret" "cloudflare_account_id" {
  repository  = var.github_repo
  secret_name = "CLOUDFLARE_ACCOUNT_ID"
  value       = var.cloudflare_account_id
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

# Cloudflare Pages project name — used by the wrangler deploy step in CI, so the
# --project-name always matches the project Terraform actually created.
resource "github_actions_variable" "pages_project_name" {
  repository    = var.github_repo
  variable_name = "CLOUDFLARE_PROJECT_NAME"
  value         = var.project_name
}

# Whether the frontend shows the Facebook login button — true only when the Meta
# OAuth credentials are configured (matches external_facebook_enabled in Supabase).
resource "github_actions_variable" "facebook_enabled" {
  repository    = var.github_repo
  variable_name = "VITE_FACEBOOK_ENABLED"
  value         = tostring(var.facebook_oauth_client_id != "")
}
