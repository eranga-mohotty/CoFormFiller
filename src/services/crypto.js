/**
 * Cryptographic Services for SmartForm AI
 * Uses native Web Crypto API (SubtleCrypto) with AES-256-GCM and PBKDF2-HMAC-SHA-256.
 * Zero external dependencies. Works in Chrome MV3, Firefox MV3, and Node.js 16+.
 */

const DEFAULT_ITERATIONS = 600000;
const AUTH_SENTINEL = 'SMARTFORM_VAULT_OK';

/**
 * Resolves SubtleCrypto in browser or Node environment.
 */
function getSubtleCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (subtle) is not available in this environment.');
}

/**
 * Resolves getRandomValues in browser or Node environment.
 */
export function getRandomBytes(length = 16) {
  const bytes = new Uint8Array(length);
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('Web Crypto API (getRandomValues) is not available.');
}

/**
 * Converts Uint8Array to Base64 string.
 */
export function uint8ArrayToBase64(u8) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  let binary = '';
  const len = u8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

/**
 * Converts Base64 string to Uint8Array.
 */
export function base64ToUint8Array(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a random cryptographic salt.
 */
export function generateSalt(length = 16) {
  return uint8ArrayToBase64(getRandomBytes(length));
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a passphrase and salt using PBKDF2.
 * Supports any passphrase length (1 digit PIN up to 64+ characters).
 */
export async function deriveKeyFromPassphrase(passphrase, saltBase64, iterations = DEFAULT_ITERATIONS) {
  const subtle = getSubtleCrypto();
  const enc = new TextEncoder();
  const passwordKey = await subtle.importKey(
    'raw',
    enc.encode(String(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const saltBytes = base64ToUint8Array(saltBase64);

  const derivedKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: iterations || DEFAULT_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can cache raw bytes in chrome.storage.session
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Exports a CryptoKey to a raw base64 string for session RAM caching.
 */
export async function exportKeyToBase64(cryptoKey) {
  const subtle = getSubtleCrypto();
  const raw = await subtle.exportKey('raw', cryptoKey);
  return uint8ArrayToBase64(new Uint8Array(raw));
}

/**
 * Re-imports a CryptoKey from a raw base64 string.
 */
export async function importKeyFromBase64(base64Key) {
  const subtle = getSubtleCrypto();
  const rawBytes = base64ToUint8Array(base64Key);
  return subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an arbitrary JavaScript object or value using AES-256-GCM.
 * Generates a fresh 12-byte random IV for every operation.
 */
export async function encryptObject(plainObj, cryptoKey) {
  const subtle = getSubtleCrypto();
  const jsonStr = JSON.stringify(plainObj);
  const plainBytes = new TextEncoder().encode(jsonStr);

  const iv = getRandomBytes(12);
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plainBytes
  );

  return {
    iv: uint8ArrayToBase64(iv),
    ciphertext: uint8ArrayToBase64(new Uint8Array(cipherBuffer))
  };
}

/**
 * Decrypts an encrypted envelope ({ iv, ciphertext }) using AES-256-GCM.
 * Verifies authentication tag automatically (AEAD); throws on tampering or wrong key.
 */
export async function decryptObject(envelope, cryptoKey) {
  if (!envelope || !envelope.iv || !envelope.ciphertext) {
    throw new Error('Invalid encrypted payload envelope.');
  }

  const subtle = getSubtleCrypto();
  const iv = base64ToUint8Array(envelope.iv);
  const cipherBytes = base64ToUint8Array(envelope.ciphertext);

  try {
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherBytes
    );
    const jsonStr = new TextDecoder().decode(plainBuffer);
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Decryption failed: Incorrect passphrase/PIN or corrupted data.');
  }
}

/**
 * Creates an authentication verifier envelope for a key.
 * Used to verify a passphrase immediately without parsing full profile trees.
 */
export async function createAuthVerifier(cryptoKey) {
  return encryptObject({ sentinel: AUTH_SENTINEL }, cryptoKey);
}

/**
 * Verifies whether a CryptoKey successfully decrypts the authentication verifier.
 */
export async function verifyAuthKey(cryptoKey, verifierEnvelope) {
  try {
    const res = await decryptObject(verifierEnvelope, cryptoKey);
    return res && res.sentinel === AUTH_SENTINEL;
  } catch (e) {
    return false;
  }
}

/**
 * Encrypts a full backup payload into an encrypted vault envelope.
 */
export async function encryptExportPayload(data, passphrase, iterations = DEFAULT_ITERATIONS) {
  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, salt, iterations);
  const encryptedData = await encryptObject(data, key);
  const verifier = await createAuthVerifier(key);

  return {
    smartformVersion: '1.0.0',
    format: 'smartform-encrypted-vault',
    exportDate: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt
    },
    iv: encryptedData.iv,
    ciphertext: encryptedData.ciphertext,
    authVerifier: verifier
  };
}

/**
 * Decrypts an encrypted export payload.
 */
export async function decryptExportPayload(exportEnvelope, passphrase) {
  if (!isEncryptedExport(exportEnvelope)) {
    throw new Error('Payload is not an encrypted SmartForm vault.');
  }

  const { kdf, iv, ciphertext, authVerifier } = exportEnvelope;
  const key = await deriveKeyFromPassphrase(passphrase, kdf.salt, kdf.iterations || DEFAULT_ITERATIONS);

  if (authVerifier) {
    const valid = await verifyAuthKey(key, authVerifier);
    if (!valid) {
      throw new Error('Incorrect passphrase/PIN for encrypted backup.');
    }
  }

  return decryptObject({ iv, ciphertext }, key);
}

/**
 * Checks if a parsed JSON object is an encrypted vault export.
 */
export function isEncryptedExport(obj) {
  return Boolean(
    obj &&
    typeof obj === 'object' &&
    (obj.format === 'smartform-encrypted-vault' || (obj.kdf && obj.ciphertext && obj.iv))
  );
}

/**
 * Estimates password strength informatively (no rejections).
 */
export function evaluatePassphraseStrength(passphrase) {
  const str = String(passphrase || '');
  if (!str) return { score: 0, label: 'Empty', level: 'empty' };
  if (str.length < 6) {
    return { score: 1, label: '⚡ Fast PIN (Convenient for personal devices)', level: 'pin' };
  }
  if (str.length < 12) {
    return { score: 2, label: '🛡️ Standard Password', level: 'good' };
  }
  return { score: 3, label: '🏰 Strong High-Entropy Passphrase', level: 'strong' };
}
