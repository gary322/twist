// WebAuthn Implementation
import { Base64 } from 'js-base64';
import { verify } from '@noble/ed25519';
import { Env, WebAuthnAttestation, AttestationResult } from '../types';
import {
  APPLE_WEBAUTHN_ROOT_CA,
  GOOGLE_WEBAUTHN_ROOT_CA,
  MICROSOFT_WEBAUTHN_ROOT_CA,
  YUBIKEY_ROOT_CA,
  KNOWN_AAGUIDS,
  ALLOWED_ORIGINS
} from '@shared/constants';

interface WebAuthnCredential {
  id: string;
  rawId: ArrayBuffer;
  response: {
    clientDataJSON: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle?: ArrayBuffer;
  };
  type: 'public-key';
}

interface ParsedAuthData {
  rpIdHash: ArrayBuffer;
  flags: {
    up: boolean;  // User present
    uv: boolean;  // User verified
    at: boolean;  // Attestation data
    ed: boolean;  // Extension data
  };
  signCount: number;
  aaguid: string | null;
  credentialId: ArrayBuffer | null;
  publicKey: ArrayBuffer | null;
  fmt?: string;
}

export class WebAuthnValidator {
  private trustedRoots: Map<string, string>;

  constructor() {
    this.trustedRoots = new Map([
      ['apple', APPLE_WEBAUTHN_ROOT_CA],
      ['google', GOOGLE_WEBAUTHN_ROOT_CA],
      ['microsoft', MICROSOFT_WEBAUTHN_ROOT_CA],
      ['yubikey', YUBIKEY_ROOT_CA],
    ]);
  }

  async validateAttestation(
    credential: WebAuthnCredential,
    challenge: string,
    env: Env
  ): Promise<AttestationResult> {
    try {
      // Parse client data
      const clientData = JSON.parse(
        new TextDecoder().decode(credential.response.clientDataJSON)
      );

      // Verify challenge
      if (clientData.challenge !== Base64.encode(challenge)) {
        return {
          valid: false,
          error: 'Challenge mismatch',
          trustScore: 0
        };
      }

      // Verify origin
      if (!ALLOWED_ORIGINS.some((origin: string) => clientData.origin.startsWith(origin))) {
        return {
          valid: false,
          error: 'Invalid origin',
          trustScore: 0
        };
      }

      // Parse authenticator data
      const authData = this.parseAuthenticatorData(credential.response.authenticatorData);

      // Verify signature
      const hash = await crypto.subtle.digest(
        'SHA-256',
        credential.response.authenticatorData
      );
      
      const clientDataHash = await crypto.subtle.digest(
        'SHA-256',
        credential.response.clientDataJSON
      );

      const signatureBase = new Uint8Array(hash.byteLength + clientDataHash.byteLength);
      signatureBase.set(new Uint8Array(hash), 0);
      signatureBase.set(new Uint8Array(clientDataHash), hash.byteLength);

      const publicKey = await this.getStoredPublicKey(credential.id, env);
      const signatureValid = await verify(
        new Uint8Array(credential.response.signature),
        signatureBase,
        publicKey
      );

      if (!signatureValid) {
        return {
          valid: false,
          error: 'Invalid signature',
          trustScore: 0
        };
      }

      // Calculate trust score based on attestation
      const trustScore = this.calculateTrustScore(authData, credential);

      // Cache successful attestation
      await env.ATTESTATION_CACHE.put(
        `attestation:${credential.id}`,
        JSON.stringify({
          trustScore,
          timestamp: Date.now(),
          flags: authData.flags
        }),
        { expirationTtl: 3600 } // 1 hour cache
      );

      return {
        valid: true,
        trustScore,
        attestationType: authData.fmt,
        aaguid: authData.aaguid || undefined
      };

    } catch (error) {
      console.error('WebAuthn validation error:', error);
      return {
        valid: false,
        error: 'Validation failed',
        trustScore: 0
      };
    }
  }

  private calculateTrustScore(authData: ParsedAuthData, credential: WebAuthnCredential): number {
    let score = 50; // Base score

    // User presence verified
    if (authData.flags.up) score += 10;

    // User verification (biometric/PIN)
    if (authData.flags.uv) score += 20;

    // Attestation type bonuses
    switch (authData.fmt) {
      case 'packed':
        score += 15;
        break;
      case 'tpm':
        score += 25; // Hardware TPM
        break;
      case 'android-key':
        score += 20; // Android hardware attestation
        break;
      case 'apple':
        score += 25; // Apple Secure Enclave
        break;
      case 'none':
        score -= 10; // Self-attestation
        break;
    }

    // Known authenticator bonus
    if (authData.aaguid && this.isKnownAuthenticator(authData.aaguid)) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private isKnownAuthenticator(aaguid: string): boolean {
    return Object.values(KNOWN_AAGUIDS).includes(aaguid);
  }

  private parseAuthenticatorData(authData: ArrayBuffer): ParsedAuthData {
    const dataView = new DataView(authData);
    let offset = 0;

    // RP ID Hash (32 bytes)
    const rpIdHash = authData.slice(offset, offset + 32);
    offset += 32;

    // Flags (1 byte)
    const flagsByte = dataView.getUint8(offset);
    const flags = {
      up: !!(flagsByte & 0x01),    // User present
      uv: !!(flagsByte & 0x04),    // User verified
      at: !!(flagsByte & 0x40),    // Attestation data
      ed: !!(flagsByte & 0x80),    // Extension data
    };
    offset += 1;

    // Sign count (4 bytes)
    const signCount = dataView.getUint32(offset);
    offset += 4;

    // Parse attestation data if present
    let aaguid = null;
    let credentialId = null;
    let publicKey = null;

    if (flags.at) {
      // AAGUID (16 bytes)
      aaguid = Array.from(new Uint8Array(authData.slice(offset, offset + 16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      offset += 16;

      // Credential ID length (2 bytes)
      const credIdLen = dataView.getUint16(offset);
      offset += 2;

      // Credential ID
      credentialId = authData.slice(offset, offset + credIdLen);
      offset += credIdLen;

      // Public key (CBOR encoded)
      publicKey = authData.slice(offset);
    }

    return {
      rpIdHash,
      flags,
      signCount,
      aaguid,
      credentialId,
      publicKey
    };
  }

  async getStoredPublicKey(credentialId: string, env: Env): Promise<Uint8Array> {
    // Retrieve stored public key for the credential
    const keyData = await env.DEVICE_REGISTRY.get(`pubkey:${credentialId}`);
    
    if (!keyData) {
      throw new Error('Public key not found for credential');
    }

    const keyInfo = JSON.parse(keyData);
    // Convert base64 to Uint8Array
    const binary = atob(keyInfo.publicKey);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async storePublicKey(
    credentialId: string, 
    publicKey: ArrayBuffer,
    userId: string,
    env: Env
  ): Promise<void> {
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(publicKey);
    const binary = Array.from(bytes)
      .map(byte => String.fromCharCode(byte))
      .join('');
    
    const keyData = {
      publicKey: btoa(binary),
      userId,
      createdAt: Date.now()
    };

    await env.DEVICE_REGISTRY.put(
      `pubkey:${credentialId}`,
      JSON.stringify(keyData)
    );
  }
}