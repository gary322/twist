#!/bin/bash

# TWIST Platform Production Deployment

set -euo pipefail

echo "🚀 TWIST Platform Production Deployment"
echo "======================================"

# Check prerequisites
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Copy .env.production.template to .env and configure"
    exit 1
fi

# Load environment
source .env

# Build all services
echo "📦 Building all services..."
docker-compose -f docker/production/docker-compose.yml build

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose -f docker/production/docker-compose.yml run --rm auth-service npm run migrate

# Deploy services
echo "🚀 Deploying services..."
docker-compose -f docker/production/docker-compose.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Run health checks
echo "🏥 Running health checks..."
./scripts/monitoring/health-check.sh

echo ""
echo "✅ Deployment complete!"
echo "🌐 Platform available at: https://twist.finance"
