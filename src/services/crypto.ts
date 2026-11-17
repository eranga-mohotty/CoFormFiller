/**
 * Cryptographic Services for SmartForm AI (AES-256-GCM + PBKDF2-HMAC-SHA-256)
 * Pure Web Crypto implementation with zero external runtime dependencies.
 */

import type { EncryptedVaultEnvelope, EncryptedExportPayload } from '../types/storage.js';

const DEFAULT_ITERATIONS = 600000;
const AUTH_SENTINEL = 'SMARTFORM_VAULT_OK';

type PassphraseStrengthLevel = 'empty' | 'pin' | 'good' | 'strong';

export interface PassphraseStrength {
  score: number;
  label: string;
  level: PassphraseStrengthLevel;
}

function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (subtle) is not available in this environment.');
}

function getRandomBytes(length = 16): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('Web Crypto API (getRandomValues) is not available.');
}

function uint8ArrayToBase64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < u8.byteLength; i++) {
    const byte = u8[i];
    if (byte !== undefined) binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    const bytes = new Uint8Array(buf.length);
    bytes.set(buf);
    return bytes;
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateSalt(length = 16): string {
  return uint8ArrayToBase64(getRandomBytes(length));
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltBase64: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const passwordKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(String(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToUint8Array(saltBase64), iterations: iterations || DEFAULT_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKeyToBase64(cryptoKey: CryptoKey): Promise<string> {
  const raw = await getSubtleCrypto().exportKey('raw', cryptoKey);
  return uint8ArrayToBase64(new Uint8Array(raw));
}

export async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  return getSubtleCrypto().importKey(
    'raw',
    base64ToUint8Array(base64Key),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptObject<T = unknown>(plainObj: T, cryptoKey: CryptoKey): Promise<EncryptedVaultEnvelope> {
  const iv = getRandomBytes(12);
  const plainBytes = new TextEncoder().encode(JSON.stringify(plainObj));
  const cipherBuffer = await getSubtleCrypto().encrypt({ name: 'AES-GCM', iv }, cryptoKey, plainBytes);
  return { iv: uint8ArrayToBase64(iv), ciphertext: uint8ArrayToBase64(new Uint8Array(cipherBuffer)) };
}

export async function decryptObject<T = unknown>(envelope: EncryptedVaultEnvelope, cryptoKey: CryptoKey): Promise<T> {
  if (!envelope?.iv || !envelope?.ciphertext) throw new Error('Invalid encrypted payload envelope.');
  try {
    const plainBuffer = await getSubtleCrypto().decrypt(
      { name: 'AES-GCM', iv: base64ToUint8Array(envelope.iv) },
      cryptoKey,
      base64ToUint8Array(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plainBuffer)) as T;
  } catch (_err) {
    throw new Error('Decryption failed: Incorrect passphrase/PIN or corrupted data.');
  }
}

export async function createAuthVerifier(cryptoKey: CryptoKey): Promise<EncryptedVaultEnvelope> {
  return encryptObject({ sentinel: AUTH_SENTINEL }, cryptoKey);
}

export async function verifyAuthKey(cryptoKey: CryptoKey, verifierEnvelope: EncryptedVaultEnvelope): Promise<boolean> {
  try {
    const res = await decryptObject<{ sentinel?: string }>(verifierEnvelope, cryptoKey);
    return res?.sentinel === AUTH_SENTINEL;
  } catch (_e) {
    return false;
  }
}

export async function encryptExportPayload(
  data: unknown,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<EncryptedExportPayload> {
  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, salt, iterations);
  const encryptedData = await encryptObject(data, key);
  const verifier = await createAuthVerifier(key);

  return {
    smartformVersion: '1.0.0',
    format: 'smartform-encrypted-vault',
    exportDate: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    iv: encryptedData.iv,
    ciphertext: encryptedData.ciphertext,
    authVerifier: verifier
  };
}

export function isEncryptedExport(obj: unknown): obj is EncryptedExportPayload {
  if (typeof obj !== 'object' || obj === null) return false;
  const target = obj as Record<string, unknown>;
  const kdf = target.kdf as Record<string, unknown> | undefined;
  return (
    (target.format === 'smartform-encrypted-vault' || Boolean(target.kdf)) &&
    typeof kdf?.salt === 'string' &&
    typeof target.iv === 'string' &&
    typeof target.ciphertext === 'string'
  );
}

export async function decryptExportPayload<T = unknown>(exportEnvelope: unknown, passphrase: string): Promise<T> {
  if (!isEncryptedExport(exportEnvelope)) throw new Error('Payload is not an encrypted SmartForm vault.');
  const { kdf, iv, ciphertext, authVerifier } = exportEnvelope;
  const key = await deriveKeyFromPassphrase(passphrase, kdf.salt, kdf.iterations || DEFAULT_ITERATIONS);

  if (authVerifier && !(await verifyAuthKey(key, authVerifier))) {
    throw new Error('Incorrect passphrase/PIN for encrypted backup.');
  }
  return decryptObject<T>({ iv, ciphertext }, key);
}

export function evaluatePassphraseStrength(passphrase: string | null | undefined): PassphraseStrength {
  const str = String(passphrase || '');
  if (!str) return { score: 0, label: 'Empty', level: 'empty' };
  if (str.length < 6) return { score: 1, label: '⚡ Fast PIN', level: 'pin' };
  if (str.length < 12) return { score: 2, label: '🛡️ Standard Password', level: 'good' };
  return { score: 3, label: '🏰 Strong High-Entropy Passphrase', level: 'strong' };
}
