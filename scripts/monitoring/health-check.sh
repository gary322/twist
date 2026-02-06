#!/bin/bash

# TWIST Platform Health Check

SERVICES=(
    "auth-service:3001"
    "publisher-api:3006"
    "advertiser-api:3007"
    "influencer-api:3008"
    "analytics:3010"
)

echo "🏥 TWIST Platform Health Check"
echo "=============================="

ALL_HEALTHY=true

for SERVICE in "${SERVICES[@]}"; do
    IFS=':' read -r NAME PORT <<< "$SERVICE"
    
    if curl -f -s "http://localhost:$PORT/health" > /dev/null; then
        echo "✅ $NAME: Healthy"
    else
        echo "❌ $NAME: Unhealthy"
        ALL_HEALTHY=false
    fi
done

if $ALL_HEALTHY; then
    echo ""
    echo "✅ All services are healthy!"
    exit 0
else
    echo ""
    echo "❌ Some services are unhealthy!"
    exit 1
fi
