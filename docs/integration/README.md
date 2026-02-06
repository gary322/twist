# TWIST Integration Documentation

> Complete integration guides for all stakeholders in the TWIST ecosystem

## Quick Links

### 🚀 Universal SDK
- [Universal SDK Guide](./universal_sdk_complete.md) - One SDK for ALL platforms
- [No-Code Widget Implementation](./no_code_widget_implementation.md) - Technical details
- [Product Integration Guide](./product_integration_guide.md) - For product owners

### 👥 For Influencers
- [Universal Links & Codes](./influencer_universal_links.md) - Promote ANY product
- [Influencer Staking Guide](./attribution_wallet_staking_guide.md) - Tier system

### 🌐 For Publishers
- [Publisher SDK](./publisher_sdk_complete.md) - Website integration
- [Mobile PWA Guide](./mobile_pwa_implementation.md) - Mobile support

### 📊 For Advertisers
- [Campaign & Attribution](./campaign_attribution_advanced.md) - Advanced campaigns
- [Privacy & Security](./privacy_security_implementation.md) - Targeting system

## Integration by Role

### Product Owners (Apps, SaaS, E-commerce)

**What You Get:**
- Reward users with TWIST tokens for any action
- Zero blockchain knowledge required
- Works on iOS, Android, Web, everywhere
- Integration in minutes, not days

**Quick Start:**
```html
<!-- One line for web products -->
<script src="https://twist.io/pixel.js" 
        data-product-id="your-product"
        data-api-key="twist_pk_xyz">
</script>
```

**Key Features:**
- Automatic email detection
- Standard action tracking (purchase, share, etc.)
- Custom event support
- Real-time analytics
- Fraud prevention built-in

[Full Product Integration Guide →](./product_integration_guide.md)

### Influencers

**What You Get:**
- Generate links/codes for ANY product
- No permission needed
- Earn on every conversion
- Track performance across products

**Quick Start:**
1. Visit twist.to/links
2. Search any product
3. Get your unique link
4. Start earning!

**Example:**
```
Your link: twist.to/p/nike-store/ref/yourname
Your code: TWIST-YOURNAME-NIKE-2024
```

[Full Influencer Guide →](./influencer_universal_links.md)

### Publishers (Website Owners)

**What You Get:**
- Earn TWIST from visitor attention
- Higher rates with bonding
- Simple SDK integration
- No user accounts needed

**Quick Start:**
```html
<script src="https://cdn.twist.io/sdk.js" 
        data-site-email="publisher@site.com">
</script>
```

[Full Publisher Guide →](./publisher_sdk_complete.md)

### Advertisers

**What You Get:**
- Privacy-preserving targeting
- Pay in stable USDC
- Real-time attribution
- Influencer marketplace

**Campaign Types:**
- CPM/CPC/CPA models
- Influencer campaigns
- Product launches
- User acquisition

[Full Advertiser Guide →](./campaign_attribution_advanced.md)

## Platform Support

### Mobile Apps
- **iOS**: App Store Connect integration (2 min setup)
- **Android**: Google Play integration (3 min setup)
- **React Native**: NPM package available
- **Flutter**: Pub package available

### Web Platforms
- **React/Next.js**: Full support
- **Vue/Nuxt**: Full support
- **Angular**: Full support
- **Vanilla JS**: Full support

### E-commerce
- **Shopify**: Official app
- **WooCommerce**: WordPress plugin
- **Magento**: Extension available
- **Custom**: Webhook API

### Gaming
- **Unity**: Package manager support
- **Unreal**: Plugin available
- **Roblox**: Module support
- **Web Games**: Pixel integration

### Communities
- **Discord**: Official bot
- **Telegram**: Official bot
- **Slack**: Webhook integration
- **Forums**: JS integration

## Key Concepts

### Universal Actions

Standard actions tracked across all platforms:

| Action | Default Reward | Description |
|--------|---------------|-------------|
| signup | 10 TWIST | New user registration |
| login | 1 TWIST | Daily active user |
| purchase | 50 TWIST | Completed purchase |
| share | 5 TWIST | Social share |
| refer | 25 TWIST | Successful referral |
| review | 15 TWIST | Posted review |

### Email-Based Identity

- Users identified by email across all platforms
- No wallet required to earn
- Tokens accumulate automatically
- Claim later with any Solana wallet

### Attribution System

- Configurable windows (1-90 days)
- Last-click or multi-touch
- Cross-platform tracking
- Influencer discovery

### Privacy & Security

- No personal data stored
- Local cohort computation
- HMAC authenticated
- Rate limited
- Bot protection

## Implementation Checklist

### For Products

- [ ] Register at twist.io/products
- [ ] Get Product ID and API Key
- [ ] Add SDK to your platform
- [ ] Verify email detection working
- [ ] Test reward distribution
- [ ] Configure custom events (optional)
- [ ] Launch to users!

### For Influencers

- [ ] Visit twist.to/links
- [ ] Find products to promote
- [ ] Generate unique links
- [ ] Add to bio/content
- [ ] Track performance
- [ ] Stake for higher tier
- [ ] Withdraw earnings

### For Publishers

- [ ] Add SDK to website
- [ ] Verify earning badge appears
- [ ] Consider bonding for 10x
- [ ] Monitor analytics
- [ ] Optimize placement
- [ ] Withdraw earnings

## Support Resources

- **Documentation**: docs.twist.io
- **Dashboard**: dashboard.twist.io
- **Discord**: discord.gg/twist
- **Email**: support@twist.io

## Architecture References

- [Hardware Attestation](./implementation_details_reference.md#hardware-attestation-implementation)
- [Privacy Implementation](./privacy_security_implementation.md)
- [Attribution Flow](./attribution_flow_clarified.md)
- [Economic Model](../README.md)

---

*Welcome to TWIST - The attention economy that rewards everyone!*