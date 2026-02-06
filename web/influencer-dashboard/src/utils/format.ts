export const formatToken = (amount: bigint | string): string => {
  const value = BigInt(amount);
  const decimals = 9; // TWIST has 9 decimals
  const divisor = BigInt(10 ** decimals);
  
  const tokens = value / divisor;
  const remainder = value % divisor;
  
  // Format with commas
  const tokenStr = tokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  // Add decimal places if needed
  if (remainder > 0n) {
    const decimalStr = remainder.toString().padStart(decimals, '0');
    const trimmed = decimalStr.replace(/0+$/, '').slice(0, 2);
    if (trimmed) {
      return `${tokenStr}.${trimmed} TWIST`;
    }
  }
  
  return `${tokenStr} TWIST`;
};

export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

export const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatTime = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};