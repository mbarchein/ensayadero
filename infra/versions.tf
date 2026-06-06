terraform {
  required_version = ">= 1.9"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.5"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado local para empezar. Para equipo, descomentar HCP Terraform (free tier):
  # cloud {
  #   organization = "TU_ORG"
  #   workspaces {
  #     name = "ensayo"
  #   }
  # }
}

provider "supabase" {
  access_token = var.supabase_access_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}
