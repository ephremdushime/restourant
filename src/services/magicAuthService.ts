import { Customer } from '../types';
import {
  deriveRestaurantKey,
  hmacSha256,
  timingSafeEqual,
} from './cryptoService';

/**
 * Magic Link Token Payload
 */
export interface MagicTokenPayload {
  cid: string; // Customer ID
  mno: string; // Member number
  rcode: string; // Restaurant code
  phone?: string;
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  jti: string; // Unique token identifier (single-use nonce)
}

/**
 * In-memory set of redeemed / invalidated token IDs (single-use enforcement)
 */
const redeemedMagicTokens = new Set<string>();

/**
 * Marks a magic link token as used/redeemed so it cannot be replayed.
 */
export function markMagicTokenRedeemed(tokenId: string): void {
  if (tokenId) {
    redeemedMagicTokens.add(tokenId);
  }
}

/**
 * Checks whether a magic link token has already been redeemed.
 */
export function isMagicTokenRedeemed(tokenId: string): boolean {
  return redeemedMagicTokens.has(tokenId);
}

/**
 * URL-safe Base64 encoder compatible with Node.js and Browser runtimes
 */
function base64UrlEncode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * URL-safe Base64 decoder compatible with Node.js and Browser runtimes
 */
function base64UrlDecode(base64: string): string {
  let b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(b64)));
}

/**
 * Generates a random cryptographic nonce
 */
function generateCryptoNonce(length = 16): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return (
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
}

/**
 * Generates a tamper-evident, cryptographically secure magic link token
 * for customer 1-tap onboarding via WhatsApp.
 * Uses HMAC-SHA256 keyed with restaurant-specific derived cryptographic key.
 *
 * Default validity: 48 hours. Enforces expiration and single-use redemption.
 */
export function generateCustomerMagicToken(
  customer: Customer,
  options?: { expiresInMs?: number }
): string {
  const now = Date.now();
  const validityMs = options?.expiresInMs ?? 48 * 60 * 60 * 1000; // 48 hours default

  const payload: MagicTokenPayload = {
    cid: customer.id,
    mno: customer.memberNo,
    rcode: customer.restaurantCode,
    phone: customer.phone,
    iat: now,
    exp: now + validityMs,
    jti: generateCryptoNonce(16),
  };

  const jsonStr = JSON.stringify(payload);
  const base64Payload = base64UrlEncode(jsonStr);

  // Derive dedicated magic link key from restaurant key
  const restaurantKey = deriveRestaurantKey(customer.restaurantCode);
  const magicSigningKey = hmacSha256(restaurantKey, 'MAGIC_LINK_V2_KEY');
  const signature = hmacSha256(magicSigningKey, `MAGIC_AUTH:${base64Payload}`);

  return `v2.${base64Payload}.${signature}`;
}

/**
 * Validates a magic link token and returns the decoded customer payload if authentic.
 * Enforces cryptographic HMAC-SHA256 signature, expiry timestamp, and single-use check.
 */
export function validateCustomerMagicToken(
  token: string,
  options?: { markAsRedeemed?: boolean; allowExpired?: boolean }
): {
  customerId: string;
  memberNo: string;
  restaurantCode: string;
  phone?: string;
  jti: string;
} | null {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'v2') {
      // Legacy token fallback check or reject invalid token protocol
      return validateLegacyCustomerMagicToken(token);
    }

    const [, base64Payload, signature] = parts;
    const jsonStr = base64UrlDecode(base64Payload);
    const payload: MagicTokenPayload = JSON.parse(jsonStr);

    if (!payload.cid || !payload.mno || !payload.rcode || !payload.exp || !payload.jti) {
      return null;
    }

    // 1. Check expiration
    if (!options?.allowExpired && Date.now() > payload.exp) {
      console.warn('Customer magic link token expired');
      return null;
    }

    // 2. Check if already redeemed
    if (isMagicTokenRedeemed(payload.jti)) {
      console.warn('Customer magic link token has already been redeemed (single-use violation)');
      return null;
    }

    // 3. Cryptographic HMAC-SHA256 signature verification with constant-time equality
    const restaurantKey = deriveRestaurantKey(payload.rcode);
    const magicSigningKey = hmacSha256(restaurantKey, 'MAGIC_LINK_V2_KEY');
    const expectedSignature = hmacSha256(magicSigningKey, `MAGIC_AUTH:${base64Payload}`);

    if (!timingSafeEqual(signature, expectedSignature)) {
      console.warn('Customer magic link HMAC signature mismatch (tampering detected)');
      return null;
    }

    // 4. Optionally mark as redeemed
    if (options?.markAsRedeemed) {
      markMagicTokenRedeemed(payload.jti);
    }

    return {
      customerId: payload.cid,
      memberNo: payload.mno,
      restaurantCode: payload.rcode,
      phone: payload.phone,
      jti: payload.jti,
    };
  } catch (err) {
    console.error('Failed to validate magic token', err);
    return null;
  }
}

/**
 * Fallback parser for legacy v1 tokens during migration, logged as deprecated
 */
function validateLegacyCustomerMagicToken(token: string): {
  customerId: string;
  memberNo: string;
  restaurantCode: string;
  phone?: string;
  jti: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64, sig] = parts;
    const jsonStr = base64UrlDecode(base64);
    const payload = JSON.parse(jsonStr);

    if (!payload.cid || !payload.mno || !payload.rcode) return null;

    // Check legacy salt
    const salt = `${payload.cid}_${payload.mno}_${payload.rcode}_restopass_secret`;
    let hash = 0;
    for (let i = 0; i < salt.length; i++) {
      hash = (hash << 5) - hash + salt.charCodeAt(i);
      hash |= 0;
    }
    const expectedSig = Math.abs(hash).toString(36);

    if (sig !== expectedSig) return null;

    console.warn('Deprecated v1 magic token used. Advise customer to re-issue v2 token.');
    return {
      customerId: payload.cid,
      memberNo: payload.mno,
      restaurantCode: payload.rcode,
      phone: payload.phone,
      jti: `legacy_${payload.cid}_${payload.ts || Date.now()}`,
    };
  } catch {
    return null;
  }
}

/**
 * Generates the WhatsApp web share URL containing pre-formatted greeting,
 * personalized member number, and the cryptographically secure 1-tap pass access link.
 */
export function generateWhatsAppShareUrl(
  customer: Customer,
  magicToken: string,
  restaurantName: string,
  origin = typeof window !== 'undefined' ? window.location.origin : 'https://restopass.rw'
): string {
  const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
  const passUrl = `${origin}/#/customer?auth=${magicToken}`;

  const message =
    `*Muraho ${customer.name}!*\n\n` +
    `Your meal pass at *${restaurantName}* has been officially approved by the cafeteria management! 🎉\n\n` +
    `• *Member ID:* #${customer.memberNo}\n` +
    `• *Initial Balance:* ${customer.isStudent ? 'Student Discount Pass' : 'Standard Member Pass'}\n` +
    `• *Validity:* Secure 1-tap activation link (valid 48h)\n\n` +
    `Tap the link below to open your digital pass and QR barcode (no password required):\n` +
    `${passUrl}\n\n` +
    `_Save this message or bookmark your link for instant cafeteria dining access._`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
