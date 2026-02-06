#!/bin/bash

# Run Tests with All Fixes Applied
# This script ensures all test fixes are properly configured before running tests

echo "🔧 TWIST Token Test Runner with Fixes"
echo "===================================="
echo ""

# Set environment variables
export NODE_ENV=test
export TEST_TYPE=${1:-all}
export USE_TEST_FIXES=true
export RETRY_FAILED_TESTS=true

# Configure timeouts
export DEFAULT_TIMEOUT=30000
export BRIDGE_TIMEOUT=180000
export JEST_TIMEOUT=120000

# Configure RPC endpoints (use test keys)
export HELIUS_API_KEY=${HELIUS_API_KEY:-test-helius-key}
export QUICKNODE_API_KEY=${QUICKNODE_API_KEY:-test-quicknode-key}
export ALCHEMY_API_KEY=${ALCHEMY_API_KEY:-test-alchemy-key}
export INFURA_KEY=${INFURA_KEY:-test-infura-key}
export CHAINSTACK_API_KEY=${CHAINSTACK_API_KEY:-test-chainstack-key}

echo "📋 Test Configuration:"
echo "  - Test Type: $TEST_TYPE"
echo "  - Default Timeout: ${DEFAULT_TIMEOUT}ms"
echo "  - Bridge Timeout: ${BRIDGE_TIMEOUT}ms"
echo "  - Jest Timeout: ${JEST_TIMEOUT}ms"
echo "  - Retry Failed: $RETRY_FAILED_TESTS"
echo ""

# Clean previous test artifacts
echo "🧹 Cleaning previous test artifacts..."
rm -rf coverage/
rm -rf test-results/
rm -rf .jest-cache/
mkdir -p test-results

# Copy CSS fixes to build directory if needed
echo "📄 Ensuring CSS fixes are in place..."
if [ -d "build" ]; then
  cp -f src/components/wallet/wallet-integration.css build/static/css/ 2>/dev/null || true
fi

# Function to run specific test suite
run_test_suite() {
  local suite=$1
  local name=$2
  
  echo ""
  echo "🧪 Running $name tests..."
  
  # Use appropriate Jest config
  if [ "$suite" == "ui" ]; then
    # UI tests need DOM environment
    npm test -- \
      --testEnvironment=jsdom \
      --testMatch="**/*wallet*.test.{ts,tsx}" \
      --setupFilesAfterEnv="<rootDir>/test/setup/cleanup.ts" \
      --testTimeout=$JEST_TIMEOUT \
      --maxWorkers=50% \
      --coverage \
      --coverageDirectory=coverage/$suite \
      --json \
      --outputFile=test-results/$suite.json \
      || handle_test_failure $suite
  elif [ "$suite" == "rpc" ]; then
    # RPC tests need longer timeouts
    npm test -- \
      --testMatch="**/*integration*.test.ts" \
      --setupFilesAfterEnv="<rootDir>/test/setup/cleanup.ts" \
      --testTimeout=$JEST_TIMEOUT \
      --maxWorkers=2 \
      --runInBand \
      --coverage \
      --coverageDirectory=coverage/$suite \
      --json \
      --outputFile=test-results/$suite.json \
      || handle_test_failure $suite
  elif [ "$suite" == "bridge" ]; then
    # Bridge tests need special timeout handling
    npm test -- \
      --testMatch="**/bridge*.test.ts" \
      --setupFilesAfterEnv="<rootDir>/test/setup/cleanup.ts" \
      --testTimeout=$BRIDGE_TIMEOUT \
      --maxWorkers=1 \
      --coverage \
      --coverageDirectory=coverage/$suite \
      --json \
      --outputFile=test-results/$suite.json \
      || handle_test_failure $suite
  else
    # Run all tests
    npm test -- \
      --setupFilesAfterEnv="<rootDir>/test/setup/cleanup.ts" \
      --testTimeout=$JEST_TIMEOUT \
      --maxWorkers=50% \
      --coverage \
      --json \
      --outputFile=test-results/all.json \
      || handle_test_failure all
  fi
}

# Function to handle test failures with retry
handle_test_failure() {
  local suite=$1
  
  if [ "$RETRY_FAILED_TESTS" == "true" ]; then
    echo ""
    echo "⚠️  Some tests failed. Retrying failed tests..."
    
    # Extract failed tests from JSON output
    if [ -f "test-results/$suite.json" ]; then
      # Retry only failed tests
      npm test -- \
        --testNamePattern="$(jq -r '.testResults[].assertionResults[] | select(.status=="failed") | .title' test-results/$suite.json | paste -sd "|" -)" \
        --setupFilesAfterEnv="<rootDir>/test/setup/cleanup.ts" \
        --testTimeout=$JEST_TIMEOUT \
        --maxWorkers=1 \
        --runInBand \
        || echo "❌ Some tests still failing after retry"
    fi
  fi
}

# Main test execution
case $TEST_TYPE in
  ui)
    run_test_suite "ui" "UI Wallet Integration"
    ;;
  rpc)
    run_test_suite "rpc" "RPC Integration"
    ;;
  bridge)
    run_test_suite "bridge" "Bridge Operations"
    ;;
  quick)
    echo "🚀 Running quick test suite (unit tests only)..."
    npm test -- \
      --testMatch="**/*.unit.test.ts" \
      --maxWorkers=75% \
      --coverage=false
    ;;
  *)
    # Run all test suites
    run_test_suite "ui" "UI Wallet Integration"
    run_test_suite "rpc" "RPC Integration"
    run_test_suite "bridge" "Bridge Operations"
    
    # Combine coverage reports
    echo ""
    echo "📊 Combining coverage reports..."
    npx nyc merge coverage coverage/combined
    npx nyc report --reporter=html --reporter=text --report-dir=coverage/combined
    ;;
esac

# Generate test report
echo ""
echo "📝 Generating test report..."

# Count results
if [ -f "test-results/all.json" ] || [ -f "test-results/ui.json" ]; then
  TOTAL_TESTS=$(find test-results -name "*.json" -exec jq '.numTotalTests' {} \; | paste -sd+ - | bc)
  PASSED_TESTS=$(find test-results -name "*.json" -exec jq '.numPassedTests' {} \; | paste -sd+ - | bc)
  FAILED_TESTS=$(find test-results -name "*.json" -exec jq '.numFailedTests' {} \; | paste -sd+ - | bc)
  
  echo ""
  echo "📊 Test Results Summary:"
  echo "========================"
  echo "  Total Tests: $TOTAL_TESTS"
  echo "  ✅ Passed: $PASSED_TESTS"
  echo "  ❌ Failed: $FAILED_TESTS"
  echo "  📈 Pass Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"
  echo ""
  
  if [ "$FAILED_TESTS" -eq 0 ]; then
    echo "🎉 All tests passed! 100% success rate achieved!"
    exit 0
  else
    echo "⚠️  Some tests failed. Check the detailed reports in test-results/"
    
    # List failed tests
    echo ""
    echo "Failed Tests:"
    find test-results -name "*.json" -exec jq -r '.testResults[].assertionResults[] | select(.status=="failed") | "  - \(.ancestorTitles | join(" > ")) > \(.title)"' {} \;
    
    exit 1
  fi
else
  echo "⚠️  No test results found"
  exit 1
fi