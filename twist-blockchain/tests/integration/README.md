# TWIST Token Integration Tests

Comprehensive integration test suite for the TWIST token ecosystem, covering end-to-end user journeys, stress testing, and bot integration.

## Test Suites

### 1. User Journey Tests (`user-journeys.test.ts`)
Complete end-to-end scenarios simulating real user interactions:
- **Journey 1**: New user onboarding and first trade
- **Journey 2**: DeFi power user providing liquidity
- **Journey 3**: Long-term holder with vesting schedule
- **Journey 4**: Decay and buyback mechanism demonstration
- **Journey 5**: Cross-chain bridge usage
- **Journey 6**: Emergency scenario handling

### 2. Stress Tests (`stress-tests.test.ts`)
Performance and resilience testing under extreme conditions:
- High volume trading (1000+ trades)
- Concurrent operations (100+ simultaneous stakes)
- Memory and state management limits
- Network congestion simulation
- Economic attack resistance
- Resource exhaustion handling

### 3. Bot Integration Tests (`bot-integration.test.ts`)
Testing automated systems and their interactions:
- Buyback bot price monitoring and execution
- Arbitrage monitor opportunity detection
- Volume tracker metrics collection
- Market maker order management
- Multi-bot coordination
- Failure recovery mechanisms

## Running Tests

### Prerequisites
```bash
# Start local Solana validator
solana-test-validator

# In another terminal, deploy programs
./scripts/deploy/deploy-local.sh

# Install dependencies
npm install
```

### Run All Integration Tests
```bash
npm run test:integration
```

### Run Specific Test Suite
```bash
# User journeys only
npm run test:integration -- --grep "User Journeys"

# Stress tests only
npm run test:integration -- --grep "Stress Tests"

# Bot integration only
npm run test:integration -- --grep "Bot Integration"
```

### Run with Coverage
```bash
npm run test:integration:coverage
```

## Test Configuration

### Environment Variables
```bash
# Test network
SOLANA_RPC_URL=http://localhost:8899
SOLANA_NETWORK=localnet

# Test wallets (auto-generated if not provided)
TEST_ADMIN_WALLET=./test-wallets/admin.json
TEST_USER_WALLET=./test-wallets/user.json

# Test parameters
TEST_NUM_USERS=100
TEST_MAX_TPS=50
TEST_TIMEOUT_MS=120000
```

### Test Data
Test data is automatically generated for:
- User wallets (100+ for stress tests)
- Mock price feeds
- Trading history
- Liquidity positions

## Performance Benchmarks

Expected performance on standard hardware:

| Metric | Target | Actual |
|--------|--------|--------|
| TPS (Transactions/sec) | >10 | ~15-20 |
| Concurrent operations | >100 | ~150 |
| State query time | <1s | ~200ms |
| Bot reaction time | <5s | ~2-3s |
| Recovery time | <30s | ~10-15s |

## Common Issues

### Tests timing out
- Increase timeout: `TEST_TIMEOUT_MS=300000`
- Check validator is running
- Ensure sufficient SOL for fees

### Connection errors
- Verify RPC endpoint is accessible
- Check firewall settings
- Try reducing concurrent operations

### State conflicts
- Run tests sequentially: `--jobs 1`
- Clear test data between runs
- Use unique keypairs per test

## Test Reports

After running tests, reports are generated in:
- `./test-results/` - JUnit XML reports
- `./coverage/` - Code coverage reports
- `./performance/` - Performance metrics

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Integration Tests
  run: |
    npm run test:integration
  timeout-minutes: 30
  
- name: Upload Test Results
  uses: actions/upload-artifact@v2
  with:
    name: test-results
    path: ./test-results/
```

## Writing New Tests

### Test Structure
```typescript
describe('Feature Name', () => {
  before(async () => {
    // Setup test environment
  });
  
  it('should perform expected behavior', async () => {
    // Test implementation
  });
  
  after(async () => {
    // Cleanup
  });
});
```

### Best Practices
1. Use descriptive test names
2. Clean up resources after tests
3. Mock external dependencies when possible
4. Use realistic test data
5. Test both success and failure cases
6. Monitor performance metrics

## Debugging

### Enable Verbose Logging
```bash
DEBUG=twist:* npm run test:integration
```

### Run Single Test
```bash
npm run test:integration -- --grep "specific test name"
```

### Interactive Debugging
```bash
# Run with Node debugger
node --inspect-brk ./node_modules/.bin/mocha tests/integration/*.test.ts
```

## Security Testing

The integration tests include security scenarios:
- Sandwich attack prevention
- Flash loan protection
- Oracle manipulation resistance
- DOS attack mitigation
- Access control verification

## Contributing

When adding new integration tests:
1. Follow existing patterns
2. Document test purpose
3. Include cleanup logic
4. Add to appropriate suite
5. Update this README

## License

MIT