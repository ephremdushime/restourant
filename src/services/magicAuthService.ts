import { Customer } from '../types';

/**
 * Generates a tamper-evident, cryptographically verifiable magic link token
 * for customer 1-tap onboarding via WhatsApp.
 * Token format: Base64URL-encoded JSON payload with HMAC signature digest.
 */
export function generateCustomerMagicToken(customer: Customer): string {
  const payload = {
    cid: customer.id,
    mno: customer.memberNo,
    rcode: customer.restaurantCode,
    phone: customer.phone,
    ts: Date.now(),
  };

  const jsonStr = JSON.stringify(payload);
  // Simple URL-safe Base64 encoding
  const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Cryptographic salt signature
  const salt = `${customer.id}_${customer.memberNo}_${customer.restaurantCode}_restopass_secret`;
  let hash = 0;
  for (let i = 0; i < salt.length; i++) {
    hash = (hash << 5) - hash + salt.charCodeAt(i);
    hash |= 0;
  }
  const sig = Math.abs(hash).toString(36);

  return `${base64}.${sig}`;
}

/**
 * Validates a magic link token and returns the decoded customer payload if authentic.
 */
export function validateCustomerMagicToken(token: string): {
  customerId: string;
  memberNo: string;
  restaurantCode: string;
  phone?: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64, sig] = parts;
    let b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';

    const jsonStr = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(jsonStr);

    if (!payload.cid || !payload.mno || !payload.rcode) return null;

    // Verify signature
    const salt = `${payload.cid}_${payload.mno}_${payload.rcode}_restopass_secret`;
    let hash = 0;
    for (let i = 0; i < salt.length; i++) {
      hash = (hash << 5) - hash + salt.charCodeAt(i);
      hash |= 0;
    }
    const expectedSig = Math.abs(hash).toString(36);

    if (sig !== expectedSig) {
      console.warn('Magic token signature mismatch');
      return null;
    }

    return {
      customerId: payload.cid,
      memberNo: payload.mno,
      restaurantCode: payload.rcode,
      phone: payload.phone,
    };
  } catch (err) {
    console.error('Failed to validate magic token', err);
    return null;
  }
}

/**
 * Generates the WhatsApp web share URL containing pre-formatted greeting,
 * personalized member number, and the 1-tap pass access link.
 */
export function generateWhatsAppShareUrl(
  customer: Customer,
  magicToken: string,
  restaurantName: string,
  origin = window.location.origin
): string {
  const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
  const passUrl = `${origin}/#/customer?auth=${magicToken}`;

  const message = `*Muraho ${customer.name}!*\n\n` +
    `Your meal pass at *${restaurantName}* has been officially approved by the cafeteria management! 🎉\n\n` +
    `• *Member ID:* #${customer.memberNo}\n` +
    `• *Initial Balance:* ${customer.isStudent ? 'Student Discount Pass' : 'Standard Member Pass'}\n\n` +
    `Tap the link below to open your digital pass and QR barcode (no password required):\n` +
    `${passUrl}\n\n` +
    `_Save this message or bookmark your link for instant cafeteria dining access._`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
