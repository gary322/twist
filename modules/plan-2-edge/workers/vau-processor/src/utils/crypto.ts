// Cryptographic utilities
import { verify } from '@noble/ed25519';

export async function verifyECDSASignature(
  signature: string,
  payload: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Convert hex strings to Uint8Array
    const signatureBytes = hexToBytes(signature);
    const messageBytes = new TextEncoder().encode(payload);
    const publicKeyBytes = hexToBytes(publicKey);

    // Verify signature
    const isValid = await verify(signatureBytes, messageBytes, publicKeyBytes);
    return isValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

export async function generateHMAC(
  message: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyHMAC(
  message: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expectedSignature = await generateHMAC(message, secret);
  return timingSafeEqual(signature, expectedSignature);
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return bytesToHex(new Uint8Array(hash));
}