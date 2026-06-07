variable "project_name" {
  description = "Base project name"
  type        = string
  default     = "ensayo"
}

variable "environment" {
  description = "Environment (prod, staging)"
  type        = string
  default     = "prod"
}

# ── Supabase ────────────────────────────────────────────────
variable "supabase_access_token" {
  description = "Supabase personal access token (https://supabase.com/dashboard/account/tokens)"
  type        = string
  sensitive   = true
}

variable "supabase_org_id" {
  description = "Supabase organization ID (slug in the dashboard)"
  type        = string
}

variable "supabase_db_password" {
  description = "Supabase project DB password. If omitted, one is generated."
  type        = string
  sensitive   = true
  default     = null
}

variable "supabase_region" {
  description = "Supabase project region"
  type        = string
  default     = "eu-west-3" # Paris, close to Spain
}

# ── OAuth (clients created manually) ────────────────────────
variable "google_oauth_client_id" {
  description = "Google OAuth Client ID (created manually in Google Cloud Console)"
  type        = string
}

variable "google_oauth_client_secret" {
  description = "Google OAuth Client secret"
  type        = string
  sensitive   = true
}

# Facebook/Meta OAuth — via Meta login (covers linked Instagram accounts).
# Supabase has no native Instagram provider; this is the supported path.
# Optional: if left empty, the provider stays disabled.
variable "facebook_oauth_client_id" {
  description = "Meta App ID (Facebook Login). Empty = provider disabled."
  type        = string
  default     = ""
}

variable "facebook_oauth_client_secret" {
  description = "Meta App Secret (Facebook Login)"
  type        = string
  sensitive   = true
  default     = ""
}

# Leaked-password protection (HaveIBeenPwned). On hosted Supabase it requires
# the Pro plan or higher; keep false on free tier so apply doesn't break.
variable "password_hibp_enabled" {
  description = "Enable HIBP leaked-password check (requires Pro plan)"
  type        = bool
  default     = false
}

# Cloudflare Turnstile CAPTCHA. Empty secret = provider disabled. The site key
# (public) goes to the frontend as VITE_TURNSTILE_SITE_KEY (GitHub vars).
variable "turnstile_secret_key" {
  description = "Cloudflare Turnstile secret for auth CAPTCHA. Empty = disabled."
  type        = string
  sensitive   = true
  default     = ""
}

# ── Cloudflare ──────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Pages:Edit, DNS:Edit, Zone:Read permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "domain" {
  description = "Root domain managed in Cloudflare (e.g. ensayoapp.es)"
  type        = string
}

variable "app_subdomain" {
  description = "App subdomain. Empty = root domain."
  type        = string
  default     = "app"
}

# ── Resend (verification DNS; API key created manually) ─────
variable "resend_dkim_records" {
  description = "DKIM/SPF records Resend asks for when verifying the domain. Fill in after adding the domain in the Resend dashboard."
  type = list(object({
    name     = string
    type     = string # TXT | MX | CNAME
    content  = string
    priority = optional(number)
  }))
  default = []
}

# ── GitHub (CI/CD) ──────────────────────────────────────────
variable "github_token" {
  description = "GitHub token with repo + secrets scope"
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub user or organization"
  type        = string
}

variable "github_repo" {
  description = "Repository name"
  type        = string
  default     = "ensayo"
}

variable "resend_api_key" {
  description = "Resend API key (manual, dashboard). Injected as an Edge Functions and CI secret."
  type        = string
  sensitive   = true
  default     = ""
}
