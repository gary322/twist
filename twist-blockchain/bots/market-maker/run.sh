#!/bin/bash

# TWIST Market Maker Bot Runner Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."

echo -e "${BLUE}🤖 TWIST Market Maker Bot${NC}"
echo -e "${BLUE}========================${NC}"
echo ""

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${YELLOW}⚠ No .env file found, using defaults${NC}"
fi

# Check wallet file
WALLET_PATH="${MARKET_MAKER_WALLET:-./wallet.json}"
if [ ! -f "$WALLET_PATH" ]; then
    echo -e "${RED}❌ Wallet file not found at: $WALLET_PATH${NC}"
    echo -e "${YELLOW}Create a wallet with: solana-keygen new -o $WALLET_PATH${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Wallet file found${NC}"

# Verify wallet balance
echo -e "${YELLOW}Checking wallet balance...${NC}"
WALLET_ADDRESS=$(solana address -k "$WALLET_PATH" 2>/dev/null || echo "unknown")
echo -e "Wallet address: ${WALLET_ADDRESS}"

# Safety check
if [ "$1" != "--confirm" ] && [ "$SOLANA_NETWORK" == "mainnet-beta" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  WARNING: Running on MAINNET${NC}"
    echo -e "${YELLOW}This bot will trade with real funds!${NC}"
    echo ""
    echo -e "Current configuration:"
    echo -e "  RPC: ${SOLANA_RPC_URL:-default}"
    echo -e "  Base spread: ${BASE_SPREAD_BPS:-50} bps"
    echo -e "  Max exposure: \$${MAX_EXPOSURE:-20000}"
    echo -e "  Target TWIST: ${TARGET_TWIST_INVENTORY:-100000}"
    echo -e "  Target USDC: \$${TARGET_USDC_INVENTORY:-5000}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}Cancelled${NC}"
        exit 1
    fi
fi

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"
cd "$PROJECT_ROOT"
if [ ! -d "node_modules" ]; then
    npm install --production
fi
echo -e "${GREEN}✓ Dependencies ready${NC}"

# Start market maker
echo ""
echo -e "${GREEN}Starting market maker...${NC}"
echo -e "Press Ctrl+C to stop"
echo ""

cd "$SCRIPT_DIR"
exec ts-node index.ts