environment       = "staging"
api_domain       = "api-staging.twist.io"
cloudflare_zone_name = "twist.io"
worker_count     = 3
kv_rate_limit    = 5000
enable_strict_waf = true

# Queue settings for staging
queue_batch_size    = 50
queue_batch_timeout = 10

# Cache settings
cache_ttl_static = 3600  # 1 hour
cache_ttl_api    = 30    # 30 seconds

# Geographic restrictions
allowed_countries = []  # Allow all except blocked
blocked_countries = ["KP", "IR", "SY", "CU"]

tags = {
  Project     = "TWIST"
  Component   = "Edge"
  Environment = "Staging"
  ManagedBy   = "Terraform"
  CostCenter  = "Development"
}
