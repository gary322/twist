# Hardware Attestation Implementation Guide

> Enabling universal device attestation without requiring external hardware purchases

## Overview

TWIST uses WebAuthn hardware attestation to prevent bot farming while maintaining accessibility for all users. This guide explains how to implement platform-based attestation that works across 95%+ of devices without requiring users to purchase hardware tokens.

## Core Concept

Instead of requiring external hardware tokens (YubiKey, etc.), TWIST leverages built-in security chips already present in modern devices:
- **Apple devices**: Secure Enclave
- **Windows PCs**: TPM 2.0
- **Android phones**: SafetyNet/Play Integrity
- **Other devices**: Fallback to reduced earning rates

## Implementation Architecture

### 1. Root CA Whitelist Extension

Add platform attestation roots to the existing whitelist in the Edge Worker:

```javascript
const ALLOWED_ROOTS = {
  // Existing hardware token roots
  yubikey: "308204...",
  solokey: "308203...",
  feitian: "308204...",
  
  // Platform authenticator roots (NEW)
  appleRoot: "308204...",      // Apple WebAuthn Root CA G2
  msRoot: "308203...",          // Microsoft Attestation Root CA 2019
  googleRoot: "308204...",      // Google SafetyNet Root CA
  
  // OIDs for verification
  appleOID: "1.2.840.113635.100.8.10",
  msOID: "1.3.6.1.4.1.311.21.8"
};
```

### 2. Attestation Verification Logic

Update the Edge Worker validation to support risk-based tiers:

```typescript
interface AttestationResult {
  trusted: boolean;
  deviceType: string;
  trustLevel: 'trusted' | 'untrusted' | 'rejected';
  earningMultiplier: number;
}

function verifyAttestation(attestationObject: ArrayBuffer): AttestationResult {
  const att = parseAttestation(attestationObject);
  
  switch (att.fmt) {
    case 'packed':
      if (att.x5c && isChainTrusted(att.x5c, ALLOWED_ROOTS)) {
        return {
          trusted: true,
          deviceType: 'hardware-token',
          trustLevel: 'trusted',
          earningMultiplier: 1.0
        };
      }
      // Self-attestation fallback
      return {
        trusted: false,
        deviceType: 'software',
        trustLevel: 'untrusted',
        earningMultiplier: 0.2
      };
      
    case 'apple':
      // Apple's proprietary format
      if (verifyAppleAttestation(att)) {
        return {
          trusted: true,
          deviceType: 'apple-secure-enclave',
          trustLevel: 'trusted',
          earningMultiplier: 1.0
        };
      }
      break;
      
    case 'tpm':
      // Windows TPM attestation
      if (verifyTPMAttestation(att, ALLOWED_ROOTS.msRoot)) {
        return {
          trusted: true,
          deviceType: 'windows-tpm',
          trustLevel: 'trusted',
          earningMultiplier: 1.0
        };
      }
      break;
      
    case 'android-safetynet':
      // Android SafetyNet
      if (verifySafetyNetAttestation(att)) {
        return {
          trusted: true,
          deviceType: 'android-safetynet',
          trustLevel: 'trusted',
          earningMultiplier: 1.0
        };
      }
      break;
      
    case 'none':
    case 'self':
      // Allow but with reduced trust
      return {
        trusted: false,
        deviceType: 'none',
        trustLevel: 'untrusted',
        earningMultiplier: 0.2
      };
      
    default:
      return {
        trusted: false,
        deviceType: 'unknown',
        trustLevel: 'rejected',
        earningMultiplier: 0
      };
  }
  
  // Default rejection
  return {
    trusted: false,
    deviceType: att.fmt,
    trustLevel: 'rejected',
    earningMultiplier: 0
  };
}
```

### 3. Browser Extension Integration

Update the browser extension to request platform attestation:

```javascript
// browser-extension/src/attestation.js
async function performDeviceAttestation() {
  try {
    const challenge = await fetchChallengeFromServer();
    
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challenge,
        rp: {
          name: "TWIST",
          id: "twist.io"
        },
        user: {
          id: userIdBuffer,
          name: userEmail,
          displayName: userName
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256
          { alg: -257, type: "public-key" }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",  // Force platform authenticator
          userVerification: "required",         // Require biometric/PIN
          residentKey: "required"
        },
        attestation: "direct",  // Request full attestation
        timeout: 60000
      }
    });
    
    return {
      credentialId: credential.id,
      attestationObject: credential.response.attestationObject,
      clientDataJSON: credential.response.clientDataJSON
    };
  } catch (error) {
    console.error("Attestation failed:", error);
    // Fallback to untrusted mode
    return null;
  }
}
```

### 4. Earning Rate Application

Apply different earning rates based on trust level:

```javascript
// Edge Worker
function calculateEarningRate(baseRate: number, attestation: AttestationResult): number {
  const kappaBase = 3 * C_POP / P_AC;  // Base cap from economics
  
  switch (attestation.trustLevel) {
    case 'trusted':
      // Full earning potential
      return Math.min(baseRate, kappaBase);
      
    case 'untrusted':
      // Reduced earning (20% of cap)
      return Math.min(baseRate, kappaBase * 0.2);
      
    case 'rejected':
      // No earning
      return 0;
      
    default:
      return 0;
  }
}
```

## Platform Coverage

### Trusted Devices (Full Earning Rate)

| Platform | Attestation Type | Requirements |
|----------|-----------------|--------------|
| iPhone/iPad | Apple Secure Enclave | iOS 14+ |
| MacBook | Touch ID | macOS 11+ |
| Windows PC | TPM 2.0 | Windows 10 1903+ |
| Android | SafetyNet | Android 7+ |
| Hardware Keys | FIDO2 | YubiKey, SoloKey, etc. |

### Untrusted Devices (20% Earning Rate)

| Platform | Reason | Mitigation |
|----------|--------|------------|
| Linux | No platform authenticator | Can use hardware key for full rate |
| Old Windows | No TPM | Software attestation allowed |
| Rooted Android | Failed SafetyNet | Reduced earning prevents abuse |
| Virtual Machines | No hardware backing | Economic penalties make farming unprofitable |

## Security Considerations

### 1. Certificate Validation

```javascript
function isChainTrusted(x5c: ArrayBuffer[], allowedRoots: object): boolean {
  // Extract root certificate from chain
  const rootCert = x5c[x5c.length - 1];
  const rootHash = sha256(rootCert);
  
  // Check against whitelist
  for (const [name, trustedRoot] of Object.entries(allowedRoots)) {
    if (rootHash === sha256(trustedRoot)) {
      // Verify full chain
      return verifyX509Chain(x5c);
    }
  }
  
  return false;
}
```

### 2. Anti-Replay Protection

```javascript
// Store used challenges for 5 minutes
const challengeCache = new Map<string, number>();

function validateChallenge(challenge: string): boolean {
  const now = Date.now();
  
  // Clean old challenges
  for (const [ch, timestamp] of challengeCache) {
    if (now - timestamp > 300000) {  // 5 minutes
      challengeCache.delete(ch);
    }
  }
  
  // Check if already used
  if (challengeCache.has(challenge)) {
    return false;
  }
  
  challengeCache.set(challenge, now);
  return true;
}
```

### 3. Rate Limiting

```javascript
// Per-device rate limiting
const deviceLimits = new Map<string, RateLimit>();

interface RateLimit {
  lastAttestation: number;
  dailyCount: number;
  violations: number;
}

function checkRateLimit(deviceId: string): boolean {
  const limit = deviceLimits.get(deviceId) || {
    lastAttestation: 0,
    dailyCount: 0,
    violations: 0
  };
  
  const now = Date.now();
  const dayStart = Math.floor(now / 86400000) * 86400000;
  
  // Reset daily counter
  if (limit.lastAttestation < dayStart) {
    limit.dailyCount = 0;
  }
  
  // Check limits
  if (limit.dailyCount >= 288) {  // Max 1 per 5 minutes
    limit.violations++;
    return false;
  }
  
  limit.lastAttestation = now;
  limit.dailyCount++;
  deviceLimits.set(deviceId, limit);
  
  return true;
}
```

## Implementation Timeline

### Phase 1: Core Implementation (Week 1-2)
- [ ] Add platform root certificates to Edge Worker
- [ ] Implement attestation parsing for all formats
- [ ] Update browser extension for platform attestation
- [ ] Test on major platforms

### Phase 2: Risk Scoring (Week 3)
- [ ] Implement trust level classification
- [ ] Add earning rate multipliers
- [ ] Deploy rate limiting system
- [ ] Monitor attestation success rates

### Phase 3: Optimization (Week 4)
- [ ] Add attestation caching for performance
- [ ] Implement graceful fallbacks
- [ ] Add detailed logging and metrics
- [ ] Launch with reduced rates for testing

## Testing Checklist

### Platform Testing
- [ ] iPhone with Face ID
- [ ] iPhone with Touch ID
- [ ] MacBook with Touch ID
- [ ] Windows 11 with TPM
- [ ] Windows 10 with TPM
- [ ] Android with SafetyNet pass
- [ ] Android with SafetyNet fail
- [ ] Linux desktop
- [ ] Hardware security key

### Security Testing
- [ ] Attempt replay attacks
- [ ] Test with modified attestation
- [ ] Verify rate limiting
- [ ] Check certificate validation
- [ ] Test with virtual machines

## Monitoring and Metrics

Track these metrics post-launch:

```javascript
interface AttestationMetrics {
  totalAttempts: number;
  successfulAttestations: number;
  attestationsByType: {
    [key: string]: number;
  };
  trustLevelDistribution: {
    trusted: number;
    untrusted: number;
    rejected: number;
  };
  platformDistribution: {
    [platform: string]: number;
  };
  averageEarningMultiplier: number;
  vauAttestationUnknownTotal: number; // Critical P0 metric
}
```

### Critical Alerts

```javascript
// Prometheus alert configuration
- alert: UnknownAttestationFormat
  expr: vau_attestation_unknown_total > 0
  for: 5m
  labels:
    severity: P0
  annotations:
    summary: "Unknown attestation format detected"
    description: "New attestation format requires immediate root CA addition"
```

## Attestation Failure Handling

### Automatic Retry Logic

```javascript
async function performAttestationWithRetry() {
  try {
    // First attempt with full attestation
    const result = await performDeviceAttestation();
    if (result && result.attestationObject) {
      return { ...result, trustLevel: 'trusted' };
    }
  } catch (error) {
    console.log("Primary attestation failed, falling back to untrusted mode");
  }
  
  // Retry with no attestation (untrusted mode)
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        // ... same params ...
        attestation: "none"  // No attestation, but still device-bound
      }
    });
    
    return {
      credentialId: credential.id,
      attestationObject: null,
      clientDataJSON: credential.response.clientDataJSON,
      trustLevel: 'untrusted'
    };
  } catch (fallbackError) {
    console.error("Even untrusted mode failed:", fallbackError);
    return null;
  }
}
```

### Hot-Swapping Root Certificates

```javascript
// Edge Worker KV structure for dynamic root updates
const ROOT_CA_KV = {
  "yubikey": { cert: "308204...", addedAt: "2024-01-01" },
  "solokey": { cert: "308203...", addedAt: "2024-01-01" },
  "apple": { cert: "308204...", addedAt: "2024-03-15" },
  "microsoft": { cert: "308203...", addedAt: "2024-03-15" },
  // Can be updated without code deployment
};

// Function to refresh roots from KV
async function refreshAllowedRoots() {
  const roots = await env.KV.get("ALLOWED_ROOTS", "json");
  if (roots && roots.version > CACHED_ROOTS_VERSION) {
    ALLOWED_ROOTS = roots.certificates;
    CACHED_ROOTS_VERSION = roots.version;
  }
}
```

## Conclusion

This implementation provides:
- **95%+ device coverage** without hardware purchases
- **Strong bot resistance** through vendor attestation
- **Graceful degradation** for unsupported devices
- **Economic incentives** for legitimate users
- **Simple user experience** using built-in biometrics

The system maintains TWIST's security goals while maximizing accessibility and user adoption.