#!/bin/bash

# Load Testing Script for Influencer Staking System
# This script runs various load testing scenarios using k6, Artillery, and Locust

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL=${BASE_URL:-"http://localhost:3000"}
WS_URL=${WS_URL:-"ws://localhost:3000"}
TEST_DURATION=${TEST_DURATION:-"30m"}
REPORT_DIR="./reports/$(date +%Y%m%d_%H%M%S)"

# Create report directory
mkdir -p "$REPORT_DIR"

echo -e "${GREEN}Starting Load Tests for Influencer Staking System${NC}"
echo "Base URL: $BASE_URL"
echo "WebSocket URL: $WS_URL"
echo "Test Duration: $TEST_DURATION"
echo "Reports Directory: $REPORT_DIR"
echo ""

# Function to check if a tool is installed
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        echo "Please install $1 before running this script"
        exit 1
    fi
}

# Check required tools
echo -e "${YELLOW}Checking required tools...${NC}"
check_tool k6
check_tool artillery
check_tool python3

# Install Python dependencies if needed
if ! python3 -c "import locust" 2>/dev/null; then
    echo -e "${YELLOW}Installing Locust...${NC}"
    pip3 install locust
fi

# Function to run k6 tests
run_k6_tests() {
    echo -e "\n${GREEN}Running k6 Load Tests${NC}"
    
    # Basic load test
    echo -e "${YELLOW}1. Running basic load test...${NC}"
    k6 run \
        --out json="$REPORT_DIR/k6-basic-results.json" \
        --out influxdb=http://localhost:8086/k6 \
        --summary-export="$REPORT_DIR/k6-basic-summary.json" \
        -e BASE_URL="$BASE_URL" \
        -e WS_URL="$WS_URL" \
        ./load-test.ts
    
    # Stress test
    echo -e "${YELLOW}2. Running stress test...${NC}"
    k6 run \
        --vus 2000 \
        --duration 15m \
        --out json="$REPORT_DIR/k6-stress-results.json" \
        --summary-export="$REPORT_DIR/k6-stress-summary.json" \
        -e BASE_URL="$BASE_URL" \
        -e WS_URL="$WS_URL" \
        -e scenario=stress \
        ./load-test.ts
    
    # Spike test
    echo -e "${YELLOW}3. Running spike test...${NC}"
    k6 run \
        --stage "5m:100,1m:2000,5m:2000,1m:100,5m:100" \
        --out json="$REPORT_DIR/k6-spike-results.json" \
        --summary-export="$REPORT_DIR/k6-spike-summary.json" \
        -e BASE_URL="$BASE_URL" \
        -e WS_URL="$WS_URL" \
        ./load-test.ts
    
    # Soak test (reduced duration for demo)
    echo -e "${YELLOW}4. Running soak test (5 minutes demo)...${NC}"
    k6 run \
        --vus 500 \
        --duration 5m \
        --out json="$REPORT_DIR/k6-soak-results.json" \
        --summary-export="$REPORT_DIR/k6-soak-summary.json" \
        -e BASE_URL="$BASE_URL" \
        -e WS_URL="$WS_URL" \
        ./load-test.ts
}

# Function to run Artillery tests
run_artillery_tests() {
    echo -e "\n${GREEN}Running Artillery Load Tests${NC}"
    
    # Update Artillery config with actual URLs
    sed -i.bak "s|http://localhost:3000|$BASE_URL|g" artillery-load-test.yml
    sed -i.bak "s|ws://localhost:3000|$WS_URL|g" artillery-load-test.yml
    
    # Run Artillery test
    echo -e "${YELLOW}Running Artillery comprehensive test...${NC}"
    artillery run \
        --output "$REPORT_DIR/artillery-report.json" \
        artillery-load-test.yml
    
    # Generate HTML report
    artillery report "$REPORT_DIR/artillery-report.json" \
        --output "$REPORT_DIR/artillery-report.html"
    
    # Quick load test
    echo -e "${YELLOW}Running Artillery quick test...${NC}"
    artillery quick \
        --count 1000 \
        --num 50 \
        --output "$REPORT_DIR/artillery-quick.json" \
        "$BASE_URL/api/staking/search?query=test"
    
    # Restore original config
    mv artillery-load-test.yml.bak artillery-load-test.yml
}

# Function to run Locust tests
run_locust_tests() {
    echo -e "\n${GREEN}Running Locust Load Tests${NC}"
    
    # Headless test
    echo -e "${YELLOW}Running Locust headless test...${NC}"
    locust \
        -f locust-load-test.py \
        --host="$BASE_URL" \
        --headless \
        -u 1000 \
        -r 10 \
        -t 10m \
        --html "$REPORT_DIR/locust-report.html" \
        --csv "$REPORT_DIR/locust" \
        --logfile "$REPORT_DIR/locust.log"
    
    echo -e "${YELLOW}Locust web UI available at http://localhost:8089${NC}"
    echo "Run 'locust -f locust-load-test.py --host=$BASE_URL' for interactive testing"
}

# Function to analyze results
analyze_results() {
    echo -e "\n${GREEN}Analyzing Test Results${NC}"
    
    # Create summary report
    cat > "$REPORT_DIR/summary.txt" << EOF
Load Test Summary Report
========================
Date: $(date)
Base URL: $BASE_URL
Test Duration: $TEST_DURATION

K6 Test Results:
----------------
EOF
    
    # Add k6 summaries if they exist
    for summary in "$REPORT_DIR"/k6-*-summary.json; do
        if [ -f "$summary" ]; then
            echo -e "\n$(basename $summary):" >> "$REPORT_DIR/summary.txt"
            python3 -c "
import json
with open('$summary') as f:
    data = json.load(f)
    metrics = data.get('metrics', {})
    for metric, values in metrics.items():
        if 'values' in values:
            print(f'  {metric}: {values[\"values\"]}')
" >> "$REPORT_DIR/summary.txt"
        fi
    done
    
    echo -e "\n${GREEN}Test results saved to: $REPORT_DIR${NC}"
    echo -e "${YELLOW}Summary available at: $REPORT_DIR/summary.txt${NC}"
}

# Function to monitor system resources during tests
monitor_resources() {
    echo -e "${YELLOW}Starting resource monitoring...${NC}"
    
    # Monitor CPU, memory, and network
    {
        while true; do
            echo "$(date +%s),$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}'),$(free | grep Mem | awk '{print ($3/$2) * 100.0}')" >> "$REPORT_DIR/resources.csv"
            sleep 5
        done
    } &
    MONITOR_PID=$!
    
    # Stop monitoring when script exits
    trap "kill $MONITOR_PID 2>/dev/null" EXIT
}

# Main execution
main() {
    # Start resource monitoring
    monitor_resources
    
    # Run tests based on arguments
    if [ $# -eq 0 ]; then
        # Run all tests
        run_k6_tests
        run_artillery_tests
        run_locust_tests
    else
        # Run specific tests
        for test in "$@"; do
            case $test in
                k6)
                    run_k6_tests
                    ;;
                artillery)
                    run_artillery_tests
                    ;;
                locust)
                    run_locust_tests
                    ;;
                *)
                    echo -e "${RED}Unknown test: $test${NC}"
                    echo "Available tests: k6, artillery, locust"
                    ;;
            esac
        done
    fi
    
    # Analyze results
    analyze_results
    
    echo -e "\n${GREEN}Load testing completed!${NC}"
}

# Run main function with all arguments
main "$@"