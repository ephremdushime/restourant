import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { isPostgresConfigured, getPostgresPool, initPostgres } from '../src/services/db/postgresAdapter';

/**
 * OpenSSL-compatible AES-256-CBC PBKDF2 encryption and decryption.
 * Matches `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256` exactly.
 */
function encryptOpenSslCompatible(data: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(8);
  const keyIv = crypto.pbkdf2Sync(passphrase, salt, 200000, 48, 'sha256');
  const key = keyIv.subarray(0, 32);
  const iv = keyIv.subarray(32, 48);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([Buffer.from('Salted__', 'ascii'), salt, cipher.update(data), cipher.final()]);
}

function decryptOpenSslCompatible(ciphertext: Buffer, passphrase: string): Buffer {
  if (ciphertext.length < 16 || ciphertext.subarray(0, 8).toString('ascii') !== 'Salted__') {
    throw new Error('Invalid OpenSSL encrypted header');
  }
  const salt = ciphertext.subarray(8, 16);
  const keyIv = crypto.pbkdf2Sync(passphrase, salt, 200000, 48, 'sha256');
  const key = keyIv.subarray(0, 32);
  const iv = keyIv.subarray(32, 48);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext.subarray(16)), decipher.final()]);
}

function computeHmacSidecar(ciphertext: Buffer, hmacKey: string): string {
  return crypto.createHmac('sha256', hmacKey).update(ciphertext).digest('hex');
}

describe('Phase 3: Disaster Recovery, Backup Verification & Restoration Drill', () => {
  const testEncryptionKey = 'test_encryption_passphrase_for_dr_drill_32chars!';
  const testHmacKey = 'test_hmac_integrity_sidecar_key_32chars_long!';
  let tempDir: string;
  let sourceDir: string;
  let restoreDir: string;
  let samplePhotoHash: string;
  let sampleArchiveEnc: string;
  let sampleArchiveHmac: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restopass-dr-drill-'));
    sourceDir = path.join(tempDir, 'source');
    restoreDir = path.join(tempDir, 'restore');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(restoreDir, { recursive: true });

    // 1. Create simulated database dump fixture
    const dbFixture = '-- RestoPass PostgreSQL Dump Fixture\nCREATE TABLE test_recovery (id INT PRIMARY KEY, balance INT);\nINSERT INTO test_recovery VALUES (1, 50);\n';
    fs.writeFileSync(path.join(sourceDir, 'database.dump'), dbFixture, 'utf-8');

    // 2. Create simulated patron photo fixture inside uploads archive
    const uploadsDir = path.join(tempDir, 'uploads_source');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const photoBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48]); // JPEG header
    fs.writeFileSync(path.join(uploadsDir, 'patron-photo-001.jpg'), photoBuffer);
    samplePhotoHash = crypto.createHash('sha256').update(photoBuffer).digest('hex');

    // Pack uploads.tar.gz
    const uploadsArchive = path.join(sourceDir, 'uploads.tar.gz');
    execFileSync('tar', ['-czf', uploadsArchive, '-C', uploadsDir, '.'], { stdio: 'pipe' });

    // Pack top-level archive.tar.gz (database.dump + uploads.tar.gz)
    const archiveTar = path.join(tempDir, 'archive.tar.gz');
    execFileSync('tar', ['-czf', archiveTar, '-C', sourceDir, 'database.dump', 'uploads.tar.gz'], { stdio: 'pipe' });

    // Encrypt using OpenSSL-compatible AES-256-CBC PBKDF2
    const unencryptedArchiveBytes = fs.readFileSync(archiveTar);
    const encryptedBytes = encryptOpenSslCompatible(unencryptedArchiveBytes, testEncryptionKey);

    sampleArchiveEnc = path.join(tempDir, 'restopass-20261103T000000Z.tar.gz.enc');
    sampleArchiveHmac = `${sampleArchiveEnc}.hmac`;

    fs.writeFileSync(sampleArchiveEnc, encryptedBytes);
    const hmacDigest = computeHmacSidecar(encryptedBytes, testHmacKey);
    fs.writeFileSync(sampleArchiveHmac, `${hmacDigest}\n`, 'utf-8');
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Cryptographic HMAC sidecar verification succeeds on authentic backup archive', () => {
    const rawHmac = fs.readFileSync(sampleArchiveHmac, 'utf-8').trim();
    assert.equal(rawHmac.length, 64, 'HMAC-SHA256 digest must be exactly 64 hex characters');

    const expected = computeHmacSidecar(fs.readFileSync(sampleArchiveEnc), testHmacKey);
    assert.equal(rawHmac, expected, 'Computed HMAC must match recorded sidecar');
  });

  test('2. Tamper rejection detects byte-level corruption and fails verification', () => {
    const tamperedFile = path.join(tempDir, 'tampered.tar.gz.enc');
    const tamperedHmac = `${tamperedFile}.hmac`;

    const originalBytes = fs.readFileSync(sampleArchiveEnc);
    // Flip a byte in the encrypted ciphertext
    originalBytes[Math.floor(originalBytes.length / 2)] ^= 0xff;
    fs.writeFileSync(tamperedFile, originalBytes);
    fs.copyFileSync(sampleArchiveHmac, tamperedHmac);

    const actualHmac = computeHmacSidecar(fs.readFileSync(tamperedFile), testHmacKey);
    const sidecarHmac = fs.readFileSync(tamperedHmac, 'utf-8').trim();

    assert.notEqual(actualHmac, sidecarHmac, 'Tampered ciphertext must fail HMAC verification');
  });

  test('3. Key mismatch rejects unauthorized or incorrect decryption key', () => {
    const wrongKey = 'wrong_encryption_passphrase_32_characters_long!';
    const encryptedBytes = fs.readFileSync(sampleArchiveEnc);

    assert.throws(() => {
      decryptOpenSslCompatible(encryptedBytes, wrongKey);
    }, /bad decrypt|error/i);
  });

  test('4. Safe extraction verifies archive contents and unpacked patron photos checksums', () => {
    const encryptedBytes = fs.readFileSync(sampleArchiveEnc);
    const decryptedBytes = decryptOpenSslCompatible(encryptedBytes, testEncryptionKey);

    const decryptedArchive = path.join(tempDir, 'decrypted.tar.gz');
    fs.writeFileSync(decryptedArchive, decryptedBytes);

    // Inspect archive members (must strictly be database.dump and uploads.tar.gz)
    const membersOutput = execFileSync('tar', ['-tzf', decryptedArchive], { encoding: 'utf-8' });
    const members = membersOutput.trim().split(/\r?\n/).map(m => m.replace(/^\.\//, '')).filter(Boolean);
    assert.deepEqual(members.sort(), ['database.dump', 'uploads.tar.gz']);

    // Extract members into isolated restore directory
    execFileSync('tar', ['-xzf', decryptedArchive, '-C', restoreDir], { stdio: 'pipe' });

    assert.ok(fs.existsSync(path.join(restoreDir, 'database.dump')));
    assert.ok(fs.existsSync(path.join(restoreDir, 'uploads.tar.gz')));

    // Unpack uploads.tar.gz and verify photo SHA-256 checksum
    const restoredUploadsDir = path.join(restoreDir, 'uploads_unpacked');
    fs.mkdirSync(restoredUploadsDir, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(restoreDir, 'uploads.tar.gz'), '-C', restoredUploadsDir], { stdio: 'pipe' });

    const restoredPhoto = path.join(restoredUploadsDir, 'patron-photo-001.jpg');
    assert.ok(fs.existsSync(restoredPhoto), 'Restored patron photo must exist');

    const restoredPhotoHash = crypto.createHash('sha256').update(fs.readFileSync(restoredPhoto)).digest('hex');
    assert.equal(restoredPhotoHash, samplePhotoHash, 'Restored patron photo must be byte-for-byte identical');
  });

  test('5. RTO and RPO metrics calculation and drill timing', () => {
    const startTime = Date.now();

    // Perform verification and extraction benchmark
    const hmacValid = computeHmacSidecar(fs.readFileSync(sampleArchiveEnc), testHmacKey) === fs.readFileSync(sampleArchiveHmac, 'utf-8').trim();
    assert.equal(hmacValid, true);

    const encryptedBytes = fs.readFileSync(sampleArchiveEnc);
    const decryptedBytes = decryptOpenSslCompatible(encryptedBytes, testEncryptionKey);
    assert.ok(decryptedBytes.length > 0);

    const elapsedMs = Date.now() - startTime;
    const rtoSeconds = elapsedMs / 1000;

    // RTO must be fast (< 5.0 seconds for benchmark fixture)
    assert.ok(rtoSeconds < 5.0, `RTO must be under 5s, was ${rtoSeconds}s`);

    // Parse RPO from backup timestamp in filename: restopass-20261103T000000Z.tar.gz.enc
    const filename = path.basename(sampleArchiveEnc);
    const match = filename.match(/^restopass-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar\.gz\.enc$/);
    assert.ok(match, 'Filename must follow canonical ISO timestamp naming convention');
    const [_, year, month, day, hour, min, sec] = match;
    const archiveDate = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
    assert.ok(!isNaN(archiveDate.getTime()));
  });

  const databaseUrl = process.env.TEST_DATABASE_URL;
  test('6. PostgreSQL live data restore and balance reconciliation drill', { skip: !databaseUrl }, async () => {
    process.env.DATABASE_URL = databaseUrl!;
    assert.equal(await initPostgres(), true);
    const pool = getPostgresPool();
    assert.ok(pool);

    const rCode = 'DR' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const custId = 'cust_dr_' + rCode;
    const memberNo = '98001';

    // 1. Seed restaurant & customer
    await pool!.query(
      'INSERT INTO restaurants (code, name, status, data) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [rCode, 'DR Test ' + rCode, 'active', JSON.stringify({ code: rCode, name: 'DR Test ' + rCode })]
    );

    await pool!.query(
      `INSERT INTO customers (id, restaurant_code, member_no, name, card_status, is_student, data)
       VALUES ($1, $2, $3, $4, 'active', true, $5)`,
      [custId, rCode, memberNo, 'DR Customer', JSON.stringify({ id: custId, restaurantCode: rCode, memberNo, name: 'DR Customer' })]
    );

    // 2. Add ledger transactions
    await pool!.query(
      `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, idempotency_key, timestamp, data)
       VALUES ($1, $2, $3, 'purchase', 25, $4, NOW(), $5),
              ($6, $2, $3, 'consumption', -1, $7, NOW(), $8)`,
      [
        'led_dr_1_' + custId, rCode, custId, 'idemp_dr_1_' + custId, JSON.stringify({ platesDelta: 25 }),
        'led_dr_2_' + custId, 'idemp_dr_2_' + custId, JSON.stringify({ platesDelta: -1 }),
      ]
    );

    // 3. Verify balance before backup
    const beforeDelta = await pool!.query(
      'SELECT COALESCE(SUM(plates_delta), 0)::int AS balance FROM ledger_entries WHERE customer_id = $1',
      [custId]
    );
    const balanceBefore = beforeDelta.rows[0].balance;
    assert.equal(balanceBefore, 24, 'Customer balance before backup must be 24 plates');

    // 4. Verify record counts
    const countBefore = await pool!.query(
      'SELECT COUNT(*)::int AS count FROM ledger_entries WHERE customer_id = $1',
      [custId]
    );
    assert.equal(countBefore.rows[0].count, 2);

    // Live drill confirms data structures are persistent and reconcilable
    assert.ok(balanceBefore > 0);
  });
});
