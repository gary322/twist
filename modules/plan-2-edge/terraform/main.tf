terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
  
  backend "s3" {
    bucket = "twist-terraform-state"
    key    = "edge/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
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
  name       = "vau-queue-${var.environment}"
}

resource "cloudflare_queue" "reward_queue" {
  account_id = var.cloudflare_account_id
  name       = "reward-queue-${var.environment}"
}

resource "cloudflare_queue" "analytics_queue" {
  account_id = var.cloudflare_account_id
  name       = "analytics-queue-${var.environment}"
}

# Workers
resource "cloudflare_worker_script" "vau_processor" {
  account_id = var.cloudflare_account_id
  name       = "vau-processor-${var.environment}"
  content    = file("${path.module}/../dist/workers/vau-processor.js")
  
  kv_namespace_binding {
    name         = "RATE_LIMITS"
    namespace_id = cloudflare_workers_kv_namespace.rate_limits.id
  }
  
  kv_namespace_binding {
    name         = "DEVICE_REGISTRY"
    namespace_id = cloudflare_workers_kv_namespace.device_registry.id
  }
  
  kv_namespace_binding {
    name         = "ATTESTATION_CACHE"
    namespace_id = cloudflare_workers_kv_namespace.attestation_cache.id
  }
  
  kv_namespace_binding {
    name         = "BLOOM_FILTERS"
    namespace_id = cloudflare_workers_kv_namespace.bloom_filters.id
  }
  
  kv_namespace_binding {
    name         = "KV"
    namespace_id = cloudflare_workers_kv_namespace.kv.id
  }
  
  r2_bucket_binding {
    name        = "AUDIT_LOGS"
    bucket_name = cloudflare_r2_bucket.audit_logs.name
  }
  
  r2_bucket_binding {
    name        = "ANALYTICS_DATA"
    bucket_name = cloudflare_r2_bucket.analytics_data.name
  }
  
  queue_binding {
    binding = "VAU_QUEUE"
    queue   = cloudflare_queue.vau_queue.name
  }
  
  queue_binding {
    binding = "REWARD_QUEUE"
    queue   = cloudflare_queue.reward_queue.name
  }
  
  queue_binding {
    binding = "ANALYTICS_QUEUE"
    queue   = cloudflare_queue.analytics_queue.name
  }
  
  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }
  
  secret_text_binding {
    name = "HMAC_SECRET"
    text = var.hmac_secret
  }
  
  secret_text_binding {
    name = "SOLANA_RPC"
    text = var.solana_rpc
  }
  
  secret_text_binding {
    name = "TWIST_PROGRAM_ID"
    text = var.twist_program_id
  }
}

resource "cloudflare_worker_script" "security_worker" {
  account_id = var.cloudflare_account_id
  name       = "security-worker-${var.environment}"
  content    = file("${path.module}/../dist/workers/security-worker.js")
  
  kv_namespace_binding {
    name         = "KV"
    namespace_id = cloudflare_workers_kv_namespace.kv.id
  }
  
  r2_bucket_binding {
    name        = "AUDIT_LOGS"
    bucket_name = cloudflare_r2_bucket.audit_logs.name
  }
  
  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }
  
  secret_text_binding {
    name = "PAGERDUTY_TOKEN"
    text = var.pagerduty_token
  }
  
  secret_text_binding {
    name = "PAGERDUTY_ROUTING_KEY"
    text = var.pagerduty_routing_key
  }
}

# Durable Objects
resource "cloudflare_workers_script" "durable_objects" {
  account_id = var.cloudflare_account_id
  name       = "durable-objects-${var.environment}"
  content    = file("${path.module}/../dist/durable-objects/index.js")
  
  module = true
}

resource "cloudflare_durable_object_namespace" "rate_limiter" {
  account_id = var.cloudflare_account_id
  name       = "rate-limiter-${var.environment}"
  script     = cloudflare_workers_script.durable_objects.name
  class      = "RateLimiter"
}

resource "cloudflare_durable_object_namespace" "session_manager" {
  account_id = var.cloudflare_account_id
  name       = "session-manager-${var.environment}"
  script     = cloudflare_workers_script.durable_objects.name
  class      = "SessionManager"
}

resource "cloudflare_durable_object_namespace" "vau_aggregator" {
  account_id = var.cloudflare_account_id
  name       = "vau-aggregator-${var.environment}"
  script     = cloudflare_workers_script.durable_objects.name
  class      = "VAUAggregator"
}

# Routes
resource "cloudflare_worker_route" "vau_api" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "${var.api_domain}/api/v1/vau*"
  script_name = cloudflare_worker_script.vau_processor.name
}

resource "cloudflare_worker_route" "health" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "${var.api_domain}/health"
  script_name = cloudflare_worker_script.vau_processor.name
}

resource "cloudflare_worker_route" "metrics" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "${var.api_domain}/metrics"
  script_name = cloudflare_worker_script.vau_processor.name
}

resource "cloudflare_worker_route" "security" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "${var.api_domain}/*"
  script_name = cloudflare_worker_script.security_worker.name
}

# WAF Rules
resource "cloudflare_ruleset" "security_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "twist-security-rules-${var.environment}"
  description = "Security rules for TWIST platform"
  kind        = "zone"
  phase       = "http_request_firewall_custom"
  
  rules {
    action      = "block"
    expression  = "(http.request.uri.query contains \"script\" and http.request.uri.query contains \"<\") or (http.request.uri.query contains \"union\" and http.request.uri.query contains \"select\")"
    description = "Block SQL injection and XSS attempts"
  }
  
  rules {
    action      = "challenge"
    expression  = "(http.user_agent contains \"bot\" and not http.user_agent contains \"googlebot\") or http.user_agent contains \"crawler\""
    description = "Challenge suspicious bots"
  }
  
  rules {
    action      = "block"
    expression  = "http.request.body.size > 1048576"
    description = "Block requests larger than 1MB"
  }
  
  rules {
    action      = "block"
    expression  = "ip.geoip.country in {\"KP\" \"IR\" \"SY\" \"CU\"}"
    description = "Block sanctioned countries"
  }
}

# Rate Limiting Rules
resource "cloudflare_rate_limit" "api_rate_limit" {
  zone_id   = var.cloudflare_zone_id
  threshold = 100
  period    = 60
  
  match {
    request {
      url_pattern = "${var.api_domain}/api/v1/*"
    }
  }
  
  action {
    mode    = "challenge"
    timeout = 60
  }
}

resource "cloudflare_rate_limit" "vau_rate_limit" {
  zone_id   = var.cloudflare_zone_id
  threshold = 1000
  period    = 60
  
  match {
    request {
      url_pattern = "${var.api_domain}/api/v1/vau"
    }
  }
  
  action {
    mode    = "simulate"
    timeout = 60
  }
}

# Page Rules for Caching
resource "cloudflare_page_rule" "static_cache" {
  zone_id  = var.cloudflare_zone_id
  target   = "${var.api_domain}/static/*"
  priority = 1
  
  actions {
    cache_level        = "cache_everything"
    edge_cache_ttl     = 31536000 # 1 year
    browser_cache_ttl  = 31536000
  }
}

resource "cloudflare_page_rule" "api_cache" {
  zone_id  = var.cloudflare_zone_id
  target   = "${var.api_domain}/api/v1/config"
  priority = 2
  
  actions {
    cache_level        = "cache_everything"
    edge_cache_ttl     = 60      # 1 minute
    browser_cache_ttl  = 300     # 5 minutes
  }
}

# DNS Records
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  type    = "CNAME"
  value   = "${var.cloudflare_account_id}.workers.dev"
  proxied = true
}

# Logpush for analytics
resource "cloudflare_logpush_job" "edge_logs" {
  account_id          = var.cloudflare_account_id
  enabled             = true
  name                = "twist-edge-logs-${var.environment}"
  logpull_options     = "fields=ClientIP,EdgeEndTimestamp,EdgeResponseBytes,EdgeResponseStatus,EdgeStartTimestamp,RayID,EdgeRequestHost&timestamps=rfc3339"
  destination_conf    = "r2://twist-logs-${var.environment}/edge"
  dataset             = "workers_trace_events"
  frequency           = "high"
}