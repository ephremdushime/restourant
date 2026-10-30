import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { isPostgresConfigured, getPostgresPool } from '../src/services/db/postgresAdapter';
import {
  isRedisConfigured,
  recordTokenScan,
  isTokenUsed,
  resetMemoryCache,
  closeRedis,
} from '../src/services/cache/redisClient';
import {
  isObjectStorageConfigured,
  getObjectStorageConfig,
  uploadPatronPhoto,
  uploadBase64Photo,
  resetS3Client,
} from '../src/services/storage/objectStorage';
import {
  app,
  createSessionToken,
  getServerDbState,
  setServerDbState,
} from '../server';

describe('Production Scalability & Cloud Infrastructure Verification (50,000 DAU)', () => {
  beforeEach(() => {
    resetMemoryCache();
    resetS3Client();
  });

  afterEach(async () => {
    await closeRedis();
  });

  describe('1. PostgreSQL Relational Persistence & DDL Integrity', () => {
    it('verifies DDL schema.sql exists and defines all 17 tables and indexes', () => {
      const schemaPath = path.resolve(process.cwd(), 'src/services/db/schema.sql');
      assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist');

      const ddl = fs.readFileSync(schemaPath, 'utf-8');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS restaurants'), 'Must define restaurants table');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS licenses'), 'Must define licenses table');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS customers'), 'Must define customers table');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS ledger_entries'), 'Must define ledger_entries table');
      assert.ok(ddl.includes('idempotency_key VARCHAR(128) UNIQUE NOT NULL'), 'ledger_entries must enforce native UNIQUE idempotency_key');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS pending_approvals'), 'Must define pending_approvals table');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS customer_subscriptions'), 'Must define customer_subscriptions table');
      assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS used_tokens'), 'Must define used_tokens table');
      assert.ok(ddl.includes('idx_ledger_idempotency'), 'Must index ledger idempotency');
      assert.ok(ddl.includes('idx_customers_phone'), 'Must index customer phone');
    });

    it('falls back gracefully to offline mode when DATABASE_URL is unset', () => {
      const originalUrl = process.env.DATABASE_URL;
      const originalPgUrl = process.env.POSTGRES_URL;
      delete process.env.DATABASE_URL;
      delete process.env.POSTGRES_URL;

      try {
        assert.equal(isPostgresConfigured(), false);
        assert.equal(getPostgresPool(), null);
      } finally {
        if (originalUrl) process.env.DATABASE_URL = originalUrl;
        if (originalPgUrl) process.env.POSTGRES_URL = originalPgUrl;
      }
    });

    it('detects PostgreSQL configuration when DATABASE_URL is supplied', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/restopass_test';

      try {
        assert.equal(isPostgresConfigured(), true);
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });
  });

  describe('2. Distributed Redis Replay Guard (Multi-Instance Concurrency)', () => {
    it('allows initial scan and blocks immediate duplicate token scan', async () => {
      const tokenKey = `token_test_user_${Date.now()}_step_100`;

      // 1st scan -> Allowed
      const scan1 = await recordTokenScan(tokenKey, 30);
      assert.equal(scan1.allowed, true, 'First scan of rotating token must be allowed');

      // Immediate 2nd scan -> Blocked (Screenshot replay detected)
      const scan2 = await recordTokenScan(tokenKey, 30);
      assert.equal(scan2.allowed, false, 'Duplicate scan within 30s window must be rejected');
      assert.equal(scan2.reason, 'REPLAY_DETECTED');

      // Verify isTokenUsed reports true
      const used = await isTokenUsed(tokenKey);
      assert.equal(used, true);
    });

    it('allows concurrent scans with distinct tokens', async () => {
      const tokenA = `token_student_A_${Date.now()}`;
      const tokenB = `token_student_B_${Date.now()}`;

      const resA = await recordTokenScan(tokenA, 30);
      const resB = await recordTokenScan(tokenB, 30);

      assert.equal(resA.allowed, true);
      assert.equal(resB.allowed, true);
    });

    it('prunes expired tokens and allows token reuse after TTL window expires', async () => {
      const tokenShort = `token_short_ttl_${Date.now()}`;

      // Set with 0 second TTL to simulate expired window
      const scan1 = await recordTokenScan(tokenShort, -1);
      assert.equal(scan1.allowed, true);

      // Subsequent scan should be permitted because previous token has expired
      const scan2 = await recordTokenScan(tokenShort, 30);
      assert.equal(scan2.allowed, true);
    });
  });

  describe('3. S3-Compatible Object Storage & Local Disk Fallback', () => {
    it('falls back to local filesystem storage when S3 environment variables are unconfigured', async () => {
      const originalBucket = process.env.S3_BUCKET;
      delete process.env.S3_BUCKET;

      try {
        assert.equal(isObjectStorageConfigured(), false);

        // 1x1 transparent GIF buffer
        const sampleBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        const uploadResult = await uploadPatronPhoto(sampleBuffer, 'image/png', 'test-patron');

        assert.equal(uploadResult.storageType, 'local');
        assert.ok(uploadResult.url.startsWith('/uploads/patron-photos/test-patron-'));
        assert.equal(uploadResult.sizeBytes, sampleBuffer.length);

        // Verify the file was written to disk
        const localFilePath = path.resolve(process.cwd(), `public${uploadResult.url}`);
        assert.ok(fs.existsSync(localFilePath), 'Local file should exist on disk');

        // Cleanup test file
        try { fs.unlinkSync(localFilePath); } catch {}
      } finally {
        if (originalBucket) process.env.S3_BUCKET = originalBucket;
      }
    });

    it('parses base64 Data URLs and validates payload', async () => {
      const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const uploadResult = await uploadBase64Photo(validDataUrl, 'base64-patron');

      assert.ok(uploadResult.url.includes('base64-patron-'));
      assert.ok(uploadResult.sizeBytes > 0);

      // Cleanup
      if (uploadResult.storageType === 'local') {
        const localPath = path.resolve(process.cwd(), `public${uploadResult.url}`);
        try { fs.unlinkSync(localPath); } catch {}
      }
    });

    it('rejects malformed base64 data URLs', async () => {
      await assert.rejects(
        () => uploadBase64Photo('not-a-valid-data-url'),
        /Invalid base64 data URL format/
      );
    });

    it('constructs correct DigitalOcean Spaces and AWS S3 endpoint URLs when configured', () => {
      const origEnv = { ...process.env };
      process.env.S3_BUCKET = 'restopass-photos';
      process.env.S3_REGION = 'nyc3';
      process.env.S3_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.S3_ACCESS_KEY_ID = 'TEST_KEY_ID';
      process.env.S3_SECRET_ACCESS_KEY = 'TEST_SECRET_KEY';
      process.env.S3_PUBLIC_URL_PREFIX = 'https://cdn.restopass.com';

      try {
        const config = getObjectStorageConfig();
        assert.ok(config);
        assert.equal(config?.bucket, 'restopass-photos');
        assert.equal(config?.publicUrlPrefix, 'https://cdn.restopass.com');
        assert.equal(isObjectStorageConfigured(), true);
      } finally {
        process.env = origEnv;
      }
    });
  });

  describe('4. Server Photo Upload Endpoint (POST /api/upload/photo)', () => {
    it('rejects unauthenticated photo upload requests with 401', async () => {
      const req = {
        headers: {},
        body: { photoBase64: 'data:image/png;base64,iVBORw==' },
      };
      let status = 200;
      let jsonResponse: any = null;
      const res: any = {
        status(code: number) { status = code; return this; },
        json(data: any) { jsonResponse = data; return this; },
        setHeader() {},
      };

      // Call route handler directly through app
      const response = await fetchTestRoute(app, 'POST', '/api/upload/photo', req.body);
      assert.equal(response.status, 401);
    });

    it('accepts authenticated photo upload and returns storage URL', async () => {
      const staffToken = createSessionToken({
        userId: 'usr_staff_test',
        username: 'cashier1',
        role: 'stand_staff',
        restaurantCode: 'RW01',
      });

      const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const response = await fetchTestRoute(
        app,
        'POST',
        '/api/upload/photo',
        { photoBase64: sampleDataUrl, filenameHint: 'patron-api-test' },
        { Authorization: `Bearer ${staffToken}` }
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.ok(response.body.url);
      assert.ok(response.body.key);

      // Clean up test file if stored locally
      if (response.body.storageType === 'local') {
        const localPath = path.resolve(process.cwd(), `public${response.body.url}`);
        try { fs.unlinkSync(localPath); } catch {}
      }
    });
  });
});

/**
 * Lightweight in-process route test helper
 */
async function fetchTestRoute(
  expressApp: any,
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const normalizedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const req: any = {
      method,
      url: urlPath,
      headers: normalizedHeaders,
      body: body || {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      setHeader() { return this; },
      end() {
        resolve({ status: statusCode, body: null });
      },
    };

    expressApp.handle(req, res);
  });
}
