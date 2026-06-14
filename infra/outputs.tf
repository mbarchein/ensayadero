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

output "vercel_project_id" {
  description = "ID del proyecto Vercel (se inyecta como secret VERCEL_PROJECT_ID en CI)"
  value       = vercel_project.app.id
}


output "google_oauth_redirect_uri" {
  description = "Redirect URI a registrar en el OAuth client de Google Console"
  value       = "https://${supabase_project.main.id}.supabase.co/auth/v1/callback"
}

output "turnstile_site_key" {
  description = "Cloudflare Turnstile site key (public); null if CAPTCHA disabled"
  value       = try(cloudflare_turnstile_widget.auth[0].sitekey, null)
}

output "turnstile_secret_key" {
  description = "Cloudflare Turnstile secret — set as the legal-info Edge Function secret TURNSTILE_SECRET_KEY"
  value       = try(cloudflare_turnstile_widget.auth[0].secret, null)
  sensitive   = true
}
