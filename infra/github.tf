# Secrets de GitHub Actions para CI/CD:
# - deploy frontend a Cloudflare Pages (wrangler)
# - aplicar migraciones Supabase (supabase CLI)
# - desplegar Edge Functions

resource "github_actions_secret" "cloudflare_api_token" {
  repository      = var.github_repo
  secret_name     = "CLOUDFLARE_API_TOKEN"
  plaintext_value = var.cloudflare_api_token
}

resource "github_actions_secret" "cloudflare_account_id" {
  repository      = var.github_repo
  secret_name     = "CLOUDFLARE_ACCOUNT_ID"
  plaintext_value = var.cloudflare_account_id
}

resource "github_actions_secret" "supabase_access_token" {
  repository      = var.github_repo
  secret_name     = "SUPABASE_ACCESS_TOKEN"
  plaintext_value = var.supabase_access_token
}

resource "github_actions_secret" "supabase_project_ref" {
  repository      = var.github_repo
  secret_name     = "SUPABASE_PROJECT_REF"
  plaintext_value = supabase_project.main.id
}

resource "github_actions_secret" "supabase_db_password" {
  repository      = var.github_repo
  secret_name     = "SUPABASE_DB_PASSWORD"
  plaintext_value = local.db_password
}

resource "github_actions_secret" "resend_api_key" {
  count           = var.resend_api_key != "" ? 1 : 0
  repository      = var.github_repo
  secret_name     = "RESEND_API_KEY"
  plaintext_value = var.resend_api_key
}

# Variables públicas del frontend (no sensibles)
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
