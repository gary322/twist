#!/bin/bash

echo "🚀 TWIST Platform REAL Massive Simulation"
echo "========================================"
echo ""
echo "This simulation will:"
echo "- Run 10,000 concurrent users"
echo "- Test ALL features from Plans 1-10"
echo "- Generate detailed logs for every action"
echo "- Run for 4 hours continuously"
echo ""
echo "Requirements:"
echo "- At least 16GB RAM"
echo "- 10GB free disk space for logs"
echo "- Stable system (simulation runs for hours)"
echo ""

read -p "Ready to start? This will take 4+ hours. (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Simulation cancelled."
    exit 1
fi

# Create directories
mkdir -p simulation-logs
mkdir -p reports

# Compile TypeScript
echo "⚙️  Compiling TypeScript..."
npx tsc real-massive-simulation.ts monitor-simulation.ts analyze-simulation-logs.ts --module commonjs --target es2020 --esModuleInterop --skipLibCheck || {
    echo "❌ Compilation failed"
    exit 1
}

# Start the simulation in background
echo ""
echo "🏃 Starting simulation (will run in background)..."
nohup node real-massive-simulation.js > simulation.log 2>&1 &
SIM_PID=$!
echo "Simulation PID: $SIM_PID"

# Wait a moment for simulation to start
sleep 5

# Start the monitor in a new terminal if possible
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal -- bash -c "node monitor-simulation.js; exec bash"
elif command -v xterm &> /dev/null; then
    xterm -e "node monitor-simulation.js" &
else
    echo ""
    echo "📊 To monitor the simulation, run in another terminal:"
    echo "   node monitor-simulation.js"
fi

echo ""
echo "✅ Simulation started!"
echo ""
echo "The simulation will run for 4 hours."
echo "Logs are being written to: ./simulation-logs/"
echo ""
echo "To check if simulation is running:"
echo "   ps -p $SIM_PID"
echo ""
echo "To stop the simulation:"
echo "   kill $SIM_PID"
echo ""
echo "To analyze logs after completion:"
echo "   node analyze-simulation-logs.js ./simulation-logs/<timestamp>/"
echo ""