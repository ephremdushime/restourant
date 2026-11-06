/**
 * RestoPass Managed Redis Replay Guard Client
 * 
 * Provides distributed, atomic token replay protection across horizontally scaled cloud instances.
 * Uses atomic SETNX with a 30-45s TTL to prevent duplicate scans of rotating QR tokens.
 * Falls back to an in-memory TTL map when REDIS_URL is not configured (offline laptop mode).
 */

import Redis from 'ioredis';
import crypto from 'node:crypto';

let redisInstance: Redis | null = null;
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();
const memoryReplayCache = new Map<string, number>();
const memoryRevokedSessions = new Map<string, number>();


export type RateLimitResult =
  | { allowed: true; remaining: number; retryAfterSeconds: number; available: true }
  | { allowed: false; remaining: 0; retryAfterSeconds: number; available: true }
  | { allowed: false; remaining: 0; retryAfterSeconds: number; available: false };

/** Shared atomic fixed-window rate limits for cloud instances; local memory only in standalone mode. */
export async function consumeRateLimit(
  bucket: string,
  subject: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const safeBucket = bucket.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80);
  const safeSubject = crypto.createHash('sha256').update(subject).digest('hex');
  const safeMax = Math.max(1, Math.floor(maxRequests));
  const safeWindow = Math.max(1000, Math.floor(windowMs));
  const client = getRedisClient();

  if (isRedisConfigured()) {
    if (!client) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(safeWindow / 1000), available: false };
    }
    try {
      if (client.status !== 'ready') await client.ping();
      const result = await client.eval(
        `local count = redis.call('INCR', KEYS[1])
         if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         local ttl = redis.call('PTTL', KEYS[1])
         return { count, ttl }`,
        1,
        `restopass:rate:${safeBucket}:${safeSubject}`,
        String(safeWindow)
      ) as [number, number];
      const count = Number(result?.[0] || 0);
      const ttl = Math.max(1000, Number(result?.[1] || safeWindow));
      const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));
      if (!Number.isFinite(count) || count < 1) throw new Error('Redis returned an invalid rate-limit counter.');
      if (count > safeMax) return { allowed: false, remaining: 0, retryAfterSeconds, available: true };
      return { allowed: true, remaining: Math.max(0, safeMax - count), retryAfterSeconds, available: true };
    } catch (err: any) {
      console.error('[Redis Rate Limiter] Distributed rate limit unavailable:', err?.message || err);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(safeWindow / 1000), available: false };
    }
  }

  const now = Date.now();
  if (memoryRateLimits.size > 5000) {
    for (const [key, value] of memoryRateLimits.entries()) {
      if (now >= value.resetAt) memoryRateLimits.delete(key);
    }
  }
  const memoryKey = `${safeBucket}:${safeSubject}`;
  const existing = memoryRateLimits.get(memoryKey);
  if (!existing && memoryRateLimits.size >= 10000) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 1, available: false };
  }
  const record = !existing || now >= existing.resetAt
    ? { count: 1, resetAt: now + safeWindow }
    : { count: existing.count + 1, resetAt: existing.resetAt };
  memoryRateLimits.set(memoryKey, record);
  const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  if (record.count > safeMax) return { allowed: false, remaining: 0, retryAfterSeconds, available: true };
  return { allowed: true, remaining: Math.max(0, safeMax - record.count), retryAfterSeconds, available: true };
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function checkRedisReady(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    return (await client.ping()) === 'PONG';
  } catch (err: any) {
    console.error('[Redis Replay Guard] Readiness check failed:', err?.message || err);
    return false;
  }
}

export function getRedisClient(): Redis | null {
  if (!isRedisConfigured()) return null;

  if (!redisInstance) {
    try {
      redisInstance = new Redis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 5000,
        retryStrategy(times) {
          if (times > 3) return null; // stop reconnecting if down
          return Math.min(times * 500, 2000);
        },
      });

      redisInstance.on('error', (err) => {
        console.warn('[Redis Replay Guard] Connection warning:', err.message);
      });

      redisInstance.on('connect', () => {
        console.log('[Redis Replay Guard] Connected to distributed Redis node.');
      });

      redisInstance.connect().catch((err) => {
        console.warn('[Redis Replay Guard] Initial connection failed; distributed replay protection remains unavailable:', err.message);
      });
    } catch (err: any) {
      console.warn('[Redis Replay Guard] Failed to initialize Redis client:', err.message);
      redisInstance = null;
    }
  }

  return redisInstance;
}


/**
 * Durable session revocation for cloud deployments. Only a one-way digest of
 * the bearer token is stored; raw session credentials are never written to Redis.
 */
export async function revokeSessionToken(tokenDigest: string, ttlSeconds: number): Promise<boolean> {
  const safeTtl = Math.max(1, Math.min(Math.floor(ttlSeconds), 24 * 60 * 60));
  const client = getRedisClient();
  if (isRedisConfigured()) {
    if (!client) return false;
    try {
      if (client.status !== 'ready') await client.ping();
      return (await client.set(`revoked_session:${tokenDigest}`, '1', 'EX', safeTtl)) === 'OK';
    } catch (err: any) {
      console.error('[Redis Session Revocation] Failed to persist revocation:', err?.message || err);
      return false;
    }
  }
  memoryRevokedSessions.set(tokenDigest, Date.now() + safeTtl * 1000);
  return true;
}

export async function isSessionTokenRevoked(tokenDigest: string): Promise<{ revoked: boolean; available: boolean }> {
  const client = getRedisClient();
  if (isRedisConfigured()) {
    if (!client) return { revoked: false, available: false };
    try {
      if (client.status !== 'ready') await client.ping();
      return { revoked: (await client.exists(`revoked_session:${tokenDigest}`)) === 1, available: true };
    } catch (err: any) {
      console.error('[Redis Session Revocation] Lookup failed:', err?.message || err);
      return { revoked: false, available: false };
    }
  }
  const expiresAt = memoryRevokedSessions.get(tokenDigest) || 0;
  if (expiresAt <= Date.now()) memoryRevokedSessions.delete(tokenDigest);
  return { revoked: expiresAt > Date.now(), available: true };
}

/**
 * Clean up expired keys from in-memory cache
 */
function pruneMemoryCache(now: number) {
  for (const [key, expireAt] of memoryReplayCache.entries()) {
    if (now > expireAt) {
      memoryReplayCache.delete(key);
    }
  }
}

/**
 * Atomically checks and records a scanned token.
 * Returns { allowed: true } if token has not been used, or { allowed: false, reason: 'REPLAY_DETECTED' } if reused.
 */
export async function recordTokenScan(
  tokenKey: string,
  ttlSeconds = 45
): Promise<{ allowed: boolean; reason?: string }> {
  const client = getRedisClient();

  if (client && client.status === 'ready') {
    try {
      const redisKey = `qr_pass:${tokenKey}`;
      // SET key value EX seconds NX (atomic write if Not eXists)
      const res = await client.set(redisKey, '1', 'EX', ttlSeconds, 'NX');
      if (res === 'OK') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'REPLAY_DETECTED',
      };
    } catch (err: any) {
      console.warn('[Redis Replay Guard] Redis query failed; distributed replay protection remains unavailable:', err.message);
    }
  }

  // In-memory fallback is safe only for an explicitly local/single-process deployment.
  // If Redis was configured but is unavailable, failing open would allow replay across
  // application instances. Deny the scan until the shared replay guard recovers.
  if (isRedisConfigured()) {
    return { allowed: false, reason: 'REPLAY_GUARD_UNAVAILABLE' };
  }

  const now = Date.now();
  pruneMemoryCache(now);

  const existingExpire = memoryReplayCache.get(tokenKey);
  if (existingExpire && now < existingExpire) {
    return {
      allowed: false,
      reason: 'REPLAY_DETECTED',
    };
  }

  memoryReplayCache.set(tokenKey, now + ttlSeconds * 1000);
  return { allowed: true };
}

/**
 * Checks if a token is marked as used without consuming it
 */
export async function isTokenUsed(tokenKey: string): Promise<boolean> {
  const client = getRedisClient();
  if (client && client.status === 'ready') {
    try {
      const exists = await client.exists(`qr_pass:${tokenKey}`);
      return exists === 1;
    } catch {
      // Fall through to memory check
    }
  }

  const now = Date.now();
  const exp = memoryReplayCache.get(tokenKey);
  return Boolean(exp && now < exp);
}

/**
 * Resets memory cache (useful for automated testing)
 */
export function resetMemoryCache(): void {
  memoryRateLimits.clear();
  memoryReplayCache.clear();
  memoryRevokedSessions.clear();
}

/**
 * Closes the Redis client connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    try {
      await redisInstance.quit();
    } catch {
      redisInstance.disconnect();
    }
    redisInstance = null;
  }
  memoryRateLimits.clear();
  memoryReplayCache.clear();
}

