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

  # Deploy via GitHub Actions with wrangler (direct upload), no native Git
  # integration — more control from CI. No build_config block on purpose: an
  # empty one diverges from the API's stored value (null) and trips a known
  # cloudflare provider v5 bug ("inconsistent values for sensitive attribute")
  # on every apply, which would block the pages_domain + DNS record below.
}

resource "cloudflare_pages_domain" "app" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.app.name
  name         = local.app_fqdn
}

locals {
  app_fqdn = var.app_subdomain != "" ? "${var.app_subdomain}.${var.domain}" : var.domain
  # Redirect the apex only when the app lives on a subdomain (else apex IS the app).
  redirect_root = var.redirect_root_to_app && var.app_subdomain != ""
}

# ── Turnstile CAPTCHA widget (optional) ─────────────────────
# sitekey -> VITE_TURNSTILE_SITE_KEY (github.tf); secret -> Supabase auth
# (supabase.tf). localhost dev uses Turnstile's built-in dummy test sitekeys.
resource "cloudflare_turnstile_widget" "auth" {
  count      = var.turnstile_enabled ? 1 : 0
  account_id = var.cloudflare_account_id
  name       = "${var.project_name} auth"
  domains    = [local.app_fqdn]
  mode       = "managed"
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

  zone_id = data.cloudflare_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  # TXT record content must be wrapped in quotation marks for the Cloudflare v5
  # provider (otherwise it warns and quotes it for you); MX/CNAME must not be.
  content  = each.value.type == "TXT" ? "\"${each.value.content}\"" : each.value.content
  priority = try(each.value.priority, null)
  proxied  = false
  ttl      = 1
}

# ── Redirect apex (root domain) → app subdomain ─────────────
# A proxied apex record is required so the request reaches Cloudflare's edge; the
# placeholder IP is never contacted — the redirect rule fires before any origin.
resource "cloudflare_dns_record" "root_redirect" {
  count   = local.redirect_root ? 1 : 0
  zone_id = data.cloudflare_zone.main.zone_id
  name    = "@"
  type    = "A"
  content = "192.0.2.1" # TEST-NET-1 placeholder, never reached
  proxied = true
  ttl     = 1
}

# 301 redirect ${var.domain}/<path>?<query> → https://${app_fqdn}/<path>?<query>
resource "cloudflare_ruleset" "root_redirect" {
  count   = local.redirect_root ? 1 : 0
  zone_id = data.cloudflare_zone.main.zone_id
  name    = "Redirect root to app"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [{
    action      = "redirect"
    description = "Redirect ${var.domain} to ${local.app_fqdn}"
    expression  = "(http.host eq \"${var.domain}\")"
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${local.app_fqdn}\", http.request.uri.path)"
        }
      }
    }
  }]
}
