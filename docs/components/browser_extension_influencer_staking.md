# Browser Extension – Influencer Staking UI

## Overview

This document specifies the user-experience and React component architecture for the new "Stake on Influencers" feature inside the AHEE browser extension.  The flow lets any user lock AC-D tokens behind an influencer's referral code, earn yield from that influencer's future rewards, and unstake later.

## Top-Level Navigation

```
Extension Popup Tabs
┌─────────────────────────────┐
│ 1. Campaigns                │
│ 2. My Earnings              │
│ 3. Stake on Influencers ★   │  ← New tab
│ 4. Settings                 │
└─────────────────────────────┘
```

## Component Tree

```
StakeOnInfluencers.tsx
├── InfluencerLeaderboard.tsx   // sortable table
│   └── InfluencerRow.tsx       // name, ROI, stake btn
├── StakeModal.tsx              // amount + lock slider
│   └── StakeConfirm.tsx        // tx summary
├── MyPositions.tsx             // active stakes
│   └── PositionRow.tsx         // claim/unstake buttons
└── YieldChart.tsx              // APY vs time
```

### 1. InfluencerLeaderboard

```typescript
interface InfluencerLeaderboardProps {
  sort: 'apy' | 'roi' | 'followers' | 'earnings';
  filter: {
    category?: string;
    minAPY?: number;
  };
}
```

Table columns
| Col | Description |
|-----|-------------|
| Influencer | avatar, handle, platform icons |
| Followers  | aggregate follower count |
| APY        | 7-day annualised yield (%) |
| Total Staked | sum of AC-D in pool |
| ROI 30d   | 30-day return on investment |
| Action    | `Stake` button |

Row click → opens `InfluencerProfileDrawer` with deeper stats (posts, audience overlap, recent yield events).

### 2. StakeModal

Flow:
1. User chooses amount with numeric input or quick buttons (25 % | 50 % | Max).  
2. Lock-period slider: 7d – 90d (discrete steps).  Show penalty preview.  
3. Summary card:
```
Stake: 1,000 AC-D ($100)
Lock: 30 days   Penalty: 5 %
Est. APY: 18 %  Est. Yield: 14.8 AC-D
Receipt NFT: #0x123…
```
4. Confirm → invokes `stake()` CPI via background script.  Transaction toast + explorer link.

### 3. MyPositions

```
┌──────────────────────────────────────────┐
│ My Staked Positions                      │
├──────────────────────────────────────────┤
│ 🎥 @sneakerqueen   APY 19.2 %            │
│ Stake: 2,500 AC-D  Unlock: 12 d          │
│ Yield: 38.4 AC-D   ROI: 8.1 %            │
│ [Claim] [Add] [Unstake]                  │
├──────────────────────────────────────────┤
│ 🥗 @healthychef    APY 14.7 %            │
│ Stake: 1,000 AC-D  Unlock: 3 d           │
│ Yield: 9.8 AC-D    ROI: 9.8 %            │
│ [Claim] [Add] [Unstake]                  │
└──────────────────────────────────────────┘
```

`Claim` → calls `claim()`; gasless via background script relay.  
`Add` opens StakeModal pre-filled.  
`Unstake` disabled until `lock_period` elapsed.

### 4. YieldChart

Uses victory-charts to plot cumulative APY vs time for selected influencer.  Pulls data from `/staking/apy-history?influencer=…` endpoint (see API doc).

## State Management

Recoil atoms (or Zustand store):
```typescript
stakePoolsAtom      // map<influencerId, PoolMeta>
leaderboardAtom     // sorted influencer list
positionsAtom       // user stakes
pendingTxAtom       // optimistic UI
```
WebSocket subscription pushes `YieldDepositEvent`, `StakeEvent`, `ClaimEvent` to update atoms in real-time.

## UX Edge Cases
- Display warning if user's AC-D balance < stake amount.  CTA to "Buy AC-D".
- Early-unstake attempt → modal showing penalty amount, require double-confirm.
- If influencer pool `yield_share` param changes, banner appears in MyPositions.
- If receipt NFT transferred (hardware wallet), position shown as "external".

## Visual Style Tokens
```
--stake-green:   #00c853;
--stake-red:     #ff5252;
--stake-bg:      #f1f8e9;
--stake-border:  rgba(0,0,0,0.05);
```

## Accessibility
- All modals keyboard navigable.  
- Color contrast WCAG AA.  
- ARIA live-regions for yield updates.

## Testing Checklist
1. Stake small amount → receipt NFT minted.  
2. Claim after yield deposit → AC-D transferred.  
3. Attempt early unstake → penalty applied & burned.  
4. Resize popup to 320 px width. UI wraps gracefully.  
5. Simulate network offline → cache leaderboard.

## Future Enhancements
- Auto-re-stake yield ("compound" toggle).  
- Social-share of stake receipt (OpenGraph image).  
- Pool chat powered by Lens protocol. 