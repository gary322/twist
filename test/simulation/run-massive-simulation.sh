#!/bin/bash

echo "🚀 TWIST Platform Massive Simulation Runner"
echo "=========================================="
echo ""
echo "This will simulate 10,000 users interacting with all platform features"
echo "Including: browser extensions, staking, referrals, token burning, and more"
echo ""

# Check if TypeScript is compiled
if [ ! -d "../../dist" ]; then
    echo "⚡ Compiling TypeScript..."
    cd ../.. && npm run build && cd test/simulation
fi

# Create reports directory
mkdir -p reports

# Run the massive simulation
echo "🏃 Starting simulation..."
echo ""

# Use ts-node to run directly if available, otherwise use compiled version
if command -v ts-node &> /dev/null; then
    NODE_OPTIONS="--max-old-space-size=8192" ts-node massive-simulation.ts
else
    NODE_OPTIONS="--max-old-space-size=8192" node ../../dist/test/simulation/massive-simulation.js
fi

echo ""
echo "📊 Simulation complete! Check the reports directory for detailed results:"
echo "  - reports/massive-simulation-report.txt"
echo "  - reports/simulation-metrics.json"
echo "  - reports/daily-metrics.json"
echo "  - reports/platform-health.json"