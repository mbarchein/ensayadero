data "cloudflare_zone" "main" {
  filter = {
    name = var.domain
  }
}

# ── Frontend hosting is on Vercel (vercel.tf) ───────────────
# Cloudflare keeps the DNS zone + Turnstile; the app host is a DNS-only CNAME to
# Vercel's edge (cloudflare_dns_record.app below).

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
  content = "cname.vercel-dns.com" # Vercel edge
  # DNS-only (grey cloud): Vercel terminates TLS for the app host. Proxying it
  # through Cloudflare would stack two CDNs and break Vercel's cert issuance.
  proxied = false
  ttl     = 1

  depends_on = [vercel_project_domain.app]
}

# Vercel domain-ownership verification. Quoted for the cloudflare v5 provider,
# like the resend TXTs below. Set var.vercel_domain_verification from the value
# Vercel shows under Project -> Domains.
resource "cloudflare_dns_record" "vercel_verify" {
  count   = var.vercel_domain_verification != "" ? 1 : 0
  zone_id = data.cloudflare_zone.main.zone_id
  name    = "_vercel"
  type    = "TXT"
  content = "\"${var.vercel_domain_verification}\""
  proxied = false
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
