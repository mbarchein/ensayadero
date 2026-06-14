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

# Cloudflare Turnstile CAPTCHA on the auth forms. When true, Terraform creates the
# widget and derives both the site key (-> VITE_TURNSTILE_SITE_KEY build var) and
# the secret (-> Supabase auth). Requires Turnstile:Edit on cloudflare_api_token.
variable "turnstile_enabled" {
  description = "Create a Cloudflare Turnstile widget + wire CAPTCHA on auth forms."
  type        = bool
  default     = false
}

# ── Cloudflare ──────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Pages:Edit, DNS:Edit, Zone:Read, Turnstile:Edit, Single Redirect:Edit permissions"
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

# 301-redirect the apex (root) domain to the app subdomain via a Cloudflare
# redirect rule. Only applies when app_subdomain is set (otherwise apex IS the app).
variable "redirect_root_to_app" {
  description = "Redirect the root domain to the app subdomain (Cloudflare 301)."
  type        = bool
  default     = true
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

# ── Vercel (PWA frontend hosting) ───────────────────────────
# Two-phase cutover for rollback safety:
#   false (phase 1): Cloudflare Pages still serves the app domain; Vercel is
#          created and CI deploys to it — verify it on its *.vercel.app URL.
#   true  (phase 2): DNS points at Vercel, Pages + its CI creds are torn down.
# Roll back from phase 1 by doing nothing (Pages keeps serving). After phase 2,
# rolling back means flipping this to false and redeploying to Pages.
variable "frontend_cutover" {
  description = "false = keep Pages live while Vercel is verified; true = cut DNS over to Vercel and remove Pages."
  type        = bool
  default     = false
}


variable "vercel_token" {
  description = "Vercel API token (https://vercel.com/account/tokens), team-scoped"
  type        = string
  sensitive   = true
}

variable "vercel_org_id" {
  description = "Vercel team/org ID (Team Settings, or `vercel teams ls`)"
  type        = string
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

# ── Web Push (VAPID) ────────────────────────────────────────
# Public key only — exposed to the frontend as the VITE_VAPID_PUBLIC_KEY build
# variable. The matching private key is a Supabase Edge Function secret
# (VAPID_PRIVATE_KEY) and is set out of band, not via Terraform.
variable "vapid_public_key" {
  description = "Web Push VAPID public key (base64url, public). Empty = push disabled."
  type        = string
  default     = ""
}
