// Signature validation utilities
import { verify } from '@noble/ed25519';

export class SignatureValidator {
  async verifyECDSASignature(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    try {
      return await verify(signature, message, publicKey);
    } catch (error) {
      console.error('ECDSA signature verification failed:', error);
      return false;
    }
  }

  async verifyRSASignature(
    signature: ArrayBuffer,
    message: ArrayBuffer,
    publicKey: CryptoKey,
    algorithm: 'RS256' | 'RS384' | 'RS512' = 'RS256'
  ): Promise<boolean> {
    try {
      const hashAlg = {
        'RS256': 'SHA-256',
        'RS384': 'SHA-384',
        'RS512': 'SHA-512'
      }[algorithm];

      return await crypto.subtle.verify(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: hashAlg
        },
        publicKey,
        signature,
        message
      );
    } catch (error) {
      console.error('RSA signature verification failed:', error);
      return false;
    }
  }

  async importPublicKey(
    keyData: ArrayBuffer,
    algorithm: 'ECDSA' | 'RSA',
    curve?: 'P-256' | 'P-384' | 'P-521'
  ): Promise<CryptoKey> {
    if (algorithm === 'ECDSA') {
      return await crypto.subtle.importKey(
        'spki',
        keyData,
        {
          name: 'ECDSA',
          namedCurve: curve || 'P-256'
        },
        false,
        ['verify']
      );
    } else {
      return await crypto.subtle.importKey(
        'spki',
        keyData,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['verify']
      );
    }
  }

  parseJWK(jwk: any): { keyData: ArrayBuffer; algorithm: string } {
    // Parse JSON Web Key to extract key material
    if (jwk.kty === 'EC') {
      // Elliptic Curve key
      const x = this.base64UrlToArrayBuffer(jwk.x);
      const y = this.base64UrlToArrayBuffer(jwk.y);
      
      // Construct uncompressed EC public key (0x04 || x || y)
      const keyData = new Uint8Array(1 + x.byteLength + y.byteLength);
      keyData[0] = 0x04;
      keyData.set(new Uint8Array(x), 1);
      keyData.set(new Uint8Array(y), 1 + x.byteLength);
      
      return {
        keyData: keyData.buffer,
        algorithm: 'ECDSA'
      };
    } else if (jwk.kty === 'RSA') {
      // RSA key
      const n = this.base64UrlToArrayBuffer(jwk.n);
      const e = this.base64UrlToArrayBuffer(jwk.e);
      
      // Construct RSA public key in SPKI format
      // This is simplified - actual implementation would need proper ASN.1 encoding
      return {
        keyData: this.constructRSAPublicKey(n, e),
        algorithm: 'RSA'
      };
    } else {
      throw new Error(`Unsupported key type: ${jwk.kty}`);
    }
  }

  private base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
    // Convert base64url to base64
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
    
    // Decode base64
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }

  private constructRSAPublicKey(n: ArrayBuffer, e: ArrayBuffer): ArrayBuffer {
    // This is a simplified version - actual implementation would need
    // proper ASN.1 DER encoding for SPKI format
    // For production, use a proper ASN.1 library
    
    const nBytes = new Uint8Array(n);
    const eBytes = new Uint8Array(e);
    
    // Simplified SPKI structure (not complete)
    const totalLength = 100 + nBytes.length + eBytes.length;
    const spki = new Uint8Array(totalLength);
    
    // This would need proper ASN.1 encoding
    let offset = 0;
    // ... ASN.1 encoding logic ...
    
    return spki.buffer;
  }

  async verifyChallenge(
    challenge: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const challengeBytes = new TextEncoder().encode(challenge);
      const signatureBytes = this.hexToBytes(signature);
      const publicKeyBytes = this.hexToBytes(publicKey);
      
      return await this.verifyECDSASignature(
        signatureBytes,
        challengeBytes,
        publicKeyBytes
      );
    } catch (error) {
      console.error('Challenge verification failed:', error);
      return false;
    }
  }

  private hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error('Hex string must have even length');
    }
    
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
}