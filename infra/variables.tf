variable "project_name" {
  description = "Nombre base del proyecto"
  type        = string
  default     = "ensayo"
}

variable "environment" {
  description = "Entorno (prod, staging)"
  type        = string
  default     = "prod"
}

# ── Supabase ────────────────────────────────────────────────
variable "supabase_access_token" {
  description = "Personal access token de Supabase (https://supabase.com/dashboard/account/tokens)"
  type        = string
  sensitive   = true
}

variable "supabase_org_id" {
  description = "ID de la organización Supabase (slug en dashboard)"
  type        = string
}

variable "supabase_db_password" {
  description = "Password de la DB del proyecto Supabase. Si se omite, se genera."
  type        = string
  sensitive   = true
  default     = null
}

variable "supabase_region" {
  description = "Región del proyecto Supabase"
  type        = string
  default     = "eu-west-3" # París, cercana a España
}

# ── OAuth (clients creados manualmente) ─────────────────────
variable "google_oauth_client_id" {
  description = "Client ID OAuth de Google (creado manual en Google Cloud Console)"
  type        = string
}

variable "google_oauth_client_secret" {
  description = "Client secret OAuth de Google"
  type        = string
  sensitive   = true
}

# Facebook/Meta OAuth — vía login de Meta (cubre cuentas Instagram vinculadas).
# Supabase no tiene provider Instagram nativo; este es el camino soportado.
# Opcional: si se deja vacío, el provider queda deshabilitado.
variable "facebook_oauth_client_id" {
  description = "App ID de Meta (Facebook Login). Vacío = provider deshabilitado."
  type        = string
  default     = ""
}

variable "facebook_oauth_client_secret" {
  description = "App Secret de Meta (Facebook Login)"
  type        = string
  sensitive   = true
  default     = ""
}

# ── Cloudflare ──────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "API token Cloudflare con permisos Pages:Edit, DNS:Edit, Zone:Read"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Account ID de Cloudflare"
  type        = string
}

variable "domain" {
  description = "Dominio raíz gestionado en Cloudflare (ej: ensayoapp.es)"
  type        = string
}

variable "app_subdomain" {
  description = "Subdominio de la app. Vacío = dominio raíz."
  type        = string
  default     = "app"
}

# ── Resend (DNS de verificación; API key se crea manual) ────
variable "resend_dkim_records" {
  description = "Records DKIM/SPF que Resend pide al verificar dominio. Rellenar tras añadir dominio en dashboard Resend."
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
  description = "Token GitHub con repo + secrets scope"
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "Usuario u organización GitHub"
  type        = string
}

variable "github_repo" {
  description = "Nombre del repositorio"
  type        = string
  default     = "ensayo"
}

variable "resend_api_key" {
  description = "API key de Resend (manual, dashboard). Se inyecta como secret de Edge Functions y de CI."
  type        = string
  sensitive   = true
  default     = ""
}
