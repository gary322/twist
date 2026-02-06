import { PublicKey } from '@solana/web3.js';

/**
 * Format TWIST amount for display
 */
export function formatTwist(amount: bigint): string {
  const decimals = 9;
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  
  if (whole >= 1000000n) {
    return `${(Number(whole) / 1000000).toFixed(2)}M TWIST`;
  } else if (whole >= 1000n) {
    return `${(Number(whole) / 1000).toFixed(2)}K TWIST`;
  } else {
    return `${whole}.${fraction.toString().padStart(decimals, '0').slice(0, 2)} TWIST`;
  }
}

/**
 * Shorten wallet address for display
 */
export function shortenAddress(address: string | PublicKey): string {
  const addr = typeof address === 'string' ? address : address.toBase58();
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

/**
 * Validate website URL
 */
export function validateWebsiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Calculate APY from pool metrics
 */
export function calculateAPY(
  dailyYield: bigint,
  totalStaked: bigint
): number {
  if (totalStaked === 0n) return 0;
  
  const dailyRate = Number(dailyYield) / Number(totalStaked);
  const annualRate = dailyRate * 365;
  return annualRate * 100;
}

/**
 * Calculate time until unlock
 */
export function timeUntilUnlock(unlockTimestamp: number): string {
  const now = Date.now() / 1000;
  const remaining = unlockTimestamp - now;
  
  if (remaining <= 0) return 'Unlocked';
  
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
}

/**
 * Parse tier from staked amount
 */
export function getTierFromAmount(amount: bigint): string {
  const tiers = [
    { min: 10000000000000n, name: 'Platinum' }, // 10K TWIST
    { min: 5000000000000n, name: 'Gold' },      // 5K TWIST
    { min: 1000000000000n, name: 'Silver' },    // 1K TWIST
    { min: 0n, name: 'Bronze' },
  ];
  
  for (const tier of tiers) {
    if (amount >= tier.min) {
      return tier.name;
    }
  }
  
  return 'Bronze';
}

/**
 * Generate widget embed code
 */
export function generateEmbedCode(config: {
  websiteUrl: string;
  sector: string;
  position?: string;
  theme?: string;
}): string {
  return `<!-- TWIST PSAB Widget -->
<script>
  (function() {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@twist-protocol/publisher-sdk@latest/dist/widget.js';
    script.async = true;
    script.onload = function() {
      window.psabWidget = new PSABWidget({
        websiteUrl: '${config.websiteUrl}',
        sector: '${config.sector}',
        widgetPosition: '${config.position || 'bottom-right'}',
        theme: '${config.theme || 'default'}',
        analytics: true
      });
      window.psabWidget.mount();
    };
    document.head.appendChild(script);
  })();
</script>`;
}

/**
 * Calculate burn/yield split
 */
export function calculateBurnYieldSplit(burnAmount: bigint): {
  burned: bigint;
  toStakers: bigint;
} {
  const burned = (burnAmount * 9000n) / 10000n; // 90%
  const toStakers = burnAmount - burned; // 10%
  
  return { burned, toStakers };
}

/**
 * Estimate daily earnings
 */
export function estimateDailyEarnings(
  stakedAmount: bigint,
  totalStaked: bigint,
  dailyBurnVolume: bigint
): bigint {
  if (totalStaked === 0n) return 0n;
  
  const stakersYield = (dailyBurnVolume * 1000n) / 10000n; // 10% of burns
  const userShare = (stakedAmount * 10000n) / totalStaked; // User's percentage * 10000
  const dailyEarnings = (stakersYield * userShare) / 10000n;
  
  return dailyEarnings;
}