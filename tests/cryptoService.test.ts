import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sha256,
  hmacSha256,
  deriveRestaurantKey,
  deriveCustomerKey,
  timingSafeEqual,
  hashPinWithSalt,
  verifyPinSecure,
  hashPasswordWithSalt,
  verifyPasswordSecure,
  getCustomerPinSalt,
  getStationUserSalt,
  getBossPasswordSalt,
  getSuperAdminSalt,
  generateCardToken,
  generatePhoneToken,
  verifyQrToken,
  markTokenStepUsed,
  isTokenStepUsed,
} from '../src/services/cryptoService';

describe('Cryptographic Engine & Security Controls', () => {
  test('sha256 computes consistent and standard hex digests', () => {
    const hash = sha256('hello world');
    assert.equal(
      hash,
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    );
  });

  test('hmacSha256 generates tamper-evident MACs', () => {
    const mac1 = hmacSha256('secret-key', 'data-payload');
    const mac2 = hmacSha256('secret-key', 'data-payload');
    const macTampered = hmacSha256('secret-key', 'data-payload-tampered');

    assert.equal(mac1, mac2);
    assert.notEqual(mac1, macTampered);
    assert.equal(mac1.length, 64);
  });

  test('deriveRestaurantKey and deriveCustomerKey maintain deterministic hierarchical isolation', () => {
    const restoKey1 = deriveRestaurantKey('RW01');
    const restoKey2 = deriveRestaurantKey('RW02');
    assert.notEqual(restoKey1, restoKey2);

    const custKey1 = deriveCustomerKey(restoKey1, '28491', 1);
    const custKey2 = deriveCustomerKey(restoKey1, '28492', 1);
    const custKeyVersion2 = deriveCustomerKey(restoKey1, '28491', 2);

    assert.notEqual(custKey1, custKey2);
    assert.notEqual(custKey1, custKeyVersion2);
  });

  test('timingSafeEqual prevents timing side-channel attacks', () => {
    assert.equal(timingSafeEqual('correct_secret', 'correct_secret'), true);
    assert.equal(timingSafeEqual('correct_secret', 'wrong_secret'), false);
    assert.equal(timingSafeEqual('short', 'longer_string'), false);
    assert.equal(timingSafeEqual('', ''), true);
  });

  test('PIN salting and constant-time verification', async () => {
    const salt = getCustomerPinSalt('cust_123', '28491');
    const hashed = await hashPinWithSalt('1234', salt);

    assert.notEqual(hashed, '1234');
    assert.equal(await verifyPinSecure('1234', salt, hashed), true);
    assert.equal(await verifyPinSecure('9999', salt, hashed), false);
    assert.equal(await verifyPinSecure('', salt, hashed), false);
  });

  test('Password salting and verification for Boss & Super Admin', async () => {
    const bossSalt = getBossPasswordSalt('RW01');
    const hashedBoss = await hashPasswordWithSalt('BossSecretPassword!2026', bossSalt);
    assert.equal(await verifyPasswordSecure('BossSecretPassword!2026', bossSalt, hashedBoss), true);
    assert.equal(await verifyPasswordSecure('WrongPassword', bossSalt, hashedBoss), false);

    const superSalt = getSuperAdminSalt();
    const hashedSuper = await hashPasswordWithSalt('SuperSecretPassword!2026', superSalt);
    assert.equal(await verifyPasswordSecure('SuperSecretPassword!2026', superSalt, hashedSuper), true);
    assert.equal(await verifyPasswordSecure('admin_guess', superSalt, hashedSuper), false);
  });

  test('QR verification: Dynamic Phone QR and single-use replay protection', () => {
    const { token, step } = generatePhoneToken('RW01', '28491', 1);
    const customerMap = {
      '28491': { keyVersion: 1, cardVersion: 1, cardStatus: 'active' },
    };

    // First scan is valid
    const firstVerify = verifyQrToken(token, 'RW01', customerMap);
    assert.equal(firstVerify.valid, true);
    assert.equal(firstVerify.memberNo, '28491');
    assert.equal(firstVerify.type, 'phone');

    // Reject wrong restaurant code
    const wrongRestoVerify = verifyQrToken(token, 'RW02', customerMap);
    assert.equal(wrongRestoVerify.valid, false);
    assert.match(wrongRestoVerify.error || '', /Wrong restaurant/i);

    // Replay protection: mark step used
    const rKey = deriveRestaurantKey('RW01');
    const cKey = deriveCustomerKey(rKey, '28491', 1);
    markTokenStepUsed(cKey, step);
    assert.equal(isTokenStepUsed(cKey, step), true);

    const replayVerify = verifyQrToken(token, 'RW01', customerMap);
    assert.equal(replayVerify.valid, false);
    assert.match(replayVerify.error || '', /already used|replay/i);
  });

  test('QR verification: Physical Card Token and counterfeit detection', () => {
    const cardToken = generateCardToken('RW01', '28491', 1);
    const customerMap = {
      '28491': { keyVersion: 1, cardVersion: 1, cardStatus: 'active' },
    };

    const validCard = verifyQrToken(cardToken, 'RW01', customerMap);
    assert.equal(validCard.valid, true);
    assert.equal(validCard.type, 'card');
    assert.equal(validCard.isCard, true);

    // Tampered card MAC
    const tamperedCard = cardToken.slice(0, -4) + 'ffff';
    const invalidCard = verifyQrToken(tamperedCard, 'RW01', customerMap);
    assert.equal(invalidCard.valid, false);
    assert.match(invalidCard.error || '', /counterfeit|MAC verification failed/i);
  });
});
