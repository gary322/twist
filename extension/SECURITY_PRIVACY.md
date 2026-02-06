# TWIST Browser Extension - Security & Privacy Documentation

## Table of Contents
1. [Security Overview](#security-overview)
2. [Privacy Policy](#privacy-policy)
3. [Data Collection & Usage](#data-collection--usage)
4. [Security Architecture](#security-architecture)
5. [User Controls](#user-controls)
6. [Compliance](#compliance)
7. [Security Best Practices](#security-best-practices)
8. [Incident Response](#incident-response)

## Security Overview

The TWIST Browser Extension implements defense-in-depth security with multiple layers of protection:

- **Content Security Policy (CSP)**: Prevents XSS attacks and malicious code injection
- **Origin Validation**: Restricts communication to authorized domains only
- **Data Sanitization**: Removes sensitive information before any transmission
- **Encrypted Storage**: User credentials and wallet data encrypted at rest
- **Secure Communication**: All API calls use HTTPS with certificate validation

### Key Security Features

1. **No Password Storage**: The extension never stores user passwords
2. **Wallet Security**: Private keys never leave the wallet extension
3. **Session Management**: Secure token-based authentication with expiry
4. **Automatic Lockout**: Session expires after inactivity
5. **Phishing Protection**: Validates all TWIST domains before interaction

## Privacy Policy

### Our Commitment

TWIST is committed to protecting your privacy. This extension is designed with privacy-first principles:

- **Minimal Data Collection**: We only collect what's necessary for functionality
- **User Control**: You control what data is shared and when
- **No Third-Party Tracking**: We don't use any third-party analytics or tracking
- **Transparent Operations**: All data collection is clearly disclosed

### What We Collect

#### 1. Account Information
- **Email Address**: For account identification (encrypted)
- **Device ID**: Anonymous identifier for VAU tracking
- **Wallet Address**: Public key only (if connected)

#### 2. Browsing Activity (Only on Verified Publishers)
- **Page URL**: To verify publisher status
- **Time Spent**: For calculating token earnings
- **Basic Interactions**: Anonymized engagement metrics
- **No Content**: We never read page content or form data

#### 3. Staking Activity
- **Influencer Interactions**: Which profiles you view/stake on
- **Transaction History**: Staking amounts and rewards
- **Performance Metrics**: APY tracking for your stakes

### What We DON'T Collect

- ❌ **Passwords or Private Keys**
- ❌ **Personal Information** (name, address, phone)
- ❌ **Banking or Financial Data**
- ❌ **Form Inputs or Typed Text**
- ❌ **Private Browsing Activity**
- ❌ **Non-Publisher Site Activity**
- ❌ **Email Contents or Messages**
- ❌ **Search Queries** (except in-extension searches)

## Data Collection & Usage

### Verified Active Usage (VAU)

VAU data is collected to reward users for engaging with verified content:

```javascript
{
  userId: "anonymous_hash",
  siteId: "publisher_id",
  timeSpent: 120000, // milliseconds
  platform: "WEB",
  attestation: {
    trustScore: 100,
    activities: ["scroll", "click"] // Anonymized
  }
}
```

### Data Retention

- **Activity Data**: 30 days rolling window
- **Transaction History**: Permanent (blockchain)
- **Cached Data**: 24 hours
- **Search History**: 7 days (local only)

### Data Sharing

We share data only in these cases:
1. **With You**: Your earnings and staking data
2. **Publishers**: Aggregated, anonymous metrics
3. **Blockchain**: Public transaction data
4. **Law Enforcement**: Only with valid legal process

We NEVER:
- Sell your data to third parties
- Share individual browsing habits
- Allow advertiser tracking
- Create behavioral profiles for marketing

## Security Architecture

### 1. Extension Permissions

The extension requests only necessary permissions:

```json
{
  "permissions": [
    "storage",        // Save user preferences
    "tabs",          // Monitor active tab
    "notifications", // Earning alerts
    "alarms",        // Periodic tasks
    "contextMenus",  // Right-click actions
    "idle"           // Detect user presence
  ],
  "host_permissions": [
    "https://*/*",   // Check publisher status
    "http://*/*"     // Support all sites
  ]
}
```

### 2. Content Security Policy

Enforced on all extension pages:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://api.twist.io;
connect-src 'self' https://api.twist.io https://vau.twist.io;
img-src 'self' data: https:;
style-src 'self' 'unsafe-inline';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

### 3. XSS Prevention

Multiple layers of protection:

1. **Script Validation**: All injected scripts are validated
2. **DOM Monitoring**: Mutation observer detects malicious changes
3. **Input Sanitization**: All user inputs are sanitized
4. **Output Encoding**: Proper encoding for all displayed data

### 4. Sensitive Site Detection

Automatic detection and exclusion:

```javascript
const sensitivePatterns = [
  /banking|bank/i,
  /payment|checkout/i,
  /password|login/i,
  /credit.?card/i,
  /ssn|social.?security/i,
  /medical|health/i,
  /insurance/i
];
```

### 5. Communication Security

- **HTTPS Only**: All API calls use TLS 1.3+
- **Certificate Pinning**: Validates API certificates
- **Request Signing**: Critical requests are signed
- **Token Expiry**: JWT tokens expire after 24 hours

## User Controls

### Privacy Settings

Users have full control through three privacy modes:

#### 🔒 Strict Mode
- No tracking on sensitive sites
- Minimal data collection
- Manual publisher verification
- No automatic features

#### ⚖️ Balanced Mode (Default)
- Smart sensitive site detection
- Automatic publisher verification
- Standard earning features
- Privacy-preserving defaults

#### 🔓 Permissive Mode
- Track all allowed sites
- Maximum earning potential
- All features enabled
- Still excludes banking sites

### Data Management

Users can:
- **View Collected Data**: See all stored information
- **Export Data**: Download in JSON format
- **Delete Data**: Remove all or selective data
- **Pause Tracking**: Temporarily disable all tracking
- **Revoke Permissions**: Disable specific features

### Opt-Out Options

1. **Global Opt-Out**: Disable all tracking
2. **Site-Specific**: Block individual sites
3. **Feature-Specific**: Disable certain features
4. **Notification Control**: Manage alert preferences

## Compliance

### GDPR Compliance (Europe)

- ✅ **Lawful Basis**: Legitimate interest & consent
- ✅ **Data Portability**: Export feature available
- ✅ **Right to Erasure**: Delete account option
- ✅ **Privacy by Design**: Default privacy settings
- ✅ **Data Minimization**: Only necessary data
- ✅ **Purpose Limitation**: Data used only as stated

### CCPA Compliance (California)

- ✅ **Notice at Collection**: Clear privacy policy
- ✅ **Opt-Out Rights**: Do not sell option
- ✅ **Access Rights**: View all collected data
- ✅ **Deletion Rights**: Remove data on request
- ✅ **Non-Discrimination**: No penalty for privacy choices

### COPPA Compliance (Children)

- ⚠️ **Age Restriction**: Not for users under 13
- ⚠️ **No Child Data**: No knowingly collected data
- ⚠️ **Parental Controls**: Not applicable

## Security Best Practices

### For Users

1. **Keep Extension Updated**
   - Enable auto-updates
   - Check for updates weekly
   - Review changelog for security fixes

2. **Protect Your Account**
   - Use strong, unique passwords
   - Enable 2FA when available
   - Don't share login credentials

3. **Wallet Security**
   - Never enter seed phrases in extension
   - Verify transaction details
   - Use hardware wallets for large amounts

4. **Phishing Protection**
   - Verify TWIST domains
   - Check for HTTPS
   - Report suspicious sites

### For Developers

1. **Code Review**
   - All PRs require security review
   - Automated security scanning
   - Regular dependency updates

2. **Testing**
   - Penetration testing quarterly
   - Automated security tests
   - Bug bounty program

3. **Deployment**
   - Signed releases only
   - Checksum verification
   - Staged rollouts

## Incident Response

### Security Issue Reporting

Found a security issue? Please report it:

1. **Email**: security@twist.io
2. **PGP Key**: [Download](https://twist.io/pgp)
3. **Bug Bounty**: [Program Details](https://twist.io/security/bounty)

⚠️ **DO NOT** report security issues publicly on GitHub

### Response Timeline

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 72 hours
- **Fix Development**: Based on severity
- **Disclosure**: Coordinated with reporter

### Severity Levels

1. **Critical**: Immediate hotfix
2. **High**: Fix within 48 hours
3. **Medium**: Fix within 1 week
4. **Low**: Next regular release

## Data Breach Protocol

In the unlikely event of a data breach:

1. **Immediate Actions**
   - Isolate affected systems
   - Stop data collection
   - Assess impact scope

2. **User Notification**
   - Email affected users within 72 hours
   - Public announcement if widespread
   - Clear remediation steps

3. **Remediation**
   - Fix vulnerability
   - Enhance security measures
   - Offer identity protection if needed

## Third-Party Audits

Regular security audits by:
- **Penetration Testing**: Quarterly
- **Code Audit**: Bi-annually
- **Compliance Review**: Annually

Audit reports available upon request for enterprise users.

## Contact Information

### Privacy Inquiries
- Email: privacy@twist.io
- Form: https://twist.io/privacy/contact

### Security Issues
- Email: security@twist.io
- Bug Bounty: https://twist.io/security/bounty

### Data Protection Officer
- Email: dpo@twist.io
- Address: [Company Address]

### Legal Requests
- Email: legal@twist.io
- Fax: [Fax Number]

## Updates to This Policy

This policy may be updated periodically. Users will be notified of material changes via:
- In-extension notification
- Email to registered users
- Update notice on website

**Last Updated**: January 2024
**Version**: 2.0.0
**Effective Date**: [Deployment Date]

---

By using the TWIST Browser Extension, you agree to this Security & Privacy Policy. If you do not agree, please uninstall the extension.