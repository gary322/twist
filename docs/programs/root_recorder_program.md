# Root Recorder Program (`root_recorder`)

Program ID: `ROOT1111111111111111111111111111111111111111`  •  Language: Rust (Native Solana)  •  Audit: Required

---
## 1. Purpose
Stores daily Merkle roots of Verified Attention Units (VAUs) on-chain after 2-of-3 aggregator quorum agreement. This is the foundational data integrity layer that all downstream programs (Thermostat, Explorer, etc.) rely on for verifiable attention metrics.

---
## 2. Core Responsibilities
- Accept Merkle root submissions from authorized aggregators
- Enforce 2-of-3 quorum before committing roots
- Provide read access to historical roots for verification
- Maintain strict ordering (no gaps in bucket indices)
- Act as source of truth for all attention data

---
## 3. Account Structure

### 3.1 Program State (Singleton PDA)
```rust
#[account]
pub struct ProgramState {
    pub authority: Pubkey,           // Multisig authority
    pub aggregators: [Pubkey; 3],    // Authorized aggregator keys
    pub current_index: u64,          // Latest committed root index
    pub emergency_pause: bool,       // Circuit breaker
    pub min_quorum: u8,             // Required votes (default: 2)
}

// PDA: ["state"]
```

### 3.2 Merkle Root Account
```rust
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Pod, Zeroable)]
pub struct MerkleRoot {
    pub index: u64,                  // Bucket index (5-second intervals)
    pub root: [u8; 32],             // Poseidon hash of VAU tree
    pub timestamp: i64,             // Unix timestamp when committed
    pub leaf_count: u32,            // Number of VAUs in tree
    pub aggregator_votes: u8,       // Bitmap of which aggregators voted
}

// PDA: ["root", index.to_le_bytes()]
// Size: 8 + 32 + 8 + 4 + 1 = 53 bytes
```

### 3.3 Pending Root Account
```rust
#[account]
pub struct PendingRoot {
    pub index: u64,
    pub proposals: [RootProposal; 3],
    pub created_at: i64,
    pub expires_at: i64,            // Auto-cleanup after 10 minutes
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RootProposal {
    pub aggregator: Pubkey,
    pub root_hash: [u8; 32],
    pub leaf_count: u32,
    pub submitted_at: i64,
}

// PDA: ["pending", index.to_le_bytes()]
```

---
## 4. Instructions

### 4.1 Initialize Program
```rust
pub fn initialize(
    ctx: Context<Initialize>,
    aggregators: [Pubkey; 3],
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    
    state.authority = ctx.accounts.authority.key();
    state.aggregators = aggregators;
    state.current_index = 0;
    state.emergency_pause = false;
    state.min_quorum = 2;
    
    emit!(ProgramInitialized {
        authority: state.authority,
        aggregators,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProgramState::SIZE,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, ProgramState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

### 4.2 Submit Root
```rust
pub fn submit_root(
    ctx: Context<SubmitRoot>,
    index: u64,
    root_hash: [u8; 32],
    leaf_count: u32,
) -> Result<()> {
    let state = &ctx.accounts.state;
    let clock = Clock::get()?;
    
    // Validations
    require!(!state.emergency_pause, ErrorCode::ProgramPaused);
    require!(
        ctx.accounts.aggregator.key() == state.aggregators[0] ||
        ctx.accounts.aggregator.key() == state.aggregators[1] ||
        ctx.accounts.aggregator.key() == state.aggregators[2],
        ErrorCode::UnauthorizedAggregator
    );
    
    // Index must be next in sequence or recent retry
    require!(
        index == state.current_index + 1 || 
        (index == state.current_index && clock.unix_timestamp - last_root_time < 300),
        ErrorCode::InvalidIndex
    );
    
    // Get or create pending root
    let pending = &mut ctx.accounts.pending_root;
    
    if pending.index == 0 {
        // First submission for this index
        pending.index = index;
        pending.created_at = clock.unix_timestamp;
        pending.expires_at = clock.unix_timestamp + 600; // 10 minutes
    }
    
    // Find aggregator slot
    let agg_index = state.aggregators
        .iter()
        .position(|&a| a == ctx.accounts.aggregator.key())
        .unwrap();
    
    // Record proposal
    pending.proposals[agg_index] = RootProposal {
        aggregator: ctx.accounts.aggregator.key(),
        root_hash,
        leaf_count,
        submitted_at: clock.unix_timestamp,
    };
    
    // Check for quorum
    let matching_roots = pending.proposals
        .iter()
        .filter(|p| p.root_hash == root_hash && p.aggregator != Pubkey::default())
        .count();
    
    if matching_roots >= state.min_quorum as usize {
        // Commit root
        self.commit_root(ctx, index, root_hash, leaf_count)?;
    }
    
    emit!(RootSubmitted {
        index,
        aggregator: ctx.accounts.aggregator.key(),
        root_hash,
        leaf_count,
    });
    
    Ok(())
}

fn commit_root(
    ctx: Context<SubmitRoot>,
    index: u64,
    root_hash: [u8; 32],
    leaf_count: u32,
) -> Result<()> {
    let root_account = &mut ctx.accounts.root;
    let state = &mut ctx.accounts.state;
    let clock = Clock::get()?;
    
    // Initialize root account
    root_account.index = index;
    root_account.root = root_hash;
    root_account.timestamp = clock.unix_timestamp;
    root_account.leaf_count = leaf_count;
    
    // Set aggregator vote bitmap
    let mut votes = 0u8;
    for (i, proposal) in ctx.accounts.pending_root.proposals.iter().enumerate() {
        if proposal.root_hash == root_hash {
            votes |= 1 << i;
        }
    }
    root_account.aggregator_votes = votes;
    
    // Update state
    state.current_index = index;
    
    // Close pending account to reclaim rent
    ctx.accounts.pending_root.close(ctx.accounts.authority.to_account_info())?;
    
    emit!(RootCommitted {
        index,
        root: root_hash,
        leaf_count,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

### 4.3 Emergency Pause
```rust
pub fn set_emergency_pause(
    ctx: Context<SetEmergencyPause>,
    paused: bool,
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    
    require!(
        ctx.accounts.authority.key() == state.authority,
        ErrorCode::UnauthorizedAuthority
    );
    
    state.emergency_pause = paused;
    
    emit!(EmergencyPauseSet { paused });
    
    Ok(())
}
```

### 4.4 Update Aggregators
```rust
pub fn update_aggregators(
    ctx: Context<UpdateAggregators>,
    new_aggregators: [Pubkey; 3],
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    
    require!(
        ctx.accounts.authority.key() == state.authority,
        ErrorCode::UnauthorizedAuthority
    );
    
    // Ensure no duplicates
    require!(
        new_aggregators[0] != new_aggregators[1] &&
        new_aggregators[0] != new_aggregators[2] &&
        new_aggregators[1] != new_aggregators[2],
        ErrorCode::DuplicateAggregator
    );
    
    let old_aggregators = state.aggregators;
    state.aggregators = new_aggregators;
    
    emit!(AggregatorsUpdated {
        old: old_aggregators,
        new: new_aggregators,
    });
    
    Ok(())
}
```

---
## 5. View Functions

### 5.1 Get Root by Index
```rust
pub fn get_root(index: u64) -> Result<MerkleRoot> {
    let (root_pda, _) = Pubkey::find_program_address(
        &[b"root", &index.to_le_bytes()],
        &id()
    );
    
    let account = Account::<MerkleRoot>::try_from(&root_pda)?;
    Ok(account.into_inner())
}
```

### 5.2 Get Root Range
```rust
pub fn get_root_range(
    start_index: u64,
    end_index: u64,
) -> Result<Vec<MerkleRoot>> {
    require!(end_index >= start_index, ErrorCode::InvalidRange);
    require!(end_index - start_index <= 1000, ErrorCode::RangeTooLarge);
    
    let mut roots = Vec::new();
    for index in start_index..=end_index {
        if let Ok(root) = get_root(index) {
            roots.push(root);
        }
    }
    
    Ok(roots)
}
```

### 5.3 Verify VAU Inclusion
```rust
pub fn verify_vau_inclusion(
    index: u64,
    vau_hash: [u8; 32],
    proof: Vec<[u8; 32]>,
    leaf_index: u32,
) -> Result<bool> {
    let root = get_root(index)?;
    
    // Verify Merkle proof
    let mut current = vau_hash;
    let mut idx = leaf_index;
    
    for sibling in proof {
        current = if idx & 1 == 0 {
            poseidon_hash(&[current, sibling])
        } else {
            poseidon_hash(&[sibling, current])
        };
        idx >>= 1;
    }
    
    Ok(current == root.root)
}
```

---
## 6. Security Considerations

### 6.1 Attack Vectors & Mitigations
| Attack | Mitigation | Residual Risk |
|--------|-----------|---------------|
| Rogue aggregator | 2-of-3 quorum required | Low (need 2 compromised) |
| Root manipulation | Immutable once committed | None |
| Index gaps | Sequential validation | None |
| Replay attack | Timestamp + index checks | None |
| DoS via spam | Aggregator whitelist | Low |
| Emergency hijack | Multisig authority only | Low |

### 6.2 Fail-Safe Mechanisms
1. **Emergency Pause**: Stops new roots if attack detected
2. **Quorum Override**: Authority can force-commit if 2 aggregators fail
3. **Expiry Cleanup**: Pending roots auto-expire after 10 minutes
4. **Gap Detection**: Downstream programs halt if index gaps detected

---
## 7. Gas Optimization

### 7.1 Compute Units
| Instruction | Base CU | With Quorum Check | Total |
|-------------|---------|-------------------|-------|
| submit_root (first) | 15k | - | 15k |
| submit_root (second) | 15k | 10k | 25k |
| submit_root (commit) | 15k | 10k + 30k | 55k |
| get_root | 5k | - | 5k |
| verify_inclusion | 5k | 20k * depth | 25k-125k |

### 7.2 Account Rent
- ProgramState: ~0.002 SOL (permanent)
- Each MerkleRoot: ~0.0015 SOL (permanent)
- PendingRoot: ~0.003 SOL (reclaimed on commit)

At 17,280 roots/day: ~26 SOL/day rent cost

---
## 8. Cross-Program Invocation (CPI)

### 8.1 For Downstream Programs
```rust
// Example: Thermostat reading roots
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ReadRoot<'info> {
    /// CHECK: Root account from root_recorder
    pub root_account: AccountInfo<'info>,
}

pub fn get_root_for_thermostat(
    ctx: Context<ReadRoot>,
    index: u64,
) -> Result<MerkleRoot> {
    let expected_pda = Pubkey::find_program_address(
        &[b"root", &index.to_le_bytes()],
        &root_recorder::ID
    ).0;
    
    require!(
        ctx.accounts.root_account.key() == expected_pda,
        ErrorCode::InvalidRootAccount
    );
    
    let root = MerkleRoot::try_from_slice(&ctx.accounts.root_account.data.borrow())?;
    
    Ok(root)
}
```

### 8.2 Authority Patterns
Only the root_recorder program can write to root accounts. All other programs must read via CPI or direct account access.

---
## 9. Events

### 9.1 Event Definitions
```rust
#[event]
pub struct RootSubmitted {
    pub index: u64,
    pub aggregator: Pubkey,
    pub root_hash: [u8; 32],
    pub leaf_count: u32,
}

#[event]
pub struct RootCommitted {
    pub index: u64,
    pub root: [u8; 32],
    pub leaf_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyPauseSet {
    pub paused: bool,
}

#[event]
pub struct AggregatorsUpdated {
    pub old: [Pubkey; 3],
    pub new: [Pubkey; 3],
}
```

### 9.2 Event Monitoring
```typescript
// Client-side monitoring
const program = new Program(idl, ROOT_RECORDER_ID, provider);

program.addEventListener('RootCommitted', (event) => {
    console.log(`Root ${event.index} committed:`, event.root);
    // Update local cache
    rootCache.set(event.index, event);
    // Notify dependent services
    notifyDownstream(event.index);
});
```

---
## 10. Testing

### 10.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_quorum_logic() {
        let mut program_test = ProgramTest::new(
            "root_recorder",
            id(),
            processor!(process_instruction)
        );
        
        let (mut banks_client, payer, recent_blockhash) = 
            program_test.start().await;
        
        // Initialize program
        let aggregators = [
            Keypair::new().pubkey(),
            Keypair::new().pubkey(),
            Keypair::new().pubkey(),
        ];
        
        // Submit from first aggregator
        submit_root(&mut banks_client, &payer, 1, [1u8; 32], &aggregators[0])
            .await
            .unwrap();
        
        // Root should not be committed yet
        assert!(get_root(&mut banks_client, 1).await.is_err());
        
        // Submit from second aggregator with same root
        submit_root(&mut banks_client, &payer, 1, [1u8; 32], &aggregators[1])
            .await
            .unwrap();
        
        // Root should now be committed
        let root = get_root(&mut banks_client, 1).await.unwrap();
        assert_eq!(root.root, [1u8; 32]);
    }
}
```

### 10.2 Integration Tests
```rust
#[tokio::test]
async fn test_gap_detection() {
    // Try to submit index 5 when current is 3
    let result = submit_root(
        &mut banks_client,
        &payer,
        5,  // Gap!
        [5u8; 32],
        &aggregator1
    ).await;
    
    assert_eq!(
        result.unwrap_err().unwrap(),
        ErrorCode::InvalidIndex.into()
    );
}
```

### 10.3 Fuzzing
```rust
proptest! {
    #[test]
    fn fuzz_root_submission(
        indices in prop::collection::vec(0u64..1000, 1..100),
        roots in prop::collection::vec(prop::array::uniform32(0u8..255), 1..100)
    ) {
        // Submit roots in random order
        // Verify only sequential commits succeed
        // Verify quorum logic holds
    }
}
```

---
## 11. Monitoring & Alerts

### 11.1 Key Metrics
```yaml
- name: root_commit_latency
  query: |
    histogram_quantile(0.99,
      root_recorder_commit_time_seconds_bucket{job="quorum_daemon"}
    )
  alert_threshold: 10s

- name: missing_roots
  query: |
    increase(root_recorder_current_index[5m]) < 50
  alert: "Root submission rate too low"

- name: quorum_failures
  query: |
    rate(root_recorder_quorum_failures_total[5m]) > 0.1
  alert: "High quorum failure rate"
```

### 11.2 Operational Procedures
1. **Aggregator Rotation**: Update keys via multisig, wait for pending roots to clear
2. **Emergency Response**: Pause → investigate → patch → resume
3. **Recovery from Gaps**: Manual force-commit with historical data

---
## 12. Upgrade Path

### 12.1 Immutable Core
The root storage logic is immutable once deployed. Only authority and aggregator management can be updated.

### 12.2 Migration Strategy
If upgrade needed:
1. Deploy new program
2. Dual-write period (both programs receive roots)
3. Downstream programs migrate reads
4. Deprecate old program

---
## 13. Fee Structure

No fees charged by the program itself. Transaction fees only:
- Submit root: ~0.00025 SOL
- Commit root: ~0.0005 SOL
- Daily cost: ~5 SOL for all roots

---
End of file 