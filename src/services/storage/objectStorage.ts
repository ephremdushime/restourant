/**
 * Private patron-photo storage.
 *
 * Objects are never assigned public URLs. S3-compatible buckets must remain
 * private; local fallback is stored under data/private, outside the web root.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let s3ClientInstance: S3Client | null = null;

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export interface UploadResult {
  url: string;
  key: string;
  storageType: 's3' | 'local';
  sizeBytes: number;
}

export interface StoredPhoto {
  buffer: Buffer;
  mimeType: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const EXTENSION_MIMES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function getObjectStorageConfig(): StorageConfig | null {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.SPACES_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || process.env.SPACES_ENDPOINT,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function isObjectStorageConfigured(): boolean {
  return getObjectStorageConfig() !== null;
}

export function getS3Client(): S3Client | null {
  const config = getObjectStorageConfig();
  if (!config) return null;
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: config.forcePathStyle,
    });
  }
  return s3ClientInstance;
}

function privatePhotoDirectory(): string {
  const configured = process.env.RESTOPASS_PRIVATE_UPLOAD_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), 'data', 'private', 'patron-photos'));
}

function normalizeTenantCode(restaurantCode: string): string {
  const normalized = String(restaurantCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,32}$/.test(normalized)) throw new Error('Invalid restaurant scope for photo storage.');
  return normalized;
}

function validatePhotoKey(key: string): { tenantCode: string; filename: string; extension: string } {
  if (typeof key !== 'string' || key.length > 160) throw new Error('Invalid photo key.');
  const match = /^patron-photos\/([A-Z0-9_-]{1,32})\/([a-f0-9-]{36})\.(jpg|png|webp)$/.exec(key);
  if (!match) throw new Error('Invalid photo key.');
  return { tenantCode: match[1], filename: match[2] + '.' + match[3], extension: match[3] };
}

function assertImageSignature(buffer: Buffer, mimeType: string): void {
  const valid =
    (mimeType === 'image/jpeg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (mimeType === 'image/png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mimeType === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) throw new Error('Photo content does not match an allowed JPEG, PNG, or WebP image format.');
}

export async function uploadPatronPhoto(
  buffer: Buffer,
  mimeType: string,
  restaurantCode: string
): Promise<UploadResult> {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error('Only JPEG, PNG, and WebP images are allowed.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    throw new Error('Photo must be between 1 byte and 5MB.');
  }
  assertImageSignature(buffer, mimeType);

  const tenantCode = normalizeTenantCode(restaurantCode);
  const filename = crypto.randomUUID() + '.' + extension;
  const key = `patron-photos/${tenantCode}/${filename}`;
  const config = getObjectStorageConfig();
  const s3 = getS3Client();

  if (config && s3) {
    // Never fall back to local storage after a configured remote-store failure:
    // that would create an untracked split-brain object location.
    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || undefined,
      CacheControl: 'private, no-store',
    }));
    return { url: '', key, storageType: 's3', sizeBytes: buffer.length };
  }

  const directory = path.join(privatePhotoDirectory(), tenantCode);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(privatePhotoDirectory(), 0o700).catch(() => undefined);
  await fs.promises.chmod(directory, 0o700).catch(() => undefined);
  const destination = path.join(directory, filename);
  const handle = await fs.promises.open(destination, 'wx', 0o600);
  try {
    await handle.writeFile(buffer);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { url: '', key, storageType: 'local', sizeBytes: buffer.length };
}

export async function getPrivatePatronPhoto(key: string): Promise<StoredPhoto | null> {
  const parsed = validatePhotoKey(key);
  const config = getObjectStorageConfig();
  const s3 = getS3Client();

  if (config && s3) {
    const response = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    if (!response.Body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    if (buffer.length > 5 * 1024 * 1024) throw new Error('Stored photo exceeds the allowed size.');
    const mimeType = EXTENSION_MIMES[parsed.extension];
    assertImageSignature(buffer, mimeType);
    return { buffer, mimeType };
  }

  const filePath = path.join(privatePhotoDirectory(), parsed.tenantCode, parsed.filename);
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 5 * 1024 * 1024) return null;
    const buffer = await fs.promises.readFile(filePath);
    const mimeType = EXTENSION_MIMES[parsed.extension];
    assertImageSignature(buffer, mimeType);
    return { buffer, mimeType };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function uploadBase64Photo(
  dataUrl: string,
  restaurantCode: string
): Promise<UploadResult> {
  if (typeof dataUrl !== 'string' || dataUrl.length > 7 * 1024 * 1024) {
    throw new Error('Invalid or oversized photo data URL.');
  }
  const matches = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!matches) throw new Error('Invalid photo data URL. Only base64 JPEG, PNG, or WebP is accepted.');
  const mimeType = matches[1];
  const encoded = matches[2];
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('Invalid base64 photo encoding.');
  }
  return uploadPatronPhoto(buffer, mimeType, restaurantCode);
}

export function resetS3Client(): void {
  s3ClientInstance = null;
}
