# ── Vercel: PWA frontend hosting ────────────────────────────
# The static Vite build is shipped from CI (`vercel build` + `vercel deploy
# --prebuilt`, see .github/workflows/deploy.yml). DNS stays in Cloudflare
# (cloudflare.tf): the app record is a DNS-only CNAME to Vercel's edge.
resource "vercel_project" "app" {
  name           = var.project_name
  framework      = "vite"
  root_directory = "app" # the Vite app lives in app/, not the repo root

  # No login wall on any deployment. Even the default (standard protection) leaves
  # production public, but pin it explicitly so an interstitial can never end up in
  # front of the PWA — that would break the service worker and manifest fetches.
  vercel_authentication = {
    deployment_type = "none"
  }
}

# Attaches the custom domain to the project. Vercel verifies ownership and issues
# the TLS cert through the Cloudflare CNAME below; keep that record DNS-only so
# Vercel — not Cloudflare — terminates TLS for the app host.
resource "vercel_project_domain" "app" {
  project_id = vercel_project.app.id
  domain     = local.app_fqdn
}
