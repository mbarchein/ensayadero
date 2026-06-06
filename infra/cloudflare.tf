data "cloudflare_zone" "main" {
  filter = {
    name = var.domain
  }
}

# ── Cloudflare Pages: frontend PWA ──────────────────────────
resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = var.project_name
  production_branch = "main"

  # Deploy vía GitHub Actions con wrangler (direct upload),
  # no integración Git nativa — más control desde CI.
  build_config = {
    build_command   = ""
    destination_dir = ""
  }
}

resource "cloudflare_pages_domain" "app" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.app.name
  name         = local.app_fqdn
}

locals {
  app_fqdn = var.app_subdomain != "" ? "${var.app_subdomain}.${var.domain}" : var.domain
}

resource "cloudflare_dns_record" "app" {
  zone_id = data.cloudflare_zone.main.zone_id
  name    = var.app_subdomain != "" ? var.app_subdomain : "@"
  type    = "CNAME"
  content = cloudflare_pages_project.app.subdomain # <project>.pages.dev
  proxied = true
  ttl     = 1
}

# ── DNS verificación Resend (SPF/DKIM/MX) ───────────────────
resource "cloudflare_dns_record" "resend" {
  for_each = { for r in var.resend_dkim_records : "${r.type}-${r.name}" => r }

  zone_id  = data.cloudflare_zone.main.zone_id
  name     = each.value.name
  type     = each.value.type
  content  = each.value.content
  priority = try(each.value.priority, null)
  proxied  = false
  ttl      = 1
}
