# Multisig Setup Guide

## Overview

AHEE uses multi-signature (multisig) wallets for critical operations to ensure security and decentralization. This guide covers setting up and managing multisig configurations for treasury, program upgrades, and operational controls.

## Multisig Architecture

### 1. Treasury Multisig (5-of-9)
- Controls main USDC treasury
- Approves large payouts
- Emergency pause authority
- Monthly budget allocations

### 2. Program Authority (3-of-5)
- Program upgrade authority
- Parameter updates
- Emergency fixes
- Feature toggles

### 3. Operational Multisig (2-of-3)
- Daily operations
- Crank operations
- Minor parameter adjustments
- Monitoring access

## Setup Instructions

### 1. Create Treasury Multisig

```bash
# Install Squads CLI
npm install -g @sqds/cli

# Create 5-of-9 treasury multisig
squads create-multisig \
  --name "AHEE Treasury" \
  --threshold 5 \
  --members \
    "7xKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6MNawM8" \
    "9nKJrWEMzpYhgKVJ2VJUjgMhZvn8SXHCRmVHTbkHGdBz" \
    "AhhdRu5bzwpBKDKPgPM5CmcKBYc4JmwJTvQGq6LcQkVh" \
    "Bm5WRhLVTCWxqvxhmYLJfcky2jDBPTiStRrHdyBZfLCV" \
    "CxqTD2jKwNNfeacybCTQfPeNpTxCBPcUdWhvVSy6jRQA" \
    "DuafLx6kPrJ9SFpJvjDfvhJz6ZbxKaV6xGkiWjRkaNpP" \
    "EnJBQ1V6qsMaYBrWTQQJXFHHufkVEYmVPcWJmtMDHXYw" \
    "FvJdKGvUFRVnsFtJfhLXMzNQBkYBLmWMKsXkzjLCdoiT" \
    "GJKehN6mWM5hLcP6JK2QdrqkdyG4KUduHveTwQaqYiLo"
```

Output:
```
Treasury Multisig Created:
Address: TRSYxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZRsY
Threshold: 5/9
PDA: TRSYPDAxKXtg2CW87d97TxJSDpbD5jBkheTqA83PDA
```

### 2. Configure Program Authority

```javascript
// setup_program_authority.js
const { Connection, PublicKey } = require('@solana/web3.js');
const { createMultisig } = require('@sqds/sdk');

async function setupProgramAuthority() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  
  // Program authority members (3-of-5)
  const members = [
    new PublicKey('TECH_LEAD_WALLET'),
    new PublicKey('CTO_WALLET'),
    new PublicKey('SECURITY_LEAD_WALLET'),
    new PublicKey('BACKEND_LEAD_WALLET'),
    new PublicKey('DEVOPS_LEAD_WALLET')
  ];
  
  // Create multisig
  const multisig = await createMultisig({
    connection,
    threshold: 3,
    members,
    name: 'AHEE Program Authority'
  });
  
  console.log('Program Authority Multisig:', multisig.publicKey.toString());
  
  // Transfer program upgrade authority
  await transferProgramAuthority(multisig.publicKey);
}
```

### 3. Setup Operational Multisig

```bash
# Create 2-of-3 operational multisig
squads create-multisig \
  --name "AHEE Operations" \
  --threshold 2 \
  --members \
    "OPS_LEAD_WALLET" \
    "BACKEND_LEAD_WALLET" \
    "DEVOPS_LEAD_WALLET"

# Fund operational wallet
solana transfer OPSxKXtg2CW87d97TxJSDpbD5jBkheTqA83OPS 10 \
  --allow-unfunded-recipient
```

## Member Management

### 1. Add New Member

```javascript
// Add member to existing multisig
async function addMember(multisigPubkey, newMember) {
  const multisig = await Multisig.fromAccountAddress(
    connection,
    multisigPubkey
  );
  
  // Create proposal to add member
  const proposal = await multisig.createProposal({
    name: `Add member ${newMember}`,
    instructions: [{
      programId: SQUADS_PROGRAM_ID,
      accounts: [
        { pubkey: multisigPubkey, isSigner: false, isWritable: true },
        { pubkey: newMember, isSigner: false, isWritable: false }
      ],
      data: encodeAddMember()
    }]
  });
  
  console.log('Proposal created:', proposal.publicKey.toString());
  console.log('Share with members for approval');
}
```

### 2. Update Threshold

```javascript
// Change multisig threshold
async function updateThreshold(multisigPubkey, newThreshold) {
  const multisig = await Multisig.fromAccountAddress(
    connection,
    multisigPubkey
  );
  
  // Validate threshold
  if (newThreshold > multisig.members.length) {
    throw new Error('Threshold cannot exceed member count');
  }
  
  // Create threshold update proposal
  const proposal = await multisig.createProposal({
    name: `Update threshold to ${newThreshold}`,
    instructions: [{
      programId: SQUADS_PROGRAM_ID,
      accounts: [
        { pubkey: multisigPubkey, isSigner: false, isWritable: true }
      ],
      data: encodeUpdateThreshold(newThreshold)
    }]
  });
  
  return proposal;
}
```

### 3. Remove Member

```javascript
// Remove member (careful - affects threshold)
async function removeMember(multisigPubkey, memberToRemove) {
  const multisig = await Multisig.fromAccountAddress(
    connection,
    multisigPubkey
  );
  
  // Check if removal would break threshold
  const newMemberCount = multisig.members.length - 1;
  if (multisig.threshold > newMemberCount) {
    console.warn('Must reduce threshold first!');
    return;
  }
  
  // Create removal proposal
  const proposal = await multisig.createProposal({
    name: `Remove member ${memberToRemove}`,
    instructions: [{
      programId: SQUADS_PROGRAM_ID,
      accounts: [
        { pubkey: multisigPubkey, isSigner: false, isWritable: true },
        { pubkey: memberToRemove, isSigner: false, isWritable: false }
      ],
      data: encodeRemoveMember()
    }]
  });
  
  return proposal;
}
```

## Creating Proposals

### 1. Treasury Withdrawal

```javascript
// Create treasury withdrawal proposal
async function proposeTreasuryWithdrawal(amount, recipient, purpose) {
  const treasuryMultisig = new PublicKey(TREASURY_MULTISIG);
  
  // Create withdrawal instruction
  const withdrawIx = await createWithdrawalInstruction({
    treasury: TREASURY_PDA,
    recipient,
    amount,
    mint: USDC_MINT
  });
  
  // Create proposal
  const proposal = await createProposal({
    multisig: treasuryMultisig,
    name: `Withdraw ${amount} USDC: ${purpose}`,
    instructions: [withdrawIx],
    metadata: {
      purpose,
      recipient: recipient.toString(),
      amount,
      requestedBy: wallet.publicKey.toString(),
      date: new Date().toISOString()
    }
  });
  
  // Notify members
  await notifyMembers(treasuryMultisig, proposal);
  
  return proposal;
}
```

### 2. Program Upgrade

```javascript
// Propose program upgrade
async function proposeProgramUpgrade(programId, bufferAccount) {
  const programMultisig = new PublicKey(PROGRAM_MULTISIG);
  
  // Verify buffer
  const bufferInfo = await connection.getAccountInfo(bufferAccount);
  if (!bufferInfo) {
    throw new Error('Buffer account not found');
  }
  
  // Create upgrade instruction
  const upgradeIx = bpfLoaderUpgradeable.createUpgradeInstruction({
    program: programId,
    buffer: bufferAccount,
    authority: programMultisig,
    spill: wallet.publicKey
  });
  
  // Create proposal with detailed metadata
  const proposal = await createProposal({
    multisig: programMultisig,
    name: `Upgrade ${programId}`,
    instructions: [upgradeIx],
    metadata: {
      programId: programId.toString(),
      buffer: bufferAccount.toString(),
      version: 'v2.1.0',
      changes: [
        'Fix: VAU validation edge case',
        'Feature: Enhanced cohort targeting',
        'Optimization: Reduce compute units'
      ],
      testnet: 'https://testnet.tx/abc123',
      audit: 'https://audit.report/v2.1.0'
    }
  });
  
  return proposal;
}
```

### 3. Parameter Update

```javascript
// Update protocol parameters
async function proposeParameterUpdate(parameter, newValue) {
  const opsMultisig = new PublicKey(OPS_MULTISIG);
  
  // Build update instruction based on parameter
  let updateIx;
  switch (parameter) {
    case 'minVAUs':
      updateIx = createUpdateMinVAUsInstruction(newValue);
      break;
    case 'decayRate':
      updateIx = createUpdateDecayRateInstruction(newValue);
      break;
    case 'treasurySplit':
      updateIx = createUpdateTreasurySplitInstruction(newValue);
      break;
    default:
      throw new Error(`Unknown parameter: ${parameter}`);
  }
  
  // Create proposal
  const proposal = await createProposal({
    multisig: opsMultisig,
    name: `Update ${parameter} to ${newValue}`,
    instructions: [updateIx],
    metadata: {
      parameter,
      oldValue: await getCurrentValue(parameter),
      newValue,
      reason: 'Market conditions adjustment',
      analysis: 'https://analysis.link/param-update'
    }
  });
  
  return proposal;
}
```

## Approval Process

### 1. Review Proposal

```javascript
// Review proposal details
async function reviewProposal(proposalPubkey) {
  const proposal = await getProposal(proposalPubkey);
  
  console.log('=== Proposal Review ===');
  console.log('Name:', proposal.name);
  console.log('Status:', proposal.status);
  console.log('Approvals:', `${proposal.approvals}/${proposal.threshold}`);
  console.log('Created:', proposal.createdAt);
  
  // Decode instructions
  console.log('\nInstructions:');
  for (const ix of proposal.instructions) {
    const decoded = await decodeInstruction(ix);
    console.log(`- ${decoded.type}: ${decoded.summary}`);
  }
  
  // Show metadata
  if (proposal.metadata) {
    console.log('\nMetadata:', JSON.stringify(proposal.metadata, null, 2));
  }
  
  // Security checks
  await performSecurityChecks(proposal);
}
```

### 2. Approve Proposal

```javascript
// Approve a proposal
async function approveProposal(proposalPubkey) {
  // Review first
  await reviewProposal(proposalPubkey);
  
  // Confirm approval
  const confirm = await prompt('Approve this proposal? (yes/no): ');
  if (confirm !== 'yes') {
    console.log('Approval cancelled');
    return;
  }
  
  // Sign approval
  const signature = await signProposalApproval({
    proposal: proposalPubkey,
    member: wallet.publicKey
  });
  
  console.log('Proposal approved!');
  console.log('Signature:', signature);
  
  // Check if threshold reached
  const proposal = await getProposal(proposalPubkey);
  if (proposal.approvals >= proposal.threshold) {
    console.log('Threshold reached! Proposal can be executed.');
  }
}
```

### 3. Execute Proposal

```javascript
// Execute approved proposal
async function executeProposal(proposalPubkey) {
  const proposal = await getProposal(proposalPubkey);
  
  // Verify threshold met
  if (proposal.approvals < proposal.threshold) {
    throw new Error(`Need ${proposal.threshold - proposal.approvals} more approvals`);
  }
  
  // Execute transaction
  const tx = await proposal.buildTransaction();
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);
  
  console.log('Proposal executed!');
  console.log('Transaction:', signature);
  
  // Update proposal status
  await updateProposalStatus(proposalPubkey, 'executed', signature);
}
```

## Security Best Practices

### 1. Key Management

```bash
# Generate secure member keys
solana-keygen new --outfile member1.json --no-bip39-passphrase

# Use hardware wallets for production
solana config set --keypair usb://ledger

# Backup keys securely
# - Use Shamir's Secret Sharing
# - Store in separate physical locations
# - Test recovery procedures
```

### 2. Proposal Verification

```javascript
// Comprehensive security checks
async function performSecurityChecks(proposal) {
  const checks = [];
  
  // Check 1: Verify all accounts
  for (const ix of proposal.instructions) {
    const programInfo = await connection.getAccountInfo(ix.programId);
    checks.push({
      test: 'Program exists',
      passed: programInfo !== null,
      details: ix.programId.toString()
    });
  }
  
  // Check 2: Simulate transaction
  try {
    const simulation = await connection.simulateTransaction(
      proposal.transaction
    );
    checks.push({
      test: 'Transaction simulation',
      passed: !simulation.err,
      details: simulation.logs
    });
  } catch (error) {
    checks.push({
      test: 'Transaction simulation',
      passed: false,
      details: error.message
    });
  }
  
  // Check 3: Verify amounts
  const amounts = extractAmounts(proposal);
  for (const amount of amounts) {
    checks.push({
      test: `Amount reasonable (${amount.token})`,
      passed: amount.value <= amount.maxExpected,
      details: `${amount.value} <= ${amount.maxExpected}`
    });
  }
  
  // Display results
  console.log('\n=== Security Checks ===');
  for (const check of checks) {
    console.log(`${check.passed ? '✓' : '✗'} ${check.test}`);
    if (!check.passed) {
      console.log(`  Details: ${check.details}`);
    }
  }
  
  return checks.every(c => c.passed);
}
```

### 3. Emergency Procedures

```javascript
// Emergency pause procedure
async function emergencyPause() {
  const emergencyMultisig = new PublicKey(EMERGENCY_MULTISIG);
  
  // Create pause instructions for all programs
  const pauseInstructions = [
    createPauseInstruction(ATTENTION_TOKEN_PROGRAM),
    createPauseInstruction(TREASURY_SPLITTER_PROGRAM),
    createPauseInstruction(ROOT_RECORDER_PROGRAM),
    createPauseInstruction(HARBERGER_BURN_PROGRAM)
  ];
  
  // Create emergency proposal
  const proposal = await createProposal({
    multisig: emergencyMultisig,
    name: 'EMERGENCY: Pause all programs',
    instructions: pauseInstructions,
    metadata: {
      type: 'emergency',
      reason: 'Potential security issue detected',
      reporter: wallet.publicKey.toString(),
      timestamp: new Date().toISOString()
    }
  });
  
  // Alert all members immediately
  await alertEmergency(emergencyMultisig, proposal);
  
  console.log('Emergency pause proposal created:', proposal.publicKey.toString());
  console.log('Requires immediate attention from multisig members!');
}
```

## Monitoring & Alerts

### 1. Proposal Monitoring

```javascript
// Monitor pending proposals
async function monitorProposals() {
  const multisigs = [
    { name: 'Treasury', pubkey: TREASURY_MULTISIG },
    { name: 'Program', pubkey: PROGRAM_MULTISIG },
    { name: 'Operations', pubkey: OPS_MULTISIG }
  ];
  
  for (const multisig of multisigs) {
    const proposals = await getMultisigProposals(multisig.pubkey);
    const pending = proposals.filter(p => p.status === 'pending');
    
    if (pending.length > 0) {
      console.log(`\n${multisig.name} Multisig - ${pending.length} pending proposals:`);
      
      for (const proposal of pending) {
        const age = Date.now() - proposal.createdAt;
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        
        console.log(`- ${proposal.name}`);
        console.log(`  Approvals: ${proposal.approvals}/${proposal.threshold}`);
        console.log(`  Age: ${ageHours} hours`);
        
        if (ageHours > 48) {
          console.log(`  ⚠️  Proposal older than 48 hours!`);
        }
      }
    }
  }
}
```

### 2. Setup Alerts

```javascript
// Configure alerts for multisig events
async function setupAlerts() {
  // Webhook configuration
  const webhook = {
    url: process.env.DISCORD_WEBHOOK_URL,
    mentions: {
      treasury: '<@&TREASURY_ROLE_ID>',
      program: '<@&TECH_ROLE_ID>',
      emergency: '<@&EVERYONE>'
    }
  };
  
  // Subscribe to multisig events
  connection.onAccountChange(
    TREASURY_MULTISIG,
    async (accountInfo) => {
      const multisig = decodeMultisig(accountInfo.data);
      
      // Check for new proposals
      const newProposal = checkForNewProposal(multisig);
      if (newProposal) {
        await sendAlert(webhook, {
          title: '💰 New Treasury Proposal',
          description: newProposal.name,
          mention: webhook.mentions.treasury,
          url: `https://app.squads.so/proposal/${newProposal.pubkey}`
        });
      }
    }
  );
}
```

## Operational Procedures

### 1. Daily Operations Checklist

```markdown
## Daily Multisig Operations

- [ ] Check pending proposals across all multisigs
- [ ] Review any overnight emergency alerts
- [ ] Verify treasury balance matches expected
- [ ] Check program upgrade queue
- [ ] Review member availability (vacations, etc.)
- [ ] Backup any new multisig configurations
```

### 2. Weekly Security Review

```javascript
// Weekly security audit
async function weeklySecurityAudit() {
  const report = {
    date: new Date().toISOString(),
    multisigs: {},
    issues: [],
    recommendations: []
  };
  
  // Audit each multisig
  for (const [name, pubkey] of Object.entries(MULTISIGS)) {
    const multisig = await getMultisig(pubkey);
    
    report.multisigs[name] = {
      threshold: `${multisig.threshold}/${multisig.members.length}`,
      pendingProposals: multisig.proposals.filter(p => p.status === 'pending').length,
      executedThisWeek: multisig.proposals.filter(p => 
        p.status === 'executed' && 
        p.executedAt > Date.now() - 7 * 24 * 60 * 60 * 1000
      ).length
    };
    
    // Check for issues
    if (multisig.threshold < Math.ceil(multisig.members.length / 2)) {
      report.issues.push({
        multisig: name,
        issue: 'Threshold below 50% of members',
        severity: 'medium'
      });
    }
  }
  
  return report;
}
```

## Disaster Recovery

### 1. Key Compromise

```javascript
// Handle compromised member key
async function handleCompromisedKey(multisigPubkey, compromisedMember) {
  console.log('🚨 COMPROMISED KEY RESPONSE 🚨');
  
  // Step 1: Create removal proposal
  const removalProposal = await createEmergencyProposal({
    multisig: multisigPubkey,
    name: 'URGENT: Remove compromised member',
    instruction: createRemoveMemberInstruction(compromisedMember)
  });
  
  // Step 2: Alert all other members
  await alertAllMembers(multisigPubkey, {
    type: 'compromised_key',
    member: compromisedMember,
    proposal: removalProposal
  });
  
  // Step 3: Monitor for malicious proposals
  startMaliciousProposalMonitor(multisigPubkey, compromisedMember);
  
  console.log('Removal proposal created:', removalProposal);
  console.log('All members alerted');
  console.log('Monitoring for malicious activity...');
}
```

### 2. Multisig Recovery

```javascript
// Recover from multisig loss
async function recoverMultisig(lostMultisig, remainingMembers) {
  console.log('Starting multisig recovery process...');
  
  // Step 1: Deploy new multisig
  const newMultisig = await createMultisig({
    threshold: Math.ceil(remainingMembers.length * 0.6),
    members: remainingMembers,
    name: 'AHEE Recovery Multisig'
  });
  
  // Step 2: Transfer all authorities
  const authorities = await findAllAuthorities(lostMultisig);
  const transferInstructions = authorities.map(auth => 
    createTransferAuthorityInstruction(auth, newMultisig.pubkey)
  );
  
  // Step 3: Execute via backup mechanism
  if (remainingMembers.length >= 3) {
    // Use social recovery
    await executeSocialRecovery(transferInstructions, remainingMembers);
  } else {
    // Use timelock recovery
    await executeTimelockRecovery(transferInstructions);
  }
  
  console.log('New multisig deployed:', newMultisig.pubkey.toString());
  console.log('Authorities transferred');
}
```

## Resources

- Squads Protocol: https://squads.so/
- Multisig Best Practices: https://docs.squads.so/best-practices
- Emergency Contacts: security@ahee.io
- Audit Reports: https://ahee.io/security/audits 