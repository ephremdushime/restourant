import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { uploadPatronPhoto, getPrivatePatronPhoto, deletePrivatePatronPhoto, resetS3Client } from '../src/services/storage/objectStorage';

describe('Private patron photo storage', () => {
  test('stores photos outside the public web root and retrieves only validated private keys', async () => {
    const previousDir = process.env.RESTOPASS_PRIVATE_UPLOAD_DIR;
    const previousS3 = {
      bucket: process.env.S3_BUCKET,
      access: process.env.S3_ACCESS_KEY_ID,
      secret: process.env.S3_SECRET_ACCESS_KEY,
      awsBucket: process.env.AWS_S3_BUCKET,
      awsAccess: process.env.AWS_ACCESS_KEY_ID,
      awsSecret: process.env.AWS_SECRET_ACCESS_KEY,
      spacesBucket: process.env.SPACES_BUCKET,
    };
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restopass-private-photo-'));
    process.env.RESTOPASS_PRIVATE_UPLOAD_DIR = tempDir;
    for (const key of ['S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','AWS_S3_BUCKET','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','SPACES_BUCKET']) {
      delete process.env[key];
    }
    resetS3Client();
    try {
      const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const uploaded = await uploadPatronPhoto(png, 'image/png', 'rw01');
      assert.equal(uploaded.storageType, 'local');
      assert.equal(uploaded.url, '');
      assert.match(uploaded.key, /^patron-photos\/RW01\/[a-f0-9-]{36}\.png$/);
      assert.equal(fs.existsSync(path.join(process.cwd(), 'public', 'uploads', uploaded.key.split('/').pop()!)), false);

      const retrieved = await getPrivatePatronPhoto(uploaded.key);
      assert.ok(retrieved);
      assert.equal(retrieved.mimeType, 'image/png');
      assert.deepEqual(retrieved.buffer, png);

      // Local objects remain readable if S3 is configured later; storage backend is record-specific.
      process.env.S3_BUCKET = 'new-private-bucket';
      process.env.S3_ACCESS_KEY_ID = 'TEST_KEY_ID';
      process.env.S3_SECRET_ACCESS_KEY = 'TEST_SECRET_KEY';
      resetS3Client();
      const stillLocal = await getPrivatePatronPhoto(uploaded.key, 'local');
      assert.ok(stillLocal);
      assert.deepEqual(stillLocal.buffer, png);
      delete process.env.S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;
      resetS3Client();

      await deletePrivatePatronPhoto(uploaded.key, 'local');
      assert.equal(await getPrivatePatronPhoto(uploaded.key), null);
      await assert.rejects(() => getPrivatePatronPhoto('../public/uploads/photo.png'), /Invalid photo key/);
    } finally {
      resetS3Client();
      if (previousDir === undefined) delete process.env.RESTOPASS_PRIVATE_UPLOAD_DIR;
      else process.env.RESTOPASS_PRIVATE_UPLOAD_DIR = previousDir;
      const restore: Record<string, string | undefined> = {
        S3_BUCKET: previousS3.bucket, S3_ACCESS_KEY_ID: previousS3.access, S3_SECRET_ACCESS_KEY: previousS3.secret,
        AWS_S3_BUCKET: previousS3.awsBucket, AWS_ACCESS_KEY_ID: previousS3.awsAccess, AWS_SECRET_ACCESS_KEY: previousS3.awsSecret,
        SPACES_BUCKET: previousS3.spacesBucket,
      };
      for (const [key, value] of Object.entries(restore)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects MIME spoofing and malformed image data', async () => {
    await assert.rejects(
      () => uploadPatronPhoto(Buffer.from('not an image'), 'image/jpeg', 'RW01'),
      /does not match/
    );
    await assert.rejects(
      () => uploadPatronPhoto(Buffer.from([1,2,3]), 'image/gif', 'RW01'),
      /Only JPEG/
    );
  });
});
