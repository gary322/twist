terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "zone" {
  filter = {
    name  = var.cloudflare_zone_name
    match = "all"
  }
}

locals {
  compatibility_date  = "2024-01-15"
  compatibility_flags = ["nodejs_compat"]

  artifacts_dir = "${path.module}/../dist/terraform"

  durable_objects_file = "${local.artifacts_dir}/durable-objects.js"
  security_worker_file = "${local.artifacts_dir}/security-worker.js"
  vau_processor_file   = "${local.artifacts_dir}/vau-processor.js"

  durable_objects_script_name = "durable-objects-${var.environment}"
  security_worker_script_name = "security-worker-${var.environment}"
  vau_processor_script_name   = "vau-processor-${var.environment}"
}

# KV Namespaces
resource "cloudflare_workers_kv_namespace" "rate_limits" {
  account_id = var.cloudflare_account_id
  title      = "rate_limits_${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "device_registry" {
  account_id = var.cloudflare_account_id
  title      = "device_registry_${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "attestation_cache" {
  account_id = var.cloudflare_account_id
  title      = "attestation_cache_${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "bloom_filters" {
  account_id = var.cloudflare_account_id
  title      = "bloom_filters_${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "kv" {
  account_id = var.cloudflare_account_id
  title      = "kv_${var.environment}"
}

# R2 Buckets
resource "cloudflare_r2_bucket" "audit_logs" {
  account_id = var.cloudflare_account_id
  name       = "twist-audit-logs-${var.environment}"
  location   = "ENAM"
}

resource "cloudflare_r2_bucket" "analytics_data" {
  account_id = var.cloudflare_account_id
  name       = "twist-analytics-${var.environment}"
  location   = "ENAM"
}

# Queues
resource "cloudflare_queue" "vau_queue" {
  account_id = var.cloudflare_account_id
  queue_name = "vau-queue-${var.environment}"
}

resource "cloudflare_queue" "reward_queue" {
  account_id = var.cloudflare_account_id
  queue_name = "reward-queue-${var.environment}"
}

resource "cloudflare_queue" "analytics_queue" {
  account_id = var.cloudflare_account_id
  queue_name = "analytics-queue-${var.environment}"
}

# Durable Objects worker (defines DO classes + namespaces)
resource "cloudflare_workers_script" "durable_objects" {
  account_id  = var.cloudflare_account_id
  script_name = local.durable_objects_script_name

  content_file   = local.durable_objects_file
  content_sha256 = filesha256(local.durable_objects_file)
  main_module    = basename(local.durable_objects_file)

  compatibility_date  = local.compatibility_date
  compatibility_flags = local.compatibility_flags

  bindings = [
    {
      type       = "durable_object_namespace"
      name       = "RATE_LIMITER"
      class_name = "RateLimiter"
    },
    {
      type       = "durable_object_namespace"
      name       = "SESSION_MANAGER"
      class_name = "SessionManager"
    },
    {
      type       = "durable_object_namespace"
      name       = "VAU_AGGREGATOR"
      class_name = "VAUAggregator"
    },
    {
      type = "plain_text"
      name = "ENVIRONMENT"
      text = var.environment
    },
  ]

  migrations = {
    new_tag     = "v1"
    new_classes = ["RateLimiter", "SessionManager", "VAUAggregator"]
  }
}

# Main VAU processor worker
resource "cloudflare_workers_script" "vau_processor" {
  account_id  = var.cloudflare_account_id
  script_name = local.vau_processor_script_name

  content_file   = local.vau_processor_file
  content_sha256 = filesha256(local.vau_processor_file)
  main_module    = basename(local.vau_processor_file)

  compatibility_date  = local.compatibility_date
  compatibility_flags = local.compatibility_flags

  bindings = [
    # KV
    {
      type         = "kv_namespace"
      name         = "RATE_LIMITS"
      namespace_id = cloudflare_workers_kv_namespace.rate_limits.id
    },
    {
      type         = "kv_namespace"
      name         = "DEVICE_REGISTRY"
      namespace_id = cloudflare_workers_kv_namespace.device_registry.id
    },
    {
      type         = "kv_namespace"
      name         = "ATTESTATION_CACHE"
      namespace_id = cloudflare_workers_kv_namespace.attestation_cache.id
    },
    {
      type         = "kv_namespace"
      name         = "BLOOM_FILTERS"
      namespace_id = cloudflare_workers_kv_namespace.bloom_filters.id
    },
    {
      type         = "kv_namespace"
      name         = "KV"
      namespace_id = cloudflare_workers_kv_namespace.kv.id
    },

    # R2
    {
      type        = "r2_bucket"
      name        = "AUDIT_LOGS"
      bucket_name = cloudflare_r2_bucket.audit_logs.name
    },
    {
      type        = "r2_bucket"
      name        = "ANALYTICS_DATA"
      bucket_name = cloudflare_r2_bucket.analytics_data.name
    },

    # Queues
    {
      type       = "queue"
      name       = "VAU_QUEUE"
      queue_name = cloudflare_queue.vau_queue.queue_name
    },
    {
      type       = "queue"
      name       = "REWARD_QUEUE"
      queue_name = cloudflare_queue.reward_queue.queue_name
    },
    {
      type       = "queue"
      name       = "ANALYTICS_QUEUE"
      queue_name = cloudflare_queue.analytics_queue.queue_name
    },

    # Durable Objects
    {
      type        = "durable_object_namespace"
      name        = "RATE_LIMITER"
      class_name  = "RateLimiter"
      script_name = cloudflare_workers_script.durable_objects.script_name
    },
    {
      type        = "durable_object_namespace"
      name        = "SESSION_MANAGER"
      class_name  = "SessionManager"
      script_name = cloudflare_workers_script.durable_objects.script_name
    },
    {
      type        = "durable_object_namespace"
      name        = "VAU_AGGREGATOR"
      class_name  = "VAUAggregator"
      script_name = cloudflare_workers_script.durable_objects.script_name
    },

    # Runtime config
    {
      type = "plain_text"
      name = "ENVIRONMENT"
      text = var.environment
    },
    {
      type = "secret_text"
      name = "HMAC_SECRET"
      text = var.hmac_secret
    },
    {
      type = "secret_text"
      name = "SOLANA_RPC"
      text = var.solana_rpc
    },
    {
      type = "plain_text"
      name = "TWIST_PROGRAM_ID"
      text = var.twist_program_id
    },
  ]
}

# Security worker (not routed by default; kept for future internal wiring)
resource "cloudflare_workers_script" "security_worker" {
  account_id  = var.cloudflare_account_id
  script_name = local.security_worker_script_name

  content_file   = local.security_worker_file
  content_sha256 = filesha256(local.security_worker_file)
  main_module    = basename(local.security_worker_file)

  compatibility_date  = local.compatibility_date
  compatibility_flags = local.compatibility_flags

  bindings = [
    {
      type         = "kv_namespace"
      name         = "KV"
      namespace_id = cloudflare_workers_kv_namespace.kv.id
    },
    {
      type        = "r2_bucket"
      name        = "AUDIT_LOGS"
      bucket_name = cloudflare_r2_bucket.audit_logs.name
    },

    # Durable Objects (rate limiting)
    {
      type        = "durable_object_namespace"
      name        = "RATE_LIMITER"
      class_name  = "RateLimiter"
      script_name = cloudflare_workers_script.durable_objects.script_name
    },

    {
      type = "plain_text"
      name = "ENVIRONMENT"
      text = var.environment
    },
    {
      type = "secret_text"
      name = "PAGERDUTY_TOKEN"
      text = var.pagerduty_token
    },
    {
      type = "secret_text"
      name = "PAGERDUTY_ROUTING_KEY"
      text = var.pagerduty_routing_key
    },
  ]

}

# Routes (only the public VAU/health/metrics endpoints)
resource "cloudflare_workers_route" "vau_api" {
  zone_id = data.cloudflare_zone.zone.id
  pattern = "${var.api_domain}/api/v1/vau*"
  script  = cloudflare_workers_script.vau_processor.script_name
}

resource "cloudflare_workers_route" "health" {
  zone_id = data.cloudflare_zone.zone.id
  pattern = "${var.api_domain}/health"
  script  = cloudflare_workers_script.vau_processor.script_name
}

resource "cloudflare_workers_route" "metrics" {
  zone_id = data.cloudflare_zone.zone.id
  pattern = "${var.api_domain}/metrics"
  script  = cloudflare_workers_script.vau_processor.script_name
}

# WAF Rules
resource "cloudflare_ruleset" "security_rules" {
  zone_id     = data.cloudflare_zone.zone.id
  name        = "twist-security-rules-${var.environment}"
  description = "Security rules for TWIST platform"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      action      = "block"
      expression  = "(http.request.uri.query contains \"script\" and http.request.uri.query contains \"<\") or (http.request.uri.query contains \"union\" and http.request.uri.query contains \"select\")"
      description = "Block SQL injection and XSS attempts"
      enabled     = true
    },
    {
      action      = "challenge"
      expression  = "(http.user_agent contains \"bot\" and not http.user_agent contains \"googlebot\") or http.user_agent contains \"crawler\""
      description = "Challenge suspicious bots"
      enabled     = true
    },
    {
      action      = "block"
      expression  = "http.request.body.size > 1048576"
      description = "Block requests larger than 1MB"
      enabled     = true
    },
    {
      action      = "block"
      expression  = "ip.geoip.country in {\"KP\" \"IR\" \"SY\" \"CU\"}"
      description = "Block sanctioned countries"
      enabled     = true
    },
  ]
}
