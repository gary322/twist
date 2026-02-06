#!/bin/bash

# TWIST Volume Tracker Stop Script

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DATA_DIR="${VOLUME_DB_PATH:-./data}"
PID_FILE="$DATA_DIR/volume-tracker.pid"

echo -e "${YELLOW}Stopping TWIST Volume Tracker...${NC}"

if [ ! -f "$PID_FILE" ]; then
    echo -e "${RED}No PID file found. Volume tracker may not be running.${NC}"
    exit 1
fi

PID=$(cat "$PID_FILE")

if ps -p $PID > /dev/null 2>&1; then
    echo -e "Stopping process with PID: $PID"
    kill -SIGINT $PID
    
    # Wait for graceful shutdown
    for i in {1..10}; do
        if ! ps -p $PID > /dev/null 2>&1; then
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    
    # Force kill if still running
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${YELLOW}Force killing process...${NC}"
        kill -9 $PID
    fi
    
    rm "$PID_FILE"
    echo -e "${GREEN}✓ Volume tracker stopped${NC}"
else
    echo -e "${YELLOW}Process not found. Removing stale PID file.${NC}"
    rm "$PID_FILE"
fi