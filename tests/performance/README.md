# Load Testing Guide for Influencer Staking System

## Overview

This directory contains comprehensive load testing configurations for the Influencer Staking System using three popular load testing tools:

1. **k6** - Modern load testing tool with JavaScript/TypeScript support
2. **Artillery** - Simple and powerful load testing toolkit
3. **Locust** - Python-based load testing framework with web UI

## Prerequisites

### Install Required Tools

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6  # Ubuntu/Debian

# Install Artillery
npm install -g artillery

# Install Locust
pip3 install locust
```

### Setup Monitoring (Optional)

```bash
# InfluxDB for k6 metrics
docker run -d -p 8086:8086 --name influxdb influxdb:1.8

# Grafana for visualization
docker run -d -p 3000:3000 --name grafana grafana/grafana
```

## Quick Start

Run all load tests with default configuration:

```bash
./run-load-tests.sh
```

Run specific test suite:

```bash
./run-load-tests.sh k6
./run-load-tests.sh artillery
./run-load-tests.sh locust
```

## Test Scenarios

### 1. Search and Browse (30% of traffic)
- Search for influencers
- View influencer details
- Browse by tier and APY

### 2. Staking Operations (20% of traffic)
- Stake on influencers
- Check portfolio
- Claim rewards

### 3. Real-time Updates (10% of traffic)
- WebSocket connections
- Subscribe to updates
- Portfolio monitoring

### 4. Content & Analytics (25% of traffic)
- Browse content
- View analytics
- Performance metrics

### 5. API Stress Test (15% of traffic)
- Concurrent API calls
- Complex queries
- Cache performance

## Load Test Stages

1. **Warm-up** (2 min): 0 → 100 users
2. **Ramp-up** (5 min): 100 → 1000 users
3. **Sustained Load** (10 min): 1000 users
4. **Spike Test** (1 min): 1000 → 2000 users
5. **Recovery** (5 min): 2000 → 500 users
6. **Cool-down** (2 min): 500 → 0 users

## Performance Targets

- **Response Time (p95)**: < 1 second
- **Response Time (p99)**: < 2 seconds
- **Error Rate**: < 1%
- **Throughput**: > 1000 RPS
- **Concurrent Users**: 2000+

## Running Individual Tests

### k6 Tests

```bash
# Basic load test
k6 run load-test.ts

# With custom parameters
k6 run --vus 1000 --duration 30m load-test.ts

# With output to InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 load-test.ts

# Specific scenario
k6 run -e scenario=staking load-test.ts
```

### Artillery Tests

```bash
# Run full test suite
artillery run artillery-load-test.yml

# Quick test
artillery quick --count 1000 --num 50 http://localhost:3000/api/health

# Generate report
artillery run --output report.json artillery-load-test.yml
artillery report report.json
```

### Locust Tests

```bash
# Web UI mode
locust -f locust-load-test.py --host=http://localhost:3000

# Headless mode
locust -f locust-load-test.py --host=http://localhost:3000 --headless -u 1000 -r 10 -t 30m

# With custom shape
locust -f locust-load-test.py --host=http://localhost:3000 --class-picker
```

## Configuration

### Environment Variables

```bash
export BASE_URL=https://api.twist.to
export WS_URL=wss://api.twist.to
export TEST_DURATION=30m
export MAX_USERS=2000
```

### Test Data

Test data is automatically generated but can be customized:

1. Edit `test-users.json` for user profiles
2. Edit `test-influencers.json` for influencer data
3. Update `artillery-processor.js` for custom logic

## Analyzing Results

### k6 Metrics

Key metrics to monitor:
- `http_req_duration`: Response time
- `http_req_failed`: Failed requests
- `search_latency`: Custom search metric
- `staking_latency`: Custom staking metric
- `errors`: Error rate

### Artillery Reports

View HTML report:
```bash
open reports/*/artillery-report.html
```

Key sections:
- Response time distribution
- Throughput over time
- Error rate
- Latency percentiles

### Locust Dashboard

Access at http://localhost:8089 during test

Monitor:
- Current RPS
- Response times
- Number of users
- Failure rate

## Troubleshooting

### Common Issues

1. **Connection refused**
   - Ensure the API server is running
   - Check BASE_URL configuration

2. **High error rate**
   - Check server logs
   - Reduce virtual users
   - Increase ramp-up time

3. **Memory issues**
   - Reduce test duration
   - Use fewer virtual users
   - Increase system resources

### Debug Mode

Enable debug logging:

```bash
# k6
k6 run --verbose load-test.ts

# Artillery
DEBUG=artillery* artillery run artillery-load-test.yml

# Locust
locust -f locust-load-test.py --loglevel DEBUG
```

## Best Practices

1. **Start Small**: Begin with low user counts and increase gradually
2. **Monitor Resources**: Watch CPU, memory, and network on both client and server
3. **Realistic Scenarios**: Use think time and realistic user behaviors
4. **Incremental Testing**: Test individual endpoints before full scenarios
5. **Regular Testing**: Run load tests as part of CI/CD pipeline

## Continuous Load Testing

Add to CI/CD pipeline:

```yaml
# .github/workflows/load-test.yml
name: Load Test

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install k6
        run: |
          sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      
      - name: Run Load Test
        run: |
          k6 run --vus 500 --duration 10m \
            --out json=results.json \
            --summary-export=summary.json \
            tests/performance/load-test.ts
      
      - name: Upload Results
        uses: actions/upload-artifact@v2
        with:
          name: load-test-results
          path: |
            results.json
            summary.json
```

## Performance Optimization Tips

Based on load test results, consider:

1. **Caching**: Implement Redis caching for frequently accessed data
2. **Database Optimization**: Add indexes, optimize queries
3. **Connection Pooling**: Tune database and Redis connection pools
4. **Rate Limiting**: Implement per-user and per-IP rate limits
5. **CDN**: Use CDN for static assets
6. **Horizontal Scaling**: Add more API servers behind load balancer
7. **Async Processing**: Move heavy operations to background jobs

## Reporting

Generate comprehensive report:

```bash
# Generate all reports
./generate-report.sh

# View summary
cat reports/*/summary.txt

# Compare results
./compare-results.sh reports/baseline reports/current
```

## Support

For issues or questions:
1. Check server logs: `tail -f logs/api.log`
2. Review test output for error details
3. Enable debug mode for more information
4. Contact DevOps team for infrastructure issues