output "supabase_project_ref" {
  description = "Referencia del proyecto Supabase"
  value       = supabase_project.main.id
}

output "supabase_url" {
  description = "URL API de Supabase"
  value       = "https://${supabase_project.main.id}.supabase.co"
}

output "app_url" {
  description = "URL pública de la app"
  value       = local.app_url
}

output "pages_subdomain" {
  description = "Subdominio *.pages.dev del proyecto"
  value       = cloudflare_pages_project.app.subdomain
}

output "google_oauth_redirect_uri" {
  description = "Redirect URI a registrar en el OAuth client de Google Console"
  value       = "https://${supabase_project.main.id}.supabase.co/auth/v1/callback"
}
