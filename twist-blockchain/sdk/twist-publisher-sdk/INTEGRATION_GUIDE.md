# TWIST Publisher SDK Integration Guide

## Overview

The TWIST Publisher SDK enables websites to integrate Page-Staked Attention Bonds (PSAB), allowing visitors to stake TWIST tokens on websites they support. When other visitors burn tokens while browsing, 90% is permanently destroyed and 10% goes to stakers.

## Quick Start

### 1. Simple Widget Integration

Add this code to your website's HTML:

```html
<!-- TWIST PSAB Widget -->
<script>
  (function() {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@twist-protocol/publisher-sdk@latest/dist/widget.js';
    script.async = true;
    script.onload = function() {
      window.psabWidget = new PSABWidget({
        websiteUrl: 'https://yourwebsite.com',
        sector: 'Gaming', // Options: Gaming, DeFi, NFT, Social, Other
        widgetPosition: 'bottom-right',
        theme: 'default',
        analytics: true
      });
      window.psabWidget.mount();
    };
    document.head.appendChild(script);
  })();
</script>
```

### 2. NPM Installation

```bash
npm install @twist-protocol/publisher-sdk
```

```typescript
import { PSABClient, PSABWidget } from '@twist-protocol/publisher-sdk';

// Initialize widget
const widget = new PSABWidget({
  websiteUrl: 'https://yourwebsite.com',
  sector: 'Gaming',
  widgetPosition: 'bottom-right',
  theme: 'dark',
  analytics: true
});

await widget.mount('widget-container');
```

## Configuration Options

### PSABConfig

```typescript
interface PSABConfig {
  // Required
  websiteUrl: string;           // Your website URL
  sector: string;               // Website category
  
  // Optional
  rpcEndpoint?: string;         // Solana RPC endpoint
  commitment?: string;          // Transaction commitment level
  widgetPosition?: string;      // Widget position on page
  theme?: string;               // Widget theme
  customStyles?: object;        // Custom CSS styles
  analytics?: boolean;          // Enable analytics
  debug?: boolean;              // Debug mode
}
```

### Widget Positions

- `bottom-right` (default)
- `bottom-left`
- `top-right`
- `top-left`

### Themes

- `default` - Purple gradient
- `dark` - Dark mode
- `minimal` - Minimal design
- `custom` - Use customStyles

## Advanced Integration

### 1. Programmatic Control

```javascript
// Show/hide widget
window.psabWidget.show();
window.psabWidget.hide();
window.psabWidget.toggle();

// Get pool info
const poolInfo = await window.psabWidget.getPoolInfo();
console.log('Total staked:', poolInfo.totalStaked);
console.log('Current APY:', poolInfo.currentAPY);

// Get user position
const position = await window.psabWidget.getUserPosition();
console.log('Your stake:', position?.amountStaked);
```

### 2. Custom Styling

```javascript
const widget = new PSABWidget({
  websiteUrl: 'https://yourwebsite.com',
  sector: 'Gaming',
  theme: 'custom',
  customStyles: {
    backgroundColor: '#1a1a1a',
    textColor: '#ffffff',
    accentColor: '#00ff88',
    borderRadius: '12px',
    fontFamily: 'Roboto, sans-serif',
    width: '400px'
  }
});
```

### 3. Event Handling

```javascript
// Listen for widget events
window.addEventListener('psab-event', (event) => {
  switch (event.detail.type) {
    case 'stake_initiated':
      console.log('User started staking process');
      break;
    case 'stake_completed':
      console.log('Stake successful:', event.detail.data);
      break;
    case 'burn_completed':
      console.log('Visitor burn processed:', event.detail.data);
      break;
    case 'error_occurred':
      console.error('Error:', event.detail.data);
      break;
  }
});
```

### 4. Direct SDK Usage

```javascript
import { PSABClient } from '@twist-protocol/publisher-sdk';

// Initialize client
const client = new PSABClient({
  websiteUrl: 'https://yourwebsite.com',
  sector: 'Gaming',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com'
});

await client.initialize();

// Get analytics
const analytics = await client.getWebsiteAnalytics();
console.log('Total burns:', analytics.totalBurns);
console.log('Daily volume:', analytics.dailyBurnVolume);

// Create transactions
const stakeIx = await client.createStakeInstruction(
  walletPublicKey,
  BigInt(1000 * 10**9) // 1000 TWIST
);

const burnIx = await client.createBurnInstruction(
  walletPublicKey,
  BigInt(10 * 10**9) // 10 TWIST
);
```

## Setting Up Your Bond Pool

Before users can stake on your website, you need to create a bond pool:

1. **Connect Wallet**: Visit https://twist.finance/publishers
2. **Create Pool**: Fill in your website details
3. **Configure Parameters**:
   - Minimum stake amount
   - Maximum stake amount (optional)
   - Lock duration (minimum 30 days)
   - Creator fee percentage
4. **Deploy Pool**: Sign transaction to create pool
5. **Register with VAU**: Register your website for burn tracking

## Analytics Integration

The SDK automatically tracks key metrics:

- Widget loads
- Stake initiations/completions
- Burn events
- Reward claims
- Error occurrences

Access your analytics dashboard at: https://twist.finance/publishers/analytics

## Security Considerations

1. **Domain Verification**: Ensure your website URL matches the registered pool
2. **HTTPS Required**: Widget only works on secure connections
3. **Content Security Policy**: Add our CDN to your CSP if needed:
   ```
   script-src 'self' https://unpkg.com;
   ```

## Troubleshooting

### Widget Not Appearing

1. Check browser console for errors
2. Verify website URL matches pool registration
3. Ensure script is loaded after DOM ready
4. Check CSP restrictions

### Connection Issues

1. Try different RPC endpoints
2. Check wallet connectivity
3. Verify network (mainnet/devnet)

### Pool Not Found

1. Ensure pool is created for your exact URL
2. Check if pool is active
3. Verify sector matches

## Best Practices

1. **Placement**: Position widget where it's visible but not intrusive
2. **Mobile**: Test on mobile devices for responsive design
3. **Loading**: Load widget asynchronously to not block page
4. **Fallback**: Provide alternative if widget fails to load
5. **Education**: Link to PSAB documentation for users

## Support

- Documentation: https://docs.twist.finance/publishers
- Discord: https://discord.gg/twist
- GitHub: https://github.com/twist-protocol/publisher-sdk
- Email: publishers@twist.finance

## Example Implementations

Check out these live examples:
- Gaming: https://example-game.com
- DeFi: https://example-defi.com
- NFT: https://example-nft.com