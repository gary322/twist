# AHEE Mainnet Deployment Guide

## Overview

This guide covers the complete deployment process for launching AHEE on Solana mainnet, including pre-deployment checks, deployment steps, post-deployment verification, and rollback procedures.

## Pre-Deployment Checklist

### 1. Security Audits
- [ ] Smart contract audit completed (Certik/Trail of Bits)
- [ ] Penetration testing completed
- [ ] Economic model audit completed
- [ ] WASM module security review
- [ ] Hardware token integration tested

### 2. Testing Coverage
- [ ] Unit tests passing (>95% coverage)
- [ ] Integration tests passing
- [ ] Devnet deployment successful
- [ ] Testnet deployment successful
- [ ] Load testing completed (10K TPS)
- [ ] Chaos engineering tests passed

### 3. Infrastructure Ready
- [ ] RPC nodes deployed (3+ regions)
- [ ] Monitoring stack deployed
- [ ] Alert system configured
- [ ] Backup systems tested
- [ ] CDN configured for SDK
- [ ] Database clusters ready

### 4. Operational Readiness
- [ ] Multisigs configured
- [ ] Team wallets funded
- [ ] Runbooks documented
- [ ] On-call schedule set
- [ ] Communication channels ready
- [ ] Legal compliance verified

## Program Deployment

### 1. Build Programs

```bash
# Set environment
export CLUSTER=mainnet-beta
export DEPLOY_KEYPAIR=~/.config/solana/deploy-authority.json

# Build all programs
./scripts/build-all.sh --release --verify

# Verify builds
for program in attention_token treasury_splitter root_recorder \
               kappa_oracle explorer_referral brand_factory \
               brand_router campaign_router harberger_burn \
               bond_pool gain_controller; do
    echo "Verifying $program..."
    solana-verify build programs/$program
done
```

### 2. Deploy Core Programs

```bash
# Deploy in dependency order

# 1. Attention Token Program (core)
solana program deploy \
    --url https://api.mainnet-beta.solana.com \
    --keypair $DEPLOY_KEYPAIR \
    --program-id AC-D_TOKEN_PROGRAM_ID \
    target/deploy/attention_token.so

# 2. Treasury Splitter
solana program deploy \
    --url https://api.mainnet-beta.solana.com \
    --keypair $DEPLOY_KEYPAIR \
    --program-id TREASURY_SPLITTER_ID \
    target/deploy/treasury_splitter.so

# 3. Root Recorder
solana program deploy \
    --url https://api.mainnet-beta.solana.com \
    --keypair $DEPLOY_KEYPAIR \
    --program-id ROOT_RECORDER_ID \
    target/deploy/root_recorder.so

# Continue for all programs...
```

### 3. Initialize Programs

```javascript
// initialize_programs.js
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

async function initializePrograms() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const deployer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(process.env.DEPLOY_KEYPAIR)))
  );

  // 1. Initialize Attention Token
  console.log('Initializing Attention Token...');
  await initializeAttentionToken(connection, deployer, {
    mint: AC_D_MINT,
    decimals: 9,
    authority: TREASURY_MULTISIG,
    decayRate: 50, // 0.5% daily
    name: "Attention Currency - Decaying",
    symbol: "AC-D"
  });

  // 2. Initialize Treasury Splitter
  console.log('Initializing Treasury Splitter...');
  await initializeTreasurySplitter(connection, deployer, {
    treasury: TREASURY_PDA,
    authority: TREASURY_MULTISIG,
    splits: {
      pcft: 9000,        // 90%
      explorer: 300,     // 3%
      referrals: 250,    // 2.5%
      siteOwners: 250,   // 2.5%
      operations: 200    // 2%
    }
  });

  // 3. Initialize Root Recorder
  console.log('Initializing Root Recorder...');
  await initializeRootRecorder(connection, deployer, {
    authority: OPS_MULTISIG,
    aggregators: [
      AGGREGATOR_A_PUBKEY,
      AGGREGATOR_B_PUBKEY,
      AGGREGATOR_C_PUBKEY
    ],
    quorumThreshold: 2
  });

  // Continue for all programs...
}
```

### 4. Transfer Authorities

```javascript
// Transfer all authorities to multisigs
async function transferAuthorities() {
  const instructions = [];

  // Transfer program upgrade authorities
  for (const [program, multisig] of Object.entries(PROGRAM_AUTHORITIES)) {
    instructions.push(
      createSetAuthorityInstruction({
        program: new PublicKey(program),
        currentAuthority: deployer.publicKey,
        newAuthority: new PublicKey(multisig)
      })
    );
  }

  // Transfer operational authorities
  for (const [pda, multisig] of Object.entries(PDA_AUTHORITIES)) {
    instructions.push(
      createTransferAuthorityInstruction({
        account: new PublicKey(pda),
        currentAuthority: deployer.publicKey,
        newAuthority: new PublicKey(multisig)
      })
    );
  }

  // Execute in batches
  await executeBatchedInstructions(connection, deployer, instructions, 5);
  
  console.log('All authorities transferred to multisigs');
}
```

## Component Deployment

### 1. Deploy Aggregators

```bash
# Deploy aggregator services
for region in us-east eu-west asia-pacific; do
  echo "Deploying aggregator to $region..."
  
  kubectl apply -f k8s/aggregator-deployment.yaml \
    --context=$region \
    --namespace=ahee-prod
  
  # Wait for ready
  kubectl wait --for=condition=ready pod \
    -l app=aggregator \
    --context=$region \
    --namespace=ahee-prod \
    --timeout=300s
done

# Verify aggregator health
for aggregator in A B C; do
  curl -f https://aggregator-$aggregator.ahee.io/health || exit 1
done
```

### 2. Deploy Edge Workers

```javascript
// deploy_edge_workers.js
const { deployToCloudflare } = require('./deploy-utils');

async function deployEdgeWorkers() {
  // Deploy VAU verification worker
  await deployToCloudflare({
    name: 'vau-verification',
    script: './dist/edge-worker.js',
    routes: ['https://api.ahee.io/verify/*'],
    env: {
      ENVIRONMENT: 'production',
      ROOT_RECORDER: ROOT_RECORDER_ID,
      RATE_LIMIT: '8640' // VAUs per day
    }
  });

  // Deploy cohort builder worker
  await deployToCloudflare({
    name: 'cohort-builder',
    script: './dist/cohort-worker.js',
    routes: ['https://api.ahee.io/cohorts/*'],
    env: {
      ENVIRONMENT: 'production',
      MIN_COHORT_SIZE: '100',
      ROTATION_HOUR: '0' // UTC midnight
    }
  });

  console.log('Edge workers deployed');
}
```

### 3. Deploy Frontend Components

```bash
# Build and deploy SDK
cd packages/sdk
npm run build:prod
npm publish --access public

# Deploy to CDN
aws s3 sync dist/ s3://ahee-cdn/sdk/v1/ \
  --cache-control "public, max-age=86400"

# Invalidate CDN cache
aws cloudfront create-invalidation \
  --distribution-id $CDN_DISTRIBUTION_ID \
  --paths "/sdk/v1/*"

# Deploy dashboard
cd ../dashboard
npm run build:prod
vercel --prod
```

## Data Migration

### 1. Initialize Site Registry

```javascript
// Initialize with verified sites
async function initializeSiteRegistry() {
  const sites = [
    {
      domain: 'techcrunch.com',
      owner: 'TCxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6',
      categories: ['IAB19', 'IAB3'],
      verified: true
    },
    {
      domain: 'coindesk.com',
      owner: 'CDxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq7',
      categories: ['IAB19-8', 'IAB13-2'],
      verified: true
    }
    // ... more sites
  ];

  for (const site of sites) {
    await registerSite(site);
    console.log(`Registered ${site.domain}`);
  }
}
```

### 2. Seed Initial Liquidity

```javascript
// Provide initial liquidity
async function seedLiquidity() {
  // 1. Mint initial AC-D supply
  const initialSupply = 1_000_000_000; // 1B tokens
  await mintTokens({
    mint: AC_D_MINT,
    amount: initialSupply,
    recipient: TREASURY_PDA
  });

  // 2. Create AMM pool
  await createPool({
    tokenA: AC_D_MINT,
    tokenB: USDC_MINT,
    initialPriceAtoB: 0.001, // $0.001 per AC-D
    liquidityA: 100_000_000, // 100M AC-D
    liquidityB: 100_000      // 100K USDC
  });

  // 3. Lock liquidity
  await lockLiquidity({
    pool: POOL_ADDRESS,
    lockDuration: 365 * 24 * 60 * 60 // 1 year
  });
}
```

## Launch Sequence

### 1. Soft Launch (Day 1-7)

```javascript
// Enable features gradually
const softLaunchSchedule = [
  { day: 1, action: 'Enable VAU tracking', feature: 'vau_tracking' },
  { day: 2, action: 'Enable cohort assignment', feature: 'cohorts' },
  { day: 3, action: 'Enable rewards (10%)', feature: 'rewards', param: 0.1 },
  { day: 4, action: 'Enable ad wrapper', feature: 'ad_wrapper' },
  { day: 5, action: 'Enable bonds', feature: 'bonds' },
  { day: 6, action: 'Enable full rewards', feature: 'rewards', param: 1.0 },
  { day: 7, action: 'Open public access', feature: 'public_access' }
];

async function executeSoftLaunch() {
  for (const step of softLaunchSchedule) {
    console.log(`Day ${step.day}: ${step.action}`);
    await enableFeature(step.feature, step.param);
    await monitorMetrics(24 * 60 * 60 * 1000); // 24 hours
  }
}
```

### 2. Monitoring Setup

```javascript
// Configure comprehensive monitoring
async function setupMonitoring() {
  // 1. Program monitoring
  for (const program of PROGRAMS) {
    await datadog.createMonitor({
      name: `AHEE ${program} Error Rate`,
      type: 'metric',
      query: `avg(last_5m):sum:solana.program.errors{program:${program}} > 10`,
      message: `High error rate on ${program} @slack-ahee-alerts`,
      priority: 'P1'
    });
  }

  // 2. Treasury monitoring
  await datadog.createMonitor({
    name: 'AHEE Treasury Balance',
    type: 'metric',
    query: 'avg(last_1h):avg:ahee.treasury.balance{token:usdc} < 100000',
    message: 'Treasury balance low @slack-ahee-finance',
    priority: 'P2'
  });

  // 3. VAU monitoring
  await datadog.createMonitor({
    name: 'VAU Processing Rate',
    type: 'metric',
    query: 'avg(last_5m):sum:ahee.vau.processed.rate < 1000',
    message: 'Low VAU processing rate @slack-ahee-ops',
    priority: 'P3'
  });
}
```

### 3. Performance Validation

```javascript
// Validate system performance
async function validatePerformance() {
  const tests = [
    {
      name: 'VAU Processing',
      target: 10000, // TPS
      duration: 60   // seconds
    },
    {
      name: 'Cohort Assignment',
      target: 50000, // Users per minute
      duration: 300
    },
    {
      name: 'Settlement',
      target: 1000,  // Settlements per second
      duration: 120
    }
  ];

  for (const test of tests) {
    console.log(`Running ${test.name} performance test...`);
    const result = await runLoadTest(test);
    
    if (result.avgTps < test.target * 0.9) {
      throw new Error(`Performance below target: ${result.avgTps} < ${test.target}`);
    }
    
    console.log(`✓ ${test.name}: ${result.avgTps} TPS`);
  }
}
```

## Post-Deployment

### 1. Verification Steps

```bash
# Verify all programs deployed
for program in "${PROGRAMS[@]}"; do
  solana program show $program || exit 1
done

# Verify multisig setup
node scripts/verify-multisigs.js

# Verify authorities transferred
node scripts/verify-authorities.js

# Test end-to-end flow
npm run test:e2e:mainnet
```

### 2. Enable Monitoring Alerts

```javascript
// Enable all monitoring alerts
async function enableAlerts() {
  // Slack
  await slack.postMessage({
    channel: '#ahee-launch',
    text: '🚀 AHEE Mainnet Deployed Successfully!'
  });

  // PagerDuty
  await pagerduty.createService({
    name: 'AHEE Mainnet',
    escalationPolicy: 'ahee-oncall',
    alertGrouping: 'intelligent'
  });

  // Enable all monitors
  const monitors = await datadog.listMonitors({ tag: 'ahee' });
  for (const monitor of monitors) {
    await datadog.unmuteMonitor(monitor.id);
  }
}
```

### 3. Documentation Updates

```bash
# Update documentation with mainnet addresses
cat > docs/mainnet-addresses.md << EOF
# AHEE Mainnet Addresses

## Programs
- Attention Token: ${ATTENTION_TOKEN_PROGRAM}
- Treasury Splitter: ${TREASURY_SPLITTER_PROGRAM}
- Root Recorder: ${ROOT_RECORDER_PROGRAM}
[... all programs ...]

## Multisigs
- Treasury: ${TREASURY_MULTISIG}
- Program Authority: ${PROGRAM_MULTISIG}
- Operations: ${OPS_MULTISIG}

## Important Accounts
- AC-D Mint: ${AC_D_MINT}
- Treasury PDA: ${TREASURY_PDA}
- AMM Pool: ${POOL_ADDRESS}
EOF

# Publish documentation
npm run docs:publish
```

## Rollback Procedures

### 1. Emergency Pause

```javascript
// Emergency pause all operations
async function emergencyPause() {
  console.log('🚨 INITIATING EMERGENCY PAUSE 🚨');
  
  // 1. Pause all programs
  const pauseInstructions = PROGRAMS.map(program => 
    createPauseInstruction(program)
  );
  
  await executeBatchedInstructions(
    connection,
    emergencyKeypair,
    pauseInstructions,
    10
  );
  
  // 2. Disable edge workers
  await disableEdgeWorkers();
  
  // 3. Alert team
  await alertTeam('EMERGENCY: System paused', 'P0');
  
  console.log('System paused. Awaiting further instructions.');
}
```

### 2. Program Rollback

```javascript
// Rollback to previous program version
async function rollbackProgram(programId, previousBuffer) {
  // 1. Create rollback proposal
  const proposal = await createMultisigProposal({
    multisig: PROGRAM_MULTISIG,
    name: `EMERGENCY: Rollback ${programId}`,
    instruction: createUpgradeInstruction({
      program: programId,
      buffer: previousBuffer,
      authority: PROGRAM_MULTISIG
    })
  });
  
  // 2. Fast-track approval
  await requestEmergencyApprovals(proposal);
  
  // 3. Execute rollback
  await executeProposal(proposal);
  
  console.log(`Program ${programId} rolled back`);
}
```

### 3. Data Recovery

```javascript
// Recover from data corruption
async function recoverData(corruptedAccount, backupData) {
  // 1. Pause affected operations
  await pauseRelatedOperations(corruptedAccount);
  
  // 2. Create recovery transaction
  const recoveryIx = createDataRecoveryInstruction({
    account: corruptedAccount,
    data: backupData,
    authority: RECOVERY_AUTHORITY
  });
  
  // 3. Execute recovery
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(recoveryIx),
    [recoveryKeypair]
  );
  
  // 4. Verify recovery
  const recovered = await connection.getAccountInfo(corruptedAccount);
  if (!verifyAccountData(recovered, backupData)) {
    throw new Error('Recovery verification failed');
  }
  
  // 5. Resume operations
  await resumeOperations(corruptedAccount);
}
```

## Launch Communications

### 1. Internal Communication

```markdown
## Launch Day Checklist

### T-24 hours
- [ ] Final go/no-go meeting
- [ ] All team members confirm availability
- [ ] Review rollback procedures
- [ ] Confirm multisig members ready

### T-1 hour
- [ ] Deploy programs to mainnet
- [ ] Initialize all contracts
- [ ] Transfer authorities
- [ ] Enable monitoring

### T+0 (Launch)
- [ ] Announce on Twitter
- [ ] Update website
- [ ] Enable public access
- [ ] Monitor metrics

### T+1 hour
- [ ] Check all systems green
- [ ] Review initial metrics
- [ ] Address any issues
- [ ] Team standup
```

### 2. External Communication

```javascript
// Announcement templates
const announcements = {
  twitter: `🚀 AHEE is LIVE on @solana mainnet!

✅ Fraud-proof attention tracking
✅ Privacy-preserving targeting  
✅ Instant settlement
✅ 28% cost savings vs traditional ads

Site owners: Integrate in 5 minutes
Advertisers: Better ROI, zero fraud

Learn more: https://ahee.io`,

  discord: `@everyone 

**AHEE Mainnet Launch! 🎉**

The future of digital advertising is here. AHEE brings fraud-proof attention tracking to Solana.

**For Site Owners:**
- Earn AC-D tokens for real user attention
- No cookies, full privacy
- 5-minute integration

**For Advertisers:**
- Pay only for verified human attention
- ~28% lower costs
- Instant settlement

**Get Started:**
- Documentation: https://docs.ahee.io
- Dashboard: https://dashboard.ahee.io
- SDK: npm install @ahee/sdk

Join the attention economy revolution!`,

  blog: `# AHEE Launches on Solana Mainnet

After months of development and testing, we're excited to announce that AHEE (Attention-Heat-Exchange Economy) is now live on Solana mainnet...`
};
```

## Success Metrics

### Week 1 Targets
- 100+ sites integrated
- 1M+ VAUs processed
- 10K+ unique users
- 99.9% uptime
- <100ms p99 latency

### Month 1 Targets
- 1,000+ sites integrated
- 100M+ VAUs processed
- 500K+ unique users
- $100K+ in rewards distributed
- 5+ major publisher partnerships

## Support Resources

- Launch Hotline: +1-800-AHEE-HELP
- Emergency Email: emergency@ahee.io
- Discord: https://discord.gg/ahee
- Status Page: https://status.ahee.io
- Runbooks: https://runbooks.ahee.io 