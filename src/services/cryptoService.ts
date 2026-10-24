/**
 * RestoPass Cryptographic & QR Security Engine
 * Masterplan v1.1 Section 7
 */

// Master system secret used to derive restaurant keys (in production held in secure env)
export const MASTER_KEY =
  (typeof process !== 'undefined' && process.env?.RESTOPASS_MASTER_SECRET) ||
  'RESTOPASS_RWANDA_MASTER_2026_SUPER_ADMIN_EPHREM';

/**
 * Fast synchronous SHA-256 and HMAC implementation for instant UI & QR generation
 */
export function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let compositeAscii = ascii + '\x80';
  while ((compositeAscii.length % 64) - 56) compositeAscii += '\x00';
  for (i = 0; i < compositeAscii.length; i++) {
    j = compositeAscii.charCodeAt(i);
    if (j >> 8) return ''; // ASCII check
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & hash[5]) ^ (~e & hash[6]);
      const temp1 = hash[7] + s1 + ch + k[i] + (w[i] = (i < 16) ? w[i] : (
        w[i - 16] +
        (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
        w[i - 7] +
        (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
      ) | 0);
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = s0 + maj;

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export function hmacSha256(key: string, message: string): string {
  const blockSize = 64;
  let keyFormatted = key;
  if (keyFormatted.length > blockSize) {
    keyFormatted = sha256(keyFormatted);
  }
  while (keyFormatted.length < blockSize) {
    keyFormatted += '\x00';
  }

  let oKeyPad = '';
  let iKeyPad = '';
  for (let i = 0; i < blockSize; i++) {
    oKeyPad += String.fromCharCode(keyFormatted.charCodeAt(i) ^ 0x5c);
    iKeyPad += String.fromCharCode(keyFormatted.charCodeAt(i) ^ 0x36);
  }

  const innerHash = sha256(iKeyPad + message);
  // convert inner hex to raw binary string
  let innerBinary = '';
  for (let i = 0; i < innerHash.length; i += 2) {
    innerBinary += String.fromCharCode(parseInt(innerHash.substr(i, 2), 16));
  }
  return sha256(oKeyPad + innerBinary);
}

/**
 * Key derivation per Masterplan Section 7:
 * restaurantKey = HMAC(MASTER_KEY, restaurantCode)
 * customerKey = HMAC(restaurantKey, memberNo + "|" + keyVersion)
 */
export function deriveRestaurantKey(restaurantCode: string): string {
  return hmacSha256(MASTER_KEY, `RESTAURANT:${restaurantCode.toUpperCase()}`);
}

export function deriveCustomerKey(restaurantKey: string, memberNo: string, keyVersion: number): string {
  return hmacSha256(restaurantKey, `CUSTOMER:${memberNo}|V${keyVersion}`);
}

/**
 * Computes ID hash for duplicate checking without exposing raw ID
 */
export function hashIdNumber(idType: string, idNumber: string): string {
  const normalized = idNumber.replace(/[\s-]/g, '').toUpperCase();
  return sha256(`ID_SALT_RESTOPASS_RWANDA:${idType}:${normalized}`);
}

export function maskIdNumber(idNumber: string): string {
  const clean = idNumber.trim();
  if (clean.length <= 4) return '****';
  const prefix = clean.slice(0, Math.min(6, clean.length - 4));
  return `${prefix}${'*'.repeat(Math.max(4, clean.length - prefix.length))}`;
}

/**
 * Current 30-second time step calculation
 */
export function getCurrentTimeStep(clockOffsetMs = 0): number {
  const effectiveTime = Date.now() + clockOffsetMs;
  return Math.floor(effectiveTime / 30000);
}

/**
 * Seconds remaining in current 30s step
 */
export function getStepSecondsRemaining(clockOffsetMs = 0): number {
  const effectiveTime = Date.now() + clockOffsetMs;
  return 30 - Math.floor((effectiveTime % 30000) / 1000);
}

/**
 * Generates dynamic phone QR payload
 * Payload format: v1.<restaurantCode>.<memberNo>.<step>.<mac>
 * MAC is 8-byte (16 hex chars) truncated HMAC
 */
export function generatePhoneToken(
  restaurantCode: string,
  memberNo: string,
  keyVersion: number,
  clockOffsetMs = 0
): { token: string; step: number; secondsRemaining: number } {
  const restaurantKey = deriveRestaurantKey(restaurantCode);
  const customerKey = deriveCustomerKey(restaurantKey, memberNo, keyVersion);
  const step = getCurrentTimeStep(clockOffsetMs);
  const fullMac = hmacSha256(customerKey, `STEP:${step}`);
  const mac = fullMac.slice(0, 16);
  const token = `v1.${restaurantCode.toUpperCase()}.${memberNo}.${step}.${mac}`;
  return {
    token,
    step,
    secondsRemaining: getStepSecondsRemaining(clockOffsetMs),
  };
}

/**
 * Generates physical card QR payload
 * Payload format: c1.<restaurantCode>.<memberNo>.<cardVersion>.<mac>
 */
export function generateCardToken(
  restaurantCode: string,
  memberNo: string,
  cardVersion: number
): string {
  const restaurantKey = deriveRestaurantKey(restaurantCode);
  // Card MAC uses version-specific tag
  const fullMac = hmacSha256(restaurantKey, `CARD:${memberNo}:V${cardVersion}`);
  const mac = fullMac.slice(0, 16);
  return `c1.${restaurantCode.toUpperCase()}.${memberNo}.${cardVersion}.${mac}`;
}

export interface TokenVerificationResult {
  valid: boolean;
  type: 'phone' | 'card';
  restaurantCode: string;
  memberNo: string;
  version: number;
  step?: number;
  error?: string;
  isCard: boolean;
}

/**
 * In-memory replay guard for (customer, step)
 */
const usedTokenSteps = new Set<string>();

export function markTokenStepUsed(customerKey: string, step: number): void {
  usedTokenSteps.add(`${customerKey}:${step}`);
}

export function isTokenStepUsed(customerKey: string, step: number): boolean {
  return usedTokenSteps.has(`${customerKey}:${step}`);
}

/**
 * Verifies any QR scanned at the stand
 */
export function verifyQrToken(
  payload: string,
  currentRestaurantCode: string,
  customerKeyVersionMap: Record<string, { keyVersion: number; cardVersion: number; cardStatus: string }>
): TokenVerificationResult {
  const cleanPayload = payload.trim();
  const parts = cleanPayload.split('.');

  if (parts.length < 5) {
    return {
      valid: false,
      type: 'phone',
      restaurantCode: '',
      memberNo: '',
      version: 1,
      isCard: false,
      error: 'Invalid QR format',
    };
  }

  const [versionPrefix, tokenRestaurantCode, memberNo, stepOrCardVer, mac] = parts;

  // 1. Restaurant binding check
  if (tokenRestaurantCode.toUpperCase() !== currentRestaurantCode.toUpperCase()) {
    return {
      valid: false,
      type: versionPrefix.startsWith('c') ? 'card' : 'phone',
      restaurantCode: tokenRestaurantCode,
      memberNo,
      version: 1,
      isCard: versionPrefix.startsWith('c'),
      error: `Wrong restaurant: Token belongs to ${tokenRestaurantCode}, not ${currentRestaurantCode}`,
    };
  }

  const customerMeta = customerKeyVersionMap[memberNo];
  if (!customerMeta) {
    return {
      valid: false,
      type: versionPrefix.startsWith('c') ? 'card' : 'phone',
      restaurantCode: tokenRestaurantCode,
      memberNo,
      version: 1,
      isCard: versionPrefix.startsWith('c'),
      error: `Customer #${memberNo} not found in restaurant records`,
    };
  }

  // 2. Physical Card Scan (c1)
  if (versionPrefix === 'c1') {
    const cardVer = parseInt(stepOrCardVer, 10);
    if (isNaN(cardVer)) {
      return {
        valid: false,
        type: 'card',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: cardVer,
        isCard: true,
        error: 'Corrupt card token version',
      };
    }

    if (customerMeta.cardStatus === 'locked') {
      return {
        valid: false,
        type: 'card',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: cardVer,
        isCard: true,
        error: 'Card is locked by customer or manager',
      };
    }

    if (cardVer !== customerMeta.cardVersion) {
      return {
        valid: false,
        type: 'card',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: cardVer,
        isCard: true,
        error: 'Obsolete card: A newer card was reissued for this member',
      };
    }

    const restaurantKey = deriveRestaurantKey(tokenRestaurantCode);
    const expectedMac = hmacSha256(restaurantKey, `CARD:${memberNo}:V${cardVer}`).slice(0, 16);
    if (mac !== expectedMac) {
      return {
        valid: false,
        type: 'card',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: cardVer,
        isCard: true,
        error: 'Cryptographic MAC verification failed (counterfeit card)',
      };
    }

    return {
      valid: true,
      type: 'card',
      restaurantCode: tokenRestaurantCode,
      memberNo,
      version: cardVer,
      isCard: true,
    };
  }

  // 3. Dynamic Phone QR Scan (v1)
  if (versionPrefix === 'v1') {
    const scannedStep = parseInt(stepOrCardVer, 10);
    if (isNaN(scannedStep)) {
      return {
        valid: false,
        type: 'phone',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: customerMeta.keyVersion,
        isCard: false,
        error: 'Corrupt token step',
      };
    }

    const currentStep = getCurrentTimeStep();
    // Tolerance: Allow up to ±10 steps (±5 minutes / 300 seconds)
    // This accommodates clock skew between customer phones, laptops, and offline stand terminals
    const STEP_TOLERANCE = 10;
    const allowedSteps: number[] = [];
    for (let i = -STEP_TOLERANCE; i <= STEP_TOLERANCE; i++) {
      allowedSteps.push(currentStep + i);
    }

    if (!allowedSteps.includes(scannedStep)) {
      const stepDiff = Math.abs(scannedStep - currentStep);
      const minutesDiff = Math.max(1, Math.round((stepDiff * 30) / 60));
      return {
        valid: false,
        type: 'phone',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: customerMeta.keyVersion,
        step: scannedStep,
        isCard: false,
        error: scannedStep < currentStep - STEP_TOLERANCE 
          ? `Expired token (code is ~${minutesDiff} min old. Refresh QR or sync device clocks)` 
          : `Token clock drift (code is ahead by ~${minutesDiff} min. Check device clocks)`,
      };
    }

    const restaurantKey = deriveRestaurantKey(tokenRestaurantCode);
    const customerKey = deriveCustomerKey(restaurantKey, memberNo, customerMeta.keyVersion);

    // Single use replay check
    if (isTokenStepUsed(customerKey, scannedStep)) {
      return {
        valid: false,
        type: 'phone',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: customerMeta.keyVersion,
        step: scannedStep,
        isCard: false,
        error: 'Token already used (screenshot replay detected)',
      };
    }

    const expectedMac = hmacSha256(customerKey, `STEP:${scannedStep}`).slice(0, 16);
    if (mac !== expectedMac) {
      return {
        valid: false,
        type: 'phone',
        restaurantCode: tokenRestaurantCode,
        memberNo,
        version: customerMeta.keyVersion,
        step: scannedStep,
        isCard: false,
        error: 'Signature mismatch (invalid or reissued key)',
      };
    }

    return {
      valid: true,
      type: 'phone',
      restaurantCode: tokenRestaurantCode,
      memberNo,
      version: customerMeta.keyVersion,
      step: scannedStep,
      isCard: false,
    };
  }

  return {
    valid: false,
    type: 'phone',
    restaurantCode: tokenRestaurantCode,
    memberNo,
    version: 1,
    isCard: false,
    error: `Unknown token protocol: ${versionPrefix}`,
  };
}

/**
 * Super Admin Ed25519-style license signer simulation
 */
export function signLicensePayload(payload: object): string {
  const raw = JSON.stringify(payload);
  const signature = hmacSha256(MASTER_KEY, `LICENSE_SIGNATURE:${raw}`);
  return `ed25519_${signature.slice(0, 48)}`;
}

export function generateActivationCode(restaurantCode: string): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RP-${restaurantCode}-${rand}`;
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks on PINs and passwords.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i) ^ 0;
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Asynchronous cryptographic hashing using standard browser Web Crypto API (SubtleCrypto SHA-256).
 * Automatically falls back to synchronous SHA-256 when in restricted non-secure contexts.
 */
export async function hashWithWebCrypto(input: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Non-fatal fallback to sync SHA-256
  }
  return sha256(input);
}

/**
 * Per-entity cryptographic salt derivation helpers
 */
export function getCustomerPinSalt(customerId: string, memberNo: string): string {
  return `RESTOPASS_CUST_PIN_SALT_${customerId}_${memberNo}`;
}

export function getStationUserSalt(userId: string, username: string): string {
  return `RESTOPASS_STATION_USER_SALT_${userId}_${username}`;
}

export function getBossPasswordSalt(restaurantCode: string): string {
  return `RESTOPASS_BOSS_SALT_${restaurantCode.toUpperCase()}`;
}

export function getSuperAdminSalt(): string {
  return 'RESTOPASS_SUPERADMIN_GLOBAL_SALT_2026';
}

/**
 * Securely hashes a 4-digit PIN with a dedicated cryptographic salt using SHA-256
 */
export async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  const saltedPayload = `RESTOPASS_SALTED_PIN_V1:${salt}:${pin.trim()}`;
  return hashWithWebCrypto(saltedPayload);
}

/**
 * Validates an entered PIN against a stored hash with constant-time equality.
 * Supports legacy plain-text fallback for backward compatibility while migrating to salted hashes.
 */
export async function verifyPinSecure(
  enteredPin: string,
  salt: string,
  expectedHashOrPlain: string
): Promise<boolean> {
  if (!enteredPin || !expectedHashOrPlain) return false;
  const cleanEntered = enteredPin.trim();
  const cleanExpected = expectedHashOrPlain.trim();

  // 1. Direct legacy match (e.g. plain "1234" in initial mock state)
  if (timingSafeEqual(cleanEntered, cleanExpected)) {
    return true;
  }

  // 2. Salted SHA-256 hash match
  const computedHash = await hashPinWithSalt(cleanEntered, salt);
  if (timingSafeEqual(computedHash, cleanExpected)) {
    return true;
  }

  // 3. Fallback un-salted SHA-256 match
  const plainHash = sha256(cleanEntered);
  if (timingSafeEqual(plainHash, cleanExpected)) {
    return true;
  }

  return false;
}

/**
 * Securely hashes an administrative password with salt
 */
export async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const saltedPayload = `RESTOPASS_SALTED_PASSWORD_V1:${salt}:${password}`;
  return hashWithWebCrypto(saltedPayload);
}

/**
 * Validates an administrative password against stored hash with constant-time equality
 */
export async function verifyPasswordSecure(
  enteredPassword: string,
  salt: string,
  expectedHashOrPlain: string
): Promise<boolean> {
  if (!enteredPassword || !expectedHashOrPlain) return false;
  const cleanEntered = enteredPassword;
  const cleanExpected = expectedHashOrPlain.trim();

  // 1. Direct match for known default/plain passwords
  if (timingSafeEqual(cleanEntered, cleanExpected)) {
    return true;
  }

  // 2. Salted SHA-256 hash match
  const computedHash = await hashPasswordWithSalt(cleanEntered, salt);
  if (timingSafeEqual(computedHash, cleanExpected)) {
    return true;
  }

  // 3. Fallback un-salted SHA-256
  const plainHash = sha256(cleanEntered);
  if (timingSafeEqual(plainHash, cleanExpected)) {
    return true;
  }

  return false;
}

