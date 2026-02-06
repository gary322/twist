variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the domain"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "api_domain" {
  description = "API domain (e.g., api.twist.io)"
  type        = string
}

variable "hmac_secret" {
  description = "HMAC secret for request signing"
  type        = string
  sensitive   = true
}

variable "solana_rpc" {
  description = "Solana RPC endpoint"
  type        = string
  sensitive   = true
}

variable "twist_program_id" {
  description = "TWIST program ID on Solana"
  type        = string
}

variable "pagerduty_token" {
  description = "PagerDuty API token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "pagerduty_routing_key" {
  description = "PagerDuty routing key for alerts"
  type        = string
  sensitive   = true
  default     = ""
}

variable "worker_count" {
  description = "Number of worker instances"
  type        = number
  default     = 5
}

variable "kv_rate_limit" {
  description = "KV operations rate limit per minute"
  type        = number
  default     = 1000
}

variable "r2_storage_class" {
  description = "R2 storage class for buckets"
  type        = string
  default     = "Standard"
}

variable "queue_batch_size" {
  description = "Default queue batch size"
  type        = number
  default     = 100
}

variable "queue_batch_timeout" {
  description = "Queue batch timeout in seconds"
  type        = number
  default     = 5
}

variable "enable_strict_waf" {
  description = "Enable strict WAF rules"
  type        = bool
  default     = false
}

variable "allowed_countries" {
  description = "List of allowed countries (ISO codes)"
  type        = list(string)
  default     = []
}

variable "blocked_countries" {
  description = "List of blocked countries (ISO codes)"
  type        = list(string)
  default     = ["KP", "IR", "SY", "CU"]
}

variable "cache_ttl_static" {
  description = "TTL for static assets in seconds"
  type        = number
  default     = 31536000 # 1 year
}

variable "cache_ttl_api" {
  description = "TTL for API responses in seconds"
  type        = number
  default     = 60
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "TWIST"
    Component   = "Edge"
    ManagedBy   = "Terraform"
  }
}