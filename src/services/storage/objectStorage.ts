/**
 * RestoPass S3-Compatible Object Storage Service
 * 
 * Supports AWS S3, DigitalOcean Spaces, Cloudflare R2, and MinIO for patron photo persistence.
 * Falls back to local directory persistence (public/uploads/patron-photos/) when S3 is unconfigured,
 * guaranteeing offline reception laptop compatibility.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
  publicUrlPrefix?: string;
  forcePathStyle?: boolean;
}

export function getObjectStorageConfig(): StorageConfig | null {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.SPACES_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || process.env.SPACES_ENDPOINT,
    accessKeyId,
    secretAccessKey,
    publicUrlPrefix: process.env.S3_PUBLIC_URL_PREFIX || process.env.CDN_URL,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function isObjectStorageConfigured(): boolean {
  return getObjectStorageConfig() !== null;
}

export function getS3Client(): S3Client | null {
  if (!isObjectStorageConfigured()) return null;

  if (!s3ClientInstance) {
    const config = getObjectStorageConfig()!;
    s3ClientInstance = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  return s3ClientInstance;
}

export interface UploadResult {
  url: string;
  key: string;
  storageType: 's3' | 'local';
  sizeBytes: number;
}

/**
 * Uploads a binary buffer to S3 or local directory
 */
export async function uploadPatronPhoto(
  buffer: Buffer,
  mimeType: string,
  filenameHint = 'patron'
): Promise<UploadResult> {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extMap[mimeType] || 'jpg';
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const filename = `${filenameHint}-${Date.now()}-${randomSuffix}.${ext}`;
  const key = `patron-photos/${filename}`;

  const config = getObjectStorageConfig();
  const s3 = getS3Client();

  if (config && s3) {
    try {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
      });

      await s3.send(command);

      // Determine public CDN or bucket URL
      let url: string;
      if (config.publicUrlPrefix) {
        url = `${config.publicUrlPrefix.replace(/\/$/, '')}/${key}`;
      } else if (config.endpoint) {
        // e.g. DigitalOcean Spaces: https://{bucket}.{region}.digitaloceanspaces.com/{key}
        const endpointUrl = new URL(config.endpoint);
        url = `${endpointUrl.protocol}//${config.bucket}.${endpointUrl.host}/${key}`;
      } else {
        // Standard AWS S3 URL
        url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
      }

      console.log(`[Object Storage] Uploaded patron photo to cloud storage: ${url}`);
      return {
        url,
        key,
        storageType: 's3',
        sizeBytes: buffer.length,
      };
    } catch (err: any) {
      console.warn('[Object Storage] S3 upload failed, falling back to local disk:', err.message);
    }
  }

  // Fallback to local disk (Offline reception laptop mode)
  const localDir = path.resolve(process.cwd(), 'public/uploads/patron-photos');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const localFilePath = path.join(localDir, filename);
  fs.writeFileSync(localFilePath, buffer);

  const localUrl = `/uploads/patron-photos/${filename}`;
  console.log(`[Object Storage] Stored patron photo locally: ${localUrl}`);
  return {
    url: localUrl,
    key,
    storageType: 'local',
    sizeBytes: buffer.length,
  };
}

/**
 * Uploads a base64 Data URL (e.g. data:image/jpeg;base64,...)
 */
export async function uploadBase64Photo(
  dataUrl: string,
  filenameHint = 'patron'
): Promise<UploadResult> {
  const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 data URL format');
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Photo payload exceeds maximum 5MB size limit');
  }

  return uploadPatronPhoto(buffer, mimeType, filenameHint);
}

/**
 * Helper to reset client instance (useful in tests)
 */
export function resetS3Client(): void {
  s3ClientInstance = null;
}

