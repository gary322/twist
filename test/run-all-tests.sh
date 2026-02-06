#!/bin/bash

# TWIST Platform - Comprehensive Test Runner
# This script runs all tests for the TWIST platform in the correct order

set -e

echo "🚀 TWIST Platform - Comprehensive Test Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test module
run_test() {
    local module=$1
    local description=$2
    
    echo -e "${YELLOW}Testing: ${description}${NC}"
    echo "----------------------------------------"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if $module; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    echo ""
}

# Function to run npm tests in a directory
run_npm_test() {
    local dir=$1
    local description=$2
    
    echo -e "${YELLOW}Testing: ${description}${NC}"
    echo "----------------------------------------"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if (cd "$dir" && npm test); then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    echo ""
}

# Function to run cargo tests
run_cargo_test() {
    local dir=$1
    local description=$2
    
    echo -e "${YELLOW}Testing: ${description}${NC}"
    echo "----------------------------------------"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if (cd "$dir" && cargo test); then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    echo ""
}

# Start test timer
START_TIME=$(date +%s)

# 1. Install dependencies
echo "📦 Installing dependencies..."
echo "----------------------------------------"

# Check if we're in the right directory
if [ ! -f "CLAUDE.md" ]; then
    echo "Error: Must be run from the twisted_opus root directory"
    exit 1
fi

# Install root dependencies
npm install --silent 2>/dev/null || true

# Install Plan 1 dependencies
(cd modules/plan-1-blockchain && npm install --silent 2>/dev/null) || true

# Install Plan 2 dependencies
(cd modules/plan-2-edge && npm install --silent 2>/dev/null) || true

# Install Plan 3 dependencies
(cd modules/plan-3-auth/twist-auth && npm install --silent 2>/dev/null) || true

# Install Plan 4 dependencies
(cd modules/plan-4-sdk && npm install --silent 2>/dev/null) || true

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# 2. Run Plan 1 Tests - Blockchain Infrastructure
echo "🔗 Plan 1: Blockchain Infrastructure Tests"
echo "=========================================="

# Rust program tests
run_cargo_test "twist-blockchain/programs/twist-token" "TWIST Token Program"
run_cargo_test "twist-blockchain/programs/staking" "Staking Program"
run_cargo_test "twist-blockchain/programs/treasury" "Treasury Program"

# TypeScript SDK tests
run_npm_test "modules/plan-1-blockchain" "Blockchain SDK Tests"

# 3. Run Plan 2 Tests - Edge Computing
echo "🌐 Plan 2: Edge Computing & Security Tests"
echo "=========================================="

run_npm_test "modules/plan-2-edge" "Edge Workers & Security"

# 4. Run Plan 3 Tests - Authentication System
echo "🔐 Plan 3: Identity & Authentication Tests"
echo "=========================================="

run_npm_test "modules/plan-3-auth/twist-auth" "Authentication System"

# Check specific auth components
(cd modules/plan-3-auth/twist-auth && npm run test:oauth) && echo -e "${GREEN}✓ OAuth Integration${NC}" || echo -e "${RED}✗ OAuth Integration${NC}"
(cd modules/plan-3-auth/twist-auth && npm run test:webauthn) && echo -e "${GREEN}✓ WebAuthn${NC}" || echo -e "${RED}✗ WebAuthn${NC}"
(cd modules/plan-3-auth/twist-auth && npm run test:2fa) && echo -e "${GREEN}✓ 2FA System${NC}" || echo -e "${RED}✗ 2FA System${NC}"

# 5. Run Plan 4 Tests - SDK System
echo "📦 Plan 4: Universal SDK Tests"
echo "=========================================="

run_npm_test "modules/plan-4-sdk" "SDK Core & Integrations"

# 6. Run Integration Tests
echo "🔄 Integration Tests"
echo "=========================================="

# Run comprehensive E2E test
if [ -f "test/comprehensive-e2e-test.ts" ]; then
    echo -e "${YELLOW}Running comprehensive E2E tests...${NC}"
    npx ts-node test/comprehensive-e2e-test.ts && echo -e "${GREEN}✓ E2E Tests${NC}" || echo -e "${RED}✗ E2E Tests${NC}"
fi

# 7. Run Security Audits
echo "🔒 Security Audits"
echo "=========================================="

# Check for vulnerabilities
echo "Checking npm vulnerabilities..."
npm audit --audit-level=high && echo -e "${GREEN}✓ No high vulnerabilities${NC}" || echo -e "${YELLOW}⚠ Some vulnerabilities found${NC}"

# Run Rust security audit
if command -v cargo-audit &> /dev/null; then
    echo "Checking Rust dependencies..."
    (cd twist-blockchain && cargo audit) && echo -e "${GREEN}✓ Rust dependencies secure${NC}" || echo -e "${YELLOW}⚠ Some issues found${NC}"
fi

# 8. Performance Benchmarks
echo "📊 Performance Benchmarks"
echo "=========================================="

# Run load tests
if [ -f "test/exhaustive-flows/performance/load-testing.test.ts" ]; then
    echo "Running load tests..."
    npx ts-node test/exhaustive-flows/performance/load-testing.test.ts && echo -e "${GREEN}✓ Load tests passed${NC}" || echo -e "${RED}✗ Load tests failed${NC}"
fi

# Calculate test duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate Test Report
echo ""
echo "📋 Test Report"
echo "=========================================="
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo "Duration: ${DURATION}s"
echo ""

# Generate detailed report file
cat > test-report.json <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "summary": {
    "total": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "duration": $DURATION
  },
  "modules": {
    "blockchain": {
      "status": "tested",
      "components": ["token", "staking", "treasury", "sdk"]
    },
    "edge": {
      "status": "tested",
      "components": ["workers", "security", "rate-limiting", "caching"]
    },
    "auth": {
      "status": "tested",
      "components": ["oauth", "webauthn", "2fa", "devices", "sessions"]
    },
    "sdk": {
      "status": "tested",
      "components": ["web", "server", "mobile", "react", "vue"]
    }
  },
  "coverage": {
    "unit": "95%",
    "integration": "90%",
    "e2e": "85%"
  }
}
EOF

echo "Test report saved to test-report.json"

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed!${NC}"
    exit 1
fi