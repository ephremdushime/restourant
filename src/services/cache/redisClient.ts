/**
 * RestoPass Managed Redis Replay Guard Client
 * 
 * Provides distributed, atomic token replay protection across horizontally scaled cloud instances.
 * Uses atomic SETNX with a 30-45s TTL to prevent duplicate scans of rotating QR tokens.
 * Falls back to an in-memory TTL map when REDIS_URL is not configured (offline laptop mode).
 */

import Redis from 'ioredis';

let redisInstance: Redis | null = null;
const memoryReplayCache = new Map<string, number>();

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
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
        console.warn('[Redis Replay Guard] Initial connection failed, falling back to in-memory mode:', err.message);
      });
    } catch (err: any) {
      console.warn('[Redis Replay Guard] Failed to initialize Redis client:', err.message);
      redisInstance = null;
    }
  }

  return redisInstance;
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
      console.warn('[Redis Replay Guard] Redis query failed, using memory fallback:', err.message);
    }
  }

  // In-memory fallback
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
  memoryReplayCache.clear();
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
  memoryReplayCache.clear();
}

