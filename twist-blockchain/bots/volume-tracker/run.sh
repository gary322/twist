#!/bin/bash

# TWIST Volume Tracker Runner Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."

echo -e "${GREEN}🚀 Starting TWIST Volume Tracker${NC}"
echo ""

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${YELLOW}⚠ No .env file found, using defaults${NC}"
fi

# Check if running as service
if [ "$1" == "--service" ]; then
    echo -e "${GREEN}Running as system service${NC}"
    cd "$SCRIPT_DIR"
    exec npm run start
fi

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"
cd "$PROJECT_ROOT"
npm install --production

# Build if needed
if [ ! -d "$PROJECT_ROOT/dist" ]; then
    echo -e "${YELLOW}Building project...${NC}"
    npm run build
fi

# Create data directory if needed
DATA_DIR="${VOLUME_DB_PATH:-./data}"
mkdir -p "$DATA_DIR"
echo -e "${GREEN}✓ Data directory ready: $DATA_DIR${NC}"

# Check if already running
PID_FILE="$DATA_DIR/volume-tracker.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${RED}Volume tracker already running with PID: $PID${NC}"
        echo "Stop it first with: $SCRIPT_DIR/stop.sh"
        exit 1
    else
        rm "$PID_FILE"
    fi
fi

# Start volume tracker
echo ""
echo -e "${GREEN}Starting volume tracker...${NC}"
echo -e "RPC URL: ${SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"
echo -e "Metrics Port: ${VOLUME_METRICS_PORT:-9092}"
echo -e "Update Interval: ${VOLUME_UPDATE_INTERVAL:-60000}ms"
echo ""

# Run in background if requested
if [ "$1" == "--daemon" ]; then
    nohup ts-node "$SCRIPT_DIR/index.ts" > "$DATA_DIR/volume-tracker.log" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    echo -e "${GREEN}✓ Volume tracker started in background (PID: $PID)${NC}"
    echo -e "Logs: tail -f $DATA_DIR/volume-tracker.log"
    echo -e "Stop: $SCRIPT_DIR/stop.sh"
else
    # Run in foreground
    cd "$SCRIPT_DIR"
    exec ts-node index.ts
fi