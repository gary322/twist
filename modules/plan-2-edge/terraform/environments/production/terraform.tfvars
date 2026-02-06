environment       = "production"
api_domain       = "api.twist.io"
worker_count     = 10
kv_rate_limit    = 10000
enable_strict_waf = true

# Queue settings for production
queue_batch_size    = 100
queue_batch_timeout = 5

# Cache settings
cache_ttl_static = 31536000  # 1 year
cache_ttl_api    = 60        # 1 minute

# Geographic restrictions
allowed_countries = []  # Allow all except blocked
blocked_countries = ["KP", "IR", "SY", "CU", "VE"]

tags = {
  Project     = "TWIST"
  Component   = "Edge"
  Environment = "Production"
  ManagedBy   = "Terraform"
  CostCenter  = "Infrastructure"
}