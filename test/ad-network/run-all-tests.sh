#!/bin/bash

# TWIST Ad Network Comprehensive Test Runner
# Runs all ad network component tests

echo "🚀 Starting TWIST Ad Network Test Suite"
echo "======================================="
echo ""

# Create test results directory
RESULTS_DIR="./test-results/ad-network-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Set environment variables
export NODE_ENV=test
export LOG_LEVEL=info
export TEST_TIMEOUT=300000

# Function to run test and capture results
run_test() {
    local test_name=$1
    local test_file=$2
    
    echo "🧪 Running $test_name..."
    
    if [ "$test_file" == "comprehensive-ad-test.ts" ]; then
        # Run the comprehensive simulation
        npx tsx "$test_file" > "$RESULTS_DIR/${test_name}.log" 2>&1
    else
        # Run Jest tests
        npx jest "$test_file" --verbose --coverage --coverageDirectory="$RESULTS_DIR/coverage" > "$RESULTS_DIR/${test_name}.log" 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ $test_name completed successfully"
    else
        echo "❌ $test_name failed"
    fi
    echo ""
}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --silent
fi

# Run all tests
echo "🏃 Running Ad Network Component Tests..."
echo "----------------------------------------"

# 1. RTB Engine Tests
run_test "RTB Engine Tests" "rtb-engine.test.ts"

# 2. Publisher Integration Tests
run_test "Publisher Integration Tests" "publisher-integration.test.ts"

# 3. User Rewards Tests
run_test "User Rewards Tests" "user-rewards.test.ts"

# 4. Campaign Attribution Tests
run_test "Campaign Attribution Tests" "campaign-attribution.test.ts"

# 5. Fraud Detection Tests
run_test "Fraud Detection Tests" "fraud-detection.test.ts"

# 6. Performance Tests
run_test "Performance Tests" "performance.test.ts"

# 7. Integration Tests
run_test "Integration Tests" "integration.test.ts"

# 8. Comprehensive Simulation
echo "🎮 Running Comprehensive Ad Network Simulation..."
echo "This will simulate 2 hours of ad network activity with:"
echo "- 20 advertisers"
echo "- 50 publishers" 
echo "- 1000 users"
echo "- Real-time bidding"
echo "- Click tracking"
echo "- Reward distribution"
echo ""
run_test "Comprehensive Simulation" "comprehensive-ad-test.ts"

# Generate summary report
echo "📊 Generating Test Summary..."
cat > "$RESULTS_DIR/summary.json" << EOF
{
  "testRun": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$NODE_ENV",
  "results": {
    "rtbEngine": "$(grep -c "✓" $RESULTS_DIR/RTB*.log || echo 0) passed",
    "publisherIntegration": "$(grep -c "✓" $RESULTS_DIR/Publisher*.log || echo 0) passed",
    "userRewards": "$(grep -c "✓" $RESULTS_DIR/User*.log || echo 0) passed",
    "simulation": "$(grep -c "Test Complete" $RESULTS_DIR/Comprehensive*.log || echo 0)"
  }
}
EOF

# Display final results
echo ""
echo "======================================="
echo "📈 Test Results Summary"
echo "======================================="
echo "Results saved to: $RESULTS_DIR"
echo ""

# Check if comprehensive simulation completed
if grep -q "Test Complete" "$RESULTS_DIR/Comprehensive Simulation.log" 2>/dev/null; then
    echo "✅ Ad Network Simulation: SUCCESS"
    tail -n 50 "$RESULTS_DIR/Comprehensive Simulation.log" | grep -E "(totalImpressions|totalClicks|totalRewards|totalSpend)"
else
    echo "❌ Ad Network Simulation: FAILED or INCOMPLETE"
fi

echo ""
echo "🏁 All tests completed!"
echo "Check $RESULTS_DIR for detailed results"