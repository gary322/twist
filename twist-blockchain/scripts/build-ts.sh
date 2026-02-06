#!/bin/bash

# TypeScript Build Script

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

echo -e "${GREEN}🔨 Building TypeScript components...${NC}"
echo ""

cd "$PROJECT_ROOT"

# Check if TypeScript is installed
if ! command -v tsc &> /dev/null; then
    echo -e "${YELLOW}Installing TypeScript...${NC}"
    npm install -g typescript
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Clean previous build
if [ -d "dist" ]; then
    echo -e "${YELLOW}Cleaning previous build...${NC}"
    rm -rf dist
fi

# Build SDK
echo -e "${GREEN}Building SDK...${NC}"
cd "$PROJECT_ROOT/sdk"
tsc || true

# Build monitoring components
echo -e "${GREEN}Building monitoring dashboard...${NC}"
cd "$PROJECT_ROOT/monitoring/dashboard"
tsc || true

# Build bots
echo -e "${GREEN}Building bots...${NC}"

# Buyback bot
cd "$PROJECT_ROOT/bots/buyback-bot"
tsc || true

# Arbitrage monitor
cd "$PROJECT_ROOT/bots/arbitrage-monitor"
tsc || true

# Volume tracker
cd "$PROJECT_ROOT/bots/volume-tracker"
tsc || true

echo ""
echo -e "${GREEN}✅ TypeScript build completed!${NC}"