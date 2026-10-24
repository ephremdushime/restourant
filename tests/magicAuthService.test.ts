import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCustomerMagicToken,
  validateCustomerMagicToken,
  markMagicTokenRedeemed,
  isMagicTokenRedeemed,
  generateWhatsAppShareUrl,
} from '../src/services/magicAuthService';
import { Customer } from '../src/types';

describe('Customer Magic-Link Authentication & Token Hardening', () => {
  const mockCustomer: Customer = {
    id: 'cust_jean_paul',
    memberNo: '28491',
    name: 'Jean-Paul Habimana',
    phone: '+250788334112',
    restaurantCode: 'RW01',
    idType: 'national_id',
    idNumberMasked: '119988****',
    idHash: 'hash_123',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    keyVersion: 1,
    cardVersion: 1,
    cardStatus: 'active',
    createdAt: new Date().toISOString(),
    isStudent: true,
    pinHash: 'pin_hash',
    onboardingToken: 'token_123',
    consentSigned: true,
  };

  test('generates valid v2 cryptographic token with HMAC signature', () => {
    const token = generateCustomerMagicToken(mockCustomer);
    assert.ok(token.startsWith('v2.'));
    const parts = token.split('.');
    assert.equal(parts.length, 3);
  });

  test('validates authentic magic link token and returns customer claims', () => {
    const token = generateCustomerMagicToken(mockCustomer);
    const decoded = validateCustomerMagicToken(token);

    assert.ok(decoded);
    assert.equal(decoded.customerId, mockCustomer.id);
    assert.equal(decoded.memberNo, mockCustomer.memberNo);
    assert.equal(decoded.restaurantCode, mockCustomer.restaurantCode);
    assert.ok(decoded.jti);
  });

  test('rejects tampered magic link payload', () => {
    const token = generateCustomerMagicToken(mockCustomer);
    const [prefix, b64Payload, signature] = token.split('.');

    // Tamper with payload by altering customer ID
    const decodedPayload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
    decodedPayload.cid = 'cust_attacker_hijack';
    const tamperedB64 = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
    const tamperedToken = `${prefix}.${tamperedB64}.${signature}`;

    const result = validateCustomerMagicToken(tamperedToken);
    assert.equal(result, null);
  });

  test('rejects tampered signature', () => {
    const token = generateCustomerMagicToken(mockCustomer);
    const [prefix, b64Payload, signature] = token.split('.');
    const forgedSignature = signature.slice(0, -6) + '000000';
    const forgedToken = `${prefix}.${b64Payload}.${forgedSignature}`;

    const result = validateCustomerMagicToken(forgedToken);
    assert.equal(result, null);
  });

  test('rejects expired magic link tokens', () => {
    // Generate token with negative validity (expired 1 second ago)
    const expiredToken = generateCustomerMagicToken(mockCustomer, { expiresInMs: -1000 });
    const result = validateCustomerMagicToken(expiredToken);
    assert.equal(result, null);
  });

  test('enforces single-use redemption and replay protection', () => {
    const token = generateCustomerMagicToken(mockCustomer);

    // First redemption succeeds and marks token redeemed
    const firstUse = validateCustomerMagicToken(token, { markAsRedeemed: true });
    assert.ok(firstUse);
    assert.equal(isMagicTokenRedeemed(firstUse.jti), true);

    // Second redemption is rejected (replay attack prevention)
    const secondUse = validateCustomerMagicToken(token);
    assert.equal(secondUse, null);
  });

  test('generates valid WhatsApp web share URL with 48h validity notice', () => {
    const token = generateCustomerMagicToken(mockCustomer);
    const shareUrl = generateWhatsAppShareUrl(mockCustomer, token, 'Kigali Campus Resto', 'https://restopass.rw');

    assert.ok(shareUrl.startsWith('https://wa.me/250788334112?text='));
    assert.ok(shareUrl.includes('Jean-Paul'));
    assert.ok(shareUrl.includes('%2328491'));
    assert.ok(shareUrl.includes(encodeURIComponent('auth=' + token)));
  });
});
