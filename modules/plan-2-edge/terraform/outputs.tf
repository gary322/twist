output "worker_urls" {
  description = "URLs for the deployed workers"
  value = {
    vau_processor = "https://${var.api_domain}/api/v1/vau"
    health_check  = "https://${var.api_domain}/health"
    metrics       = "https://${var.api_domain}/metrics"
  }
}

output "kv_namespaces" {
  description = "KV namespace IDs"
  value = {
    rate_limits       = cloudflare_workers_kv_namespace.rate_limits.id
    device_registry   = cloudflare_workers_kv_namespace.device_registry.id
    attestation_cache = cloudflare_workers_kv_namespace.attestation_cache.id
    bloom_filters     = cloudflare_workers_kv_namespace.bloom_filters.id
    kv               = cloudflare_workers_kv_namespace.kv.id
  }
}

output "r2_buckets" {
  description = "R2 bucket names"
  value = {
    audit_logs     = cloudflare_r2_bucket.audit_logs.name
    analytics_data = cloudflare_r2_bucket.analytics_data.name
  }
}

output "queue_names" {
  description = "Queue names"
  value = {
    vau_queue       = cloudflare_queue.vau_queue.name
    reward_queue    = cloudflare_queue.reward_queue.name
    analytics_queue = cloudflare_queue.analytics_queue.name
  }
}

output "durable_object_namespaces" {
  description = "Durable Object namespace IDs"
  value = {
    rate_limiter     = cloudflare_durable_object_namespace.rate_limiter.id
    session_manager  = cloudflare_durable_object_namespace.session_manager.id
    vau_aggregator   = cloudflare_durable_object_namespace.vau_aggregator.id
  }
}

output "worker_scripts" {
  description = "Worker script names"
  value = {
    vau_processor   = cloudflare_worker_script.vau_processor.name
    security_worker = cloudflare_worker_script.security_worker.name
    durable_objects = cloudflare_workers_script.durable_objects.name
  }
}

output "waf_ruleset_id" {
  description = "WAF ruleset ID"
  value       = cloudflare_ruleset.security_rules.id
}

output "rate_limit_ids" {
  description = "Rate limit rule IDs"
  value = {
    api_rate_limit = cloudflare_rate_limit.api_rate_limit.id
    vau_rate_limit = cloudflare_rate_limit.vau_rate_limit.id
  }
}

output "api_endpoint" {
  description = "Main API endpoint"
  value       = "https://${var.api_domain}"
}

output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "deployment_info" {
  description = "Deployment information for monitoring"
  value = {
    environment   = var.environment
    api_domain    = var.api_domain
    worker_count  = var.worker_count
    deployed_at   = timestamp()
  }
}