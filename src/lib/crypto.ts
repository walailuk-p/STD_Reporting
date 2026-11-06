/**
 * Cryptographic helpers for student 6-digit PIN hashing
 * Uses Web Crypto API (SubtleCrypto) supported on all modern Android (Chrome) and iOS (Safari) browsers.
 * Never stores plain-text passwords.
 */

export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin.trim()}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  if (!pin || !salt || !expectedHash) return false;
  const computedHash = await hashPin(pin, salt);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}
