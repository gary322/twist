export function formatToken(amount: bigint | string | number): string {
  let value: bigint;
  
  if (typeof amount === 'string') {
    value = BigInt(amount);
  } else if (typeof amount === 'number') {
    value = BigInt(Math.floor(amount));
  } else {
    value = amount;
  }
  
  const whole = value / BigInt(10 ** 9);
  const decimal = value % BigInt(10 ** 9);
  
  if (decimal === BigInt(0)) {
    return whole.toString();
  }
  
  // Format with up to 2 decimal places
  const decimalStr = decimal.toString().padStart(9, '0');
  const significantDecimals = decimalStr.substring(0, 2);
  
  return `${whole}.${significantDecimals}`;
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}