# TWIST Universal SDK - Quick Start Guide

> Get started in 60 seconds

## 1. Register Your Product (30 seconds)

Visit [twist.io/register](https://twist.io/register) and enter:
- Product name
- Product type (web, iOS, Android, etc.)
- Your email

You'll receive:
```
Product ID: your-product-name
API Key: twist_pk_abc123xyz
```

## 2. Add SDK to Your Product (30 seconds)

### For Websites

```html
<!-- Add before </body> -->
<script src="https://twist.io/pixel.js" 
        data-product-id="your-product-name"
        data-api-key="twist_pk_abc123xyz">
</script>
```

### For iOS Apps

1. Connect via App Store Connect
2. Paste App Store Shared Secret
3. Done! (No code in app)

### For Android Apps

1. Connect via Google Play Console
2. Upload service account JSON
3. Done! (No code in app)

### For Shopify

1. App Store → "TWIST Rewards"
2. Click "Add app"
3. Done!

### For Discord

1. Add @TwistRewardsBot
2. `/setup your-product-name twist_pk_abc123xyz`
3. Done!

## 3. That's It! 🎉

The SDK now automatically:
- ✅ Detects user emails
- ✅ Tracks purchases, signups, shares
- ✅ Rewards users with TWIST
- ✅ No blockchain knowledge needed
- ✅ Users don't need wallets

## What Users See

```
"You earned 50 TWIST for your purchase! 🌀"
```

Users can claim tokens later at twist.io

## Default Rewards

| Action | TWIST Earned |
|--------|-------------|
| Signup | 10 |
| Login | 1 |
| Purchase | 50 |
| Share | 5 |
| Refer Friend | 25 |

## Customize Rewards

Visit [dashboard.twist.io](https://dashboard.twist.io) to:
- Adjust reward amounts
- Add custom actions
- View analytics
- Track user engagement

## Test Your Integration

```javascript
// Enable debug mode
window.TWIST_DEBUG = true;

// Console will show:
// TWIST: Email detected: user@example.com
// TWIST: Action tracked: purchase
// TWIST: Reward: 50 TWIST
```

## Need Help?

- 📚 [Full Documentation](https://docs.twist.io)
- 💬 [Discord Support](https://discord.gg/twist)
- 📧 [Email Support](mailto:support@twist.io)

---

**Start rewarding your users in under 60 seconds!**