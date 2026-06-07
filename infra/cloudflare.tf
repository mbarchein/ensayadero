data "cloudflare_zone" "main" {
  filter = {
    name = var.domain
  }
}

# ── Cloudflare Pages: PWA frontend ──────────────────────────
resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = var.project_name
  production_branch = "main"

  # Deploy via GitHub Actions with wrangler (direct upload),
  # no native Git integration — more control from CI.
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

# ── Resend verification DNS (SPF/DKIM/MX) ───────────────────
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
