import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  isPostgresConfigured,
  initPostgres,
  loadStateFromPostgres,
  saveStateToPostgres,
  insertLedgerEntryPostgres,
  getPostgresPool,
} from './src/services/db/postgresAdapter';
import { ensureRedisReady, getRedisClient, isRedisConfigured } from './src/services/cache/redisClient';
import { uploadBase64Photo, downloadPatronPhoto } from './src/services/storage/objectStorage';

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);

// Cryptographic secrets for session signing & data integrity
const DEV_SESSION_SECRET = crypto
  .createHash('sha256')
  .update('RESTOPASS_DEV_EPHEMERAL_SESSION_KEY_V1')
  .digest('hex');
const DEV_MASTER_SECRET = ['RESTOPASS', 'RWANDA', 'MASTER', '2026', 'SUPER', 'ADMIN', 'EPHREM'].join('_');

function isPlaceholderSecret(secret: string): boolean {
  if (!secret) return true;
  const lower = secret.toLowerCase();
  const placeholderKeywords = [
    'change_me',
    'changeme',
    'placeholder',
    'your_',
    'example',
    'generate_a_',
    'secret_here',
    'password_here',
    'default',
  ];
  if (placeholderKeywords.some((kw) => lower.includes(kw))) return true;
  if (/^([a-zA-Z0-9_-])\1+$/.test(secret)) return true;
  return false;
}

function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): {
  sessionSecret: string;
  masterSecret: string;
} {
  const isProd = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET?.trim() || '';
  const masterSecret = (env.RESTOPASS_MASTER_SECRET || env.RESTOPASS_MASTER_KEY || '')?.trim();
  const superAdminPassword = (env.RESTOPASS_SUPERADMIN_PASSWORD || env.SUPERADMIN_PASSWORD || '')?.trim();

  if (isProd) {
    if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === DEV_SESSION_SECRET || isPlaceholderSecret(sessionSecret)) {
      throw new Error(
        '[FATAL SECURITY ERROR] SESSION_SECRET (>= 32 characters, non-placeholder) must be configured in production environment. Server startup aborted.'
      );
    }
    if (!masterSecret || masterSecret.length < 32 || masterSecret === DEV_MASTER_SECRET || isPlaceholderSecret(masterSecret)) {
      throw new Error(
        '[FATAL SECURITY ERROR] RESTOPASS_MASTER_SECRET (>= 32 characters, non-placeholder) must be configured in production environment. Server startup aborted.'
      );
    }
    if (superAdminPassword && (superAdminPassword.length < 16 || isPlaceholderSecret(superAdminPassword))) {
      throw new Error(
        '[FATAL SECURITY ERROR] RESTOPASS_SUPERADMIN_PASSWORD (>= 16 characters, non-placeholder) must be configured securely in production environment.'
      );
    }
    return { sessionSecret, masterSecret };
  }

  return {
    sessionSecret: sessionSecret || DEV_SESSION_SECRET,
    masterSecret: masterSecret || DEV_MASTER_SECRET,
  };
}

const resolvedSecrets = validateProductionSecrets(process.env);
const SESSION_SECRET = resolvedSecrets.sessionSecret;
const MASTER_KEY = resolvedSecrets.masterSecret;

// Server-side persistent storage with atomic file writing & backups
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_BACKUP_FILE = path.join(DATA_DIR, 'db.backup.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Clean up any leftover atomic write temporary files in data/
try {
  const files = fs.readdirSync(DATA_DIR);
  for (const f of files) {
    if (f.startsWith('db.tmp.')) {
      try {
        fs.unlinkSync(path.join(DATA_DIR, f));
      } catch {}
    }
  }
} catch {}

let serverDbState: any = null;

function isValidAppState(obj: any): boolean {
  return Boolean(obj && typeof obj === 'object' && Array.isArray(obj.restaurants) && obj.restaurants.length > 0 && Array.isArray(obj.customers));
}

if (fs.existsSync(DB_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (isValidAppState(parsed)) {
      serverDbState = parsed;
      console.log('[Server Authority] Loaded persistent state from db.json');
    }
  } catch (e) {
    console.error('[Server Authority] Error reading db.json, attempting backup restoration:', e);
    if (fs.existsSync(DB_BACKUP_FILE)) {
      try {
        const parsedBackup = JSON.parse(fs.readFileSync(DB_BACKUP_FILE, 'utf-8'));
        if (isValidAppState(parsedBackup)) {
          serverDbState = parsedBackup;
          console.log('[Server Authority] Successfully restored state from backup');
        }
      } catch (backupErr) {
        console.error('[Server Authority] Backup restoration failed:', backupErr);
      }
    }
  }
}

// Strip mock demo seed items from production server database
const SEED_EXPENSE_IDS = new Set(['exp_rw01_1', 'exp_rw01_2']);
const SEED_NOTIFICATION_IDS = new Set(['notif_init_1', 'notif_init_2', 'notif_init_3', 'notif_init_4', 'notif_init_5', 'notif_init_rw02_1']);
const SEED_BRANCH_IDS = new Set(['br_rw01_main', 'br_rw01_east', 'br_rw01_huye', 'br_rw02_main', 'br_rw02_heights']);
const SEED_USER_IDS = new Set(['usr_rw01_1', 'usr_rw01_2', 'usr_rw01_3', 'usr_rw02_1']);

/**
 * Ensures student monetization defaults exist in state per specification
 */
function ensureServerDbDefaults(state: any) {
  if (!state) return;
  if (!state.licenses) state.licenses = [];
  if (!state.restaurants) state.restaurants = [];
  if (!state.customers) state.customers = [];
  if (!state.ledgerEntries) state.ledgerEntries = [];
  if (!state.payments) state.payments = [];
  if (!state.scanEvents) state.scanEvents = [];
  if (!state.scanPoints) state.scanPoints = [];
  if (!state.notifications) state.notifications = [];
  if (!state.branches) state.branches = [];
  if (!state.stationUsers) state.stationUsers = [];
  if (!state.expenses) state.expenses = [];
  if (!state.balanceCheckpoints) state.balanceCheckpoints = [];
  if (!state.pendingApprovals) state.pendingApprovals = [];
  if (!state.studentSubscriptionSettings) {
    state.studentSubscriptionSettings = {
      enabled: false, // strictly disabled at launch per spec
      priceRwf: 500, // exact 500 RWF per month
      currency: 'RWF',
      period: 'monthly',
      graceDays: 3, // 3 calendar days (72 hours)
      requireForTransfers: true,
      requireForDashboard: true,
      updatedAt: new Date().toISOString(),
    };
  }
  if (!state.customerSubscriptions) state.customerSubscriptions = [];
  if (!state.studentSubscriptionPayments) state.studentSubscriptionPayments = [];
  if (!state.activationRequests) state.activationRequests = [];
  if (!state.pinRecoveryRequests) state.pinRecoveryRequests = [];

  if (Array.isArray(state.expenses)) {
    state.expenses = state.expenses.filter((e: any) => !SEED_EXPENSE_IDS.has(e.id) && e.restaurantCode !== 'RW02');
  }
  if (Array.isArray(state.notifications)) {
    state.notifications = state.notifications.filter((n: any) => !SEED_NOTIFICATION_IDS.has(n.id) && n.restaurantCode !== 'RW02');
  }
  if (Array.isArray(state.branches)) {
    state.branches = state.branches.filter((b: any) => !SEED_BRANCH_IDS.has(b.id) && b.restaurantCode !== 'RW02');
  }
  if (Array.isArray(state.stationUsers)) {
    state.stationUsers = state.stationUsers.filter((u: any) => !SEED_USER_IDS.has(u.id) && u.restaurantCode !== 'RW02');
  }
}
ensureServerDbDefaults(serverDbState);

/**
 * Persists application state atomically to prevent data corruption.
 * Writes to a temporary file first, then atomically renames to target file.
 */
function atomicSaveDb(state: any): boolean {
  try {
    const serialized = JSON.stringify(state, null, 2);
    const tempFile = path.join(
      DATA_DIR,
      `db.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`
    );

    // 1. Write to temp file
    fs.writeFileSync(tempFile, serialized, 'utf-8');

    // 2. Create rolling backup if primary exists
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, DB_BACKUP_FILE);
      } catch {}
    }

    // 3. Atomic rename with Windows fallback and retry
    let saved = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempFile, DB_FILE);
        saved = true;
        break;
      } catch {
        try {
          fs.copyFileSync(tempFile, DB_FILE);
          try { fs.unlinkSync(tempFile); } catch {}
          saved = true;
          break;
        } catch {
          const end = Date.now() + 15;
          while (Date.now() < end) {}
        }
      }
    }
    if (!saved) {
      try { fs.writeFileSync(DB_FILE, serialized, 'utf-8'); } catch {}
      try { fs.unlinkSync(tempFile); } catch {}
    }
    return true;
  } catch (err) {
    console.error('[Server Authority] Critical Error persisting database:', err);
    return false;
  }
}

if (serverDbState && process.env.NODE_ENV !== 'production') atomicSaveDb(serverDbState);

/**
 * Serialized write queue mutex to prevent concurrent write collisions (Finding 5)
 * Dual persistence engine: saves to PostgreSQL when configured, and atomic JSON file on local disk
 */
let dbWriteQueue: Promise<boolean> = Promise.resolve(true);
function queueDbSave(state: any): Promise<boolean> {
  return new Promise((resolve) => {
    dbWriteQueue = dbWriteQueue.then(async () => {
      try {
        let pgOk = true;
        if (isPostgresConfigured()) {
          pgOk = await saveStateToPostgres(state);
        }
        const fileOk = isPostgresConfigured() ? true : atomicSaveDb(state);
        const ok = isPostgresConfigured() ? pgOk : fileOk;
        resolve(ok);
        return ok;
      } catch (err) {
        console.error('[Server DB Save Error]', err);
        resolve(false);
        return false;
      }
    });
  });
}

/**
 * Server-authoritative HMAC and key derivation helpers
 */
function serverHmac(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function deriveServerRestaurantKey(restaurantCode: string): string {
  return serverHmac(MASTER_KEY, `RESTAURANT:${restaurantCode.toUpperCase()}`);
}

function deriveServerCustomerKey(restaurantKey: string, memberNo: string, keyVersion: number): string {
  return serverHmac(restaurantKey, `CUSTOMER:${memberNo}|V${keyVersion}`);
}

function getCurrentServerTimeStep(clockOffsetMs = 0): number {
  const effectiveTime = Date.now() + clockOffsetMs;
  return Math.floor(effectiveTime / 30000);
}

// ----------------------------------------------------
// Security Headers Middleware (Finding 7)
// ----------------------------------------------------
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none';"
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ----------------------------------------------------
// In-Memory Rate Limiting (Finding 7)
// ----------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();

function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  let store = rateLimitStores.get(bucketName);
  if (!store) {
    store = new Map<string, RateLimitRecord>();
    rateLimitStores.set(bucketName, store);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    if (store!.size > 10000) {
      for (const [key, value] of store!.entries()) if (now > value.resetTime) store!.delete(key);
      while (store!.size > 10000) {
        const oldestKey = store!.keys().next().value;
        if (oldestKey === undefined) break;
        store!.delete(oldestKey);
      }
    }
    let record = store!.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      store!.set(ip, record);
    } else {
      record.count++;
    }

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000).toString());
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please slow down and try again later.',
      });
    }

    next();
  };
}

// Shared rate limits are mandatory in production; local fallback is development/test only.
const authRateLimiter = createDistributedRateLimiter('auth', 20, 60 * 1000);
const apiRateLimiter = createDistributedRateLimiter('api', 120, 60 * 1000);
const syncRateLimiter = createDistributedRateLimiter('sync', 40, 60 * 1000);

function createDistributedRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  const developmentFallback = createRateLimiter(`${bucketName}_fallback`, maxRequests, windowMs);
  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedisClient();
    if (!redis || redis.status !== 'ready') {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ success: false, error: 'Shared scan protection is temporarily unavailable. No scan was processed.' });
      }
      return developmentFallback(req, res, next);
    }
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const windowId = Math.floor(Date.now() / windowMs);
      const ipKey = crypto.createHash('sha256').update(ip).digest('hex');
      const key = `restopass:rate:${bucketName}:${ipKey}:${windowId}`;
      const count = Number(await redis.eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return n",
        1,
        key,
        String(windowMs)
      ));
      if (count > maxRequests) {
        const retryAfter = Math.ceil((windowMs - (Date.now() % windowMs)) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ success: false, error: 'Scanner request limit reached. Please retry shortly.' });
      }
      next();
    } catch (error) {
      console.error('[Distributed Rate Limit] Redis operation failed:', error);
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ success: false, error: 'Shared scan protection is temporarily unavailable. No scan was processed.' });
      }
      return developmentFallback(req, res, next);
    }
  };
}

// 1,200 scans/minute per public IP (20/sec) for multi-station campus networks.
const scanRateLimiter = createDistributedRateLimiter('scan', 1200, 60 * 1000);

// Request body parser with scoped limits (supports patron portrait uploads)
app.use(express.json({ limit: '10mb' }));
if (process.env.NODE_ENV !== 'production') app.use('/uploads', express.static(path.resolve(process.cwd(), 'public/uploads')));

// ----------------------------------------------------
// Cryptographic Session Engine & Token Verification (Finding 1 & 4)
// ----------------------------------------------------
export interface UserSession {
  userId: string;
  username: string;
  role: 'stand_staff' | 'restaurant_admin' | 'customer' | 'super_admin';
  restaurantCode: string;
  stationId?: string;
  sessionVersion?: number;
  iat: number;
  exp: number;
}

const revokedTokens = new Set<string>();

/**
 * Constant-time string equality check to prevent timing side channels
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Signs a session token with HMAC-SHA256
 */
function createSessionToken(session: Omit<UserSession, 'iat' | 'exp'>, expiresInMs = 24 * 3600 * 1000): string {
  const iat = Date.now();
  const exp = iat + expiresInMs;
  const payload: UserSession = { ...session, iat, exp };
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`RP_SESS:${b64Payload}`)
    .digest('hex');
  return `rp_sess_${b64Payload}.${signature}`;
}

/**
 * Verifies and decodes a session token
 */
function verifySessionToken(token: string, checkRevocation = false): UserSession | null {
  try {
    if (!token || !token.startsWith('rp_sess_')) return null;
    if (checkRevocation && revokedTokens.has(token)) return null;

    const parts = token.slice('rp_sess_'.length).split('.');
    if (parts.length !== 2) return null;

    const [b64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`RP_SESS:${b64Payload}`)
      .digest('hex');

    if (!timingSafeCompare(signature, expectedSig)) {
      return null;
    }

    const payload: UserSession = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
    const allowedRoles = new Set(['stand_staff', 'restaurant_admin', 'customer', 'super_admin']);
    if (!payload || typeof payload.userId !== 'string' || !payload.userId || typeof payload.username !== 'string' || !allowedRoles.has(payload.role) || typeof payload.restaurantCode !== 'string' || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat || payload.exp - payload.iat > 24 * 60 * 60 * 1000 || Date.now() >= payload.exp || payload.iat > Date.now() + 60000) return null;
    return payload;
  } catch {
    return null;
  }
}

// Extends Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

/**
 * Middleware: Enforces valid session token and optional role verification
 */
function sessionRevocationKey(token: string): string {
  return `restopass:session:revoked:${crypto.createHash('sha256').update(token).digest('hex')}`;
}

async function revokeSessionToken(token: string): Promise<boolean> {
  const session = verifySessionToken(token);
  if (!session) return true;
  revokedTokens.add(token);
  if (process.env.NODE_ENV === 'production') {
    const redis = getRedisClient();
    if (!redis || redis.status !== 'ready') return false;
    try {
      const ttlSeconds = Math.max(1, Math.ceil((session.exp - Date.now()) / 1000));
      await redis.set(sessionRevocationKey(token), '1', 'EX', ttlSeconds);
      return true;
    } catch (error) {
      console.error('[Session Revocation] Redis write failed:', error);
      return false;
    }
  }
  return true;
}

function requireAuth(allowedRoles?: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || (req.headers['x-restopass-token'] as string);
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7).trim();
    else if (authHeader) token = authHeader.trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in to access this resource.',
      });
    }

    if (process.env.NODE_ENV === 'production') {
      const redis = getRedisClient();
      if (!redis || redis.status !== 'ready') {
        return res.status(503).json({ success: false, error: 'Session security is temporarily unavailable.' });
      }
      try {
        if (await redis.exists(sessionRevocationKey(token))) {
          return res.status(401).json({ success: false, error: 'Session has been revoked. Please sign in again.' });
        }
      } catch (error) {
        console.error('[Session Validation] Redis lookup failed:', error);
        return res.status(503).json({ success: false, error: 'Session security is temporarily unavailable.' });
      }
    } else if (revokedTokens.has(token)) {
      return res.status(401).json({ success: false, error: 'Session has been revoked. Please sign in again.' });
    }

    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session. Please sign in again.',
      });
    }

    if (process.env.NODE_ENV === 'production' && session.role === 'restaurant_admin') {
      const pool = getPostgresPool();
      if (!pool) return res.status(503).json({ success: false, error: 'Administrator identity service is unavailable.' });
      try {
        const admin = await pool.query(
          "SELECT status, session_version FROM restaurant_admins WHERE id=$1 AND restaurant_code=$2 LIMIT 1",
          [session.userId, session.restaurantCode]
        );
        if (admin.rows[0]?.status !== 'active' ||
            Number(admin.rows[0]?.session_version || 1) !== Number(session.sessionVersion || 1)) {
          return res.status(401).json({ success: false, error: 'Administrator account is inactive or no longer exists.' });
        }
      } catch (error) {
        console.error('[Administrator Session Validation] Database lookup failed:', error);
        return res.status(503).json({ success: false, error: 'Administrator identity service is unavailable.' });
      }
    }

    if (session.role === 'stand_staff') {
      const staff = (serverDbState?.stationUsers || []).find((item: any) =>
        item.id === session.userId && item.restaurantCode === session.restaurantCode &&
        item.status === 'active' && item.stationId === session.stationId
      );
      const station = (serverDbState?.scanPoints || []).find((item: any) =>
        item.id === session.stationId && item.restaurantCode === session.restaurantCode &&
        item.status === 'active' && item.isPaired
      );
      if (!staff || !station ||
          Number(staff.sessionVersion || 1) !== Number(session.sessionVersion || 1)) {
        return res.status(401).json({ success: false, error: 'Staff account, credentials or assigned station changed. Sign in again.' });
      }
    }

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: User role '${session.role}' is not authorized for this action.`,
      });
    }

    req.user = session;
    next();
  };
}

// ----------------------------------------------------
// Public Endpoints
// ----------------------------------------------------

// API Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: new Date().toISOString(),
    hasState: !!serverDbState,
  });
});

// Readiness is separate from liveness: production traffic is ready only when
// both authoritative PostgreSQL and shared Redis security are reachable.
app.get('/api/health/ready', async (_req, res) => {
  const production = process.env.NODE_ENV === 'production';
  const checks: Record<string, string> = { database: 'not_configured', redis: 'not_configured' };

  if (isPostgresConfigured()) {
    try {
      const pool = getPostgresPool();
      if (!pool) throw new Error('PostgreSQL pool unavailable');
      await pool.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'unavailable';
    }
  }

  if (isRedisConfigured()) {
    try {
      const redis = getRedisClient();
      if (!redis || redis.status !== 'ready' || await redis.ping() !== 'PONG') {
        throw new Error('Redis unavailable');
      }
      checks.redis = 'ok';
    } catch {
      checks.redis = 'unavailable';
    }
  }

  const ready = !production || (checks.database === 'ok' && checks.redis === 'ok');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: new Date().toISOString(),
  });
});

// Safe public restaurants endpoint for initial portal dropdown (No sensitive customer/financial data)
app.get('/api/public/restaurants', apiRateLimiter, (_req, res) => {
  const restaurants = serverDbState?.restaurants || [];
  const safeList = restaurants.map((r: any) => ({
    code: r.code,
    name: r.name,
    address: r.address,
    city: r.city,
    status: r.status,
  }));
  res.json({ success: true, restaurants: safeList });
});

// ----------------------------------------------------
// Authentication Routes (Finding 4)
// ----------------------------------------------------

// POST /api/auth/login
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { role, username, password, pin, restaurantCode, stationId } = req.body;

  if (!role) {
    return res.status(400).json({ success: false, error: 'Role is required' });
  }

  // 1. Super Admin Authentication
  if (role === 'super_admin') {
    const configuredSuperAdminPassword = process.env.RESTOPASS_SUPERADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD;
    const validPassword = Boolean(configuredSuperAdminPassword && configuredSuperAdminPassword.length >= 16 && typeof password === 'string' && timingSafeCompare(password, configuredSuperAdminPassword));

    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid Super Admin credentials' });
    }
    const safeSuperUsername = (username || 'superadmin@example.local').trim();
    const token = createSessionToken({
      userId: 'super_admin_principal',
      username: safeSuperUsername,
      role: 'super_admin',
      restaurantCode: 'ALL',
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'super_admin',
        username: safeSuperUsername,
        restaurantCode: 'ALL',
        userLabel: 'Global Super Admin',
      },
    });
  }

  // 2. Tenant-scoped restaurant administrator authentication.
  if (role === 'restaurant_admin') {
    if (!restaurantCode || typeof username !== 'string' || !username.trim() || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Restaurant code, username and password are required.' });
    }
    const pool = getPostgresPool();
    if (!pool) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ success: false, error: 'Tenant administrator authentication requires PostgreSQL.' });
      }
      const legacyPassword = process.env.RESTOPASS_BOSS_PASSWORD || process.env.BOSS_PASSWORD || '';
      if (!legacyPassword || legacyPassword.length < 16 || !timingSafeCompare(password, legacyPassword)) {
        return res.status(401).json({ success: false, error: 'Invalid Restaurant Administrator credentials.' });
      }
      const legacyToken = createSessionToken({
        userId: `dev_admin_${restaurantCode}`, username: username.trim(),
        role: 'restaurant_admin', restaurantCode,
      });
      return res.json({ success: true, token: legacyToken, user: { role: 'restaurant_admin', username: username.trim(), restaurantCode } });
    }
    let adminResult: any;
    try {
      adminResult = await pool.query(
        `SELECT id, username, display_name, password_hash, status, session_version
         FROM restaurant_admins WHERE restaurant_code=$1 AND username=$2 LIMIT 1`,
        [restaurantCode, username.trim().toLowerCase()]
      );
    } catch (error) {
      console.error('[Tenant Admin Login] Database lookup failed:', error);
      return res.status(503).json({ success: false, error: 'Administrator identity service is temporarily unavailable.' });
    }
    const admin = adminResult.rows[0];
    let validPassword = false;
    if (admin?.status === 'active' && typeof admin.password_hash === 'string' && admin.password_hash.startsWith('scrypt$')) {
      try {
        const parts = admin.password_hash.split('$');
        if (parts.length === 6 && parts[1] === '16384' && parts[2] === '8' && parts[3] === '1') {
          const salt = Buffer.from(parts[4], 'base64url');
          const expected = Buffer.from(parts[5], 'base64url');
          if (salt.length === 16 && expected.length === 32) {
            const actual = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
            validPassword = crypto.timingSafeEqual(actual, expected);
          }
        }
      } catch { validPassword = false; }
    }
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid Restaurant Administrator credentials.' });
    }
    const currentResto = (serverDbState?.restaurants || []).find((r: any) => r.code === restaurantCode);
    if (!currentResto || currentResto.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Restaurant account is inactive.' });
    }
    const token = createSessionToken({
      userId: admin.id, username: admin.username,
      role: 'restaurant_admin', restaurantCode,
      sessionVersion: Number(admin.session_version || 1),
    });
    return res.json({
      success: true, token,
      user: {
        role: 'restaurant_admin', username: admin.username,
        restaurantCode, userLabel: admin.display_name || `${currentResto.name || restaurantCode} Administrator`,
      },
    });
  }

  // Individually provisioned POS staff authentication.
  if (role === 'stand_staff') {
    if (!restaurantCode || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Restaurant code and staff username are required.' });
    }
    const entered = typeof (pin || password) === 'string' ? String(pin || password).trim() : '';
    const safeStaffUsername = username.trim().toLowerCase();
    const staff = (serverDbState?.stationUsers || []).find((candidate: any) =>
      candidate.restaurantCode === restaurantCode &&
      String(candidate.username || '').trim().toLowerCase() === safeStaffUsername &&
      candidate.status === 'active'
    );
    const verifyStaffSecret = (secret: string, stored: unknown): boolean => {
      if (!secret || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
      try {
        const parts = stored.split('$');
        if (parts.length !== 6 || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return false;
        const salt = Buffer.from(parts[4], 'base64url');
        const expected = Buffer.from(parts[5], 'base64url');
        if (salt.length !== 16 || expected.length !== 32) return false;
        const actual = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        return crypto.timingSafeEqual(actual, expected);
      } catch { return false; }
    };
    if (!staff || (!verifyStaffSecret(entered, staff.passwordHash) && !verifyStaffSecret(entered, staff.pin))) {
      return res.status(401).json({ success: false, error: 'Invalid staff username or password/PIN.' });
    }
    const assignedStation = (serverDbState?.scanPoints || []).find((point: any) =>
      point.id === staff.stationId && point.restaurantCode === restaurantCode &&
      point.status === 'active' && point.isPaired
    );
    if (!staff.stationId || !assignedStation || (stationId && stationId !== staff.stationId)) {
      return res.status(403).json({ success: false, error: 'This staff account has no active paired station assignment.' });
    }
    const token = createSessionToken({
      userId: staff.id,
      username: staff.username,
      role: 'stand_staff',
      restaurantCode,
      stationId: staff.stationId,
      sessionVersion: Number(staff.sessionVersion || 1),
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'stand_staff',
        username: staff.username,
        restaurantCode,
        stationId: staff.stationId,
        userLabel: `Staff: ${staff.name || staff.username}`,
      },
    });
  }

  // 4. Customer Meal Pass Authentication
  if (role === 'customer') {
    const customers = serverDbState?.customers || [];
    const cust = customers.find(
      (c: any) =>
        c.memberNo === username ||
        c.phone === username ||
        c.id === username
    );

    if (!cust) {
      return res.status(404).json({ success: false, error: 'Customer record not found' });
    }

    const validPin = verifyServerCustomerPin(pin || '', cust);
    if (!validPin) {
      return res.status(401).json({ success: false, error: 'Invalid Member No or PIN' });
    }

    if (!cust.pinHash.startsWith('scrypt$')) {
      cust.pinHash = computeServerCustomerPinHash(pin || '');
      void queueDbSave(serverDbState);
    }

    const targetCust = cust;

    const token = createSessionToken({
      userId: targetCust.id,
      username: targetCust.memberNo,
      role: 'customer',
      restaurantCode: targetCust.restaurantCode,
    });

    return res.json({
      success: true,
      token,
      user: {
        role: 'customer',
        username: targetCust.memberNo,
        restaurantCode: targetCust.restaurantCode,
        userLabel: `${targetCust.name} (#${targetCust.memberNo})`,
        customerId: targetCust.id,
      },
    });
  }

  return res.status(400).json({ success: false, error: 'Unsupported role' });
});

// Super-admin-only tenant administrator provisioning and lifecycle management.
app.get('/api/admin/restaurant-admins', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  const restaurantCode = typeof req.query.restaurantCode === 'string' ? req.query.restaurantCode : '';
  if (!restaurantCode) return res.status(400).json({ success: false, error: 'restaurantCode is required.' });
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({ success: false, error: 'PostgreSQL is required for administrator management.' });
  try {
    const result = await pool.query(
      'SELECT id, restaurant_code, username, display_name, status, created_at FROM restaurant_admins WHERE restaurant_code=$1 ORDER BY created_at ASC',
      [restaurantCode]
    );
    return res.json({ success: true, administrators: result.rows });
  } catch (error) {
    console.error('[Restaurant Admin List] Failed:', error);
    return res.status(503).json({ success: false, error: 'Could not retrieve tenant administrators.' });
  }
});

app.post('/api/admin/restaurant-admins', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  const restaurantCode = typeof req.body?.restaurantCode === 'string' ? req.body.restaurantCode.trim() : '';
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[A-Z0-9_-]{2,32}$/.test(restaurantCode) ||
      !/^[a-zA-Z0-9._-]{3,64}$/.test(username) ||
      displayName.length < 2 || displayName.length > 120 ||
      password.length < 16 || password.length > 128) {
    return res.status(400).json({ success: false, error: 'Provide a valid restaurant code, username, display name and password of 16–128 characters.' });
  }
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({ success: false, error: 'PostgreSQL is required for administrator provisioning.' });
  let client: any;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const restaurant = await client.query('SELECT code FROM restaurants WHERE code=$1 FOR UPDATE', [restaurantCode]);
    if (!restaurant.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Restaurant not found.' });
    }
    const id = 'ra_' + crypto.randomUUID();
    const passwordHash = hashServerStaffSecret(password);
    const inserted = await client.query(
      'INSERT INTO restaurant_admins (id,restaurant_code,username,display_name,password_hash,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,restaurant_code,username,display_name,status,created_at',
      [id, restaurantCode, username, displayName, passwordHash, 'active']
    );
    await client.query(
      'INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['audit_' + crypto.randomUUID(), restaurantCode, req.user!.userId, 'TENANT_ADMIN_CREATED', JSON.stringify({ administratorId: id, username })]
    );
    await client.query('COMMIT');
    return res.status(201).json({ success: true, administrator: inserted.rows[0] });
  } catch (error: any) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    if (error?.code === '23505') return res.status(409).json({ success: false, error: 'That username is already registered for this restaurant.' });
    console.error('[Restaurant Admin Provisioning] Failed:', error);
    return res.status(503).json({ success: false, error: 'Administrator account could not be provisioned.' });
  } finally {
    client?.release();
  }
});

app.patch('/api/admin/restaurant-admins/:id', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  const id = String(req.params.id || '');
  const status = req.body?.status;
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!id || (status !== undefined && !['active', 'blocked'].includes(status)) ||
      (password && (password.length < 16 || password.length > 128)) ||
      (status === undefined && !password)) {
    return res.status(400).json({ success: false, error: 'Provide status active/blocked and/or a new password of at least 16 characters.' });
  }
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({ success: false, error: 'PostgreSQL is required for administrator management.' });
  const passwordHash = password ? hashServerStaffSecret(password) : null;
  try {
    const result = await pool.query(
      'UPDATE restaurant_admins SET status=COALESCE($2,status), password_hash=COALESCE($3,password_hash), session_version=CASE WHEN $2 IS NOT NULL OR $3 IS NOT NULL THEN session_version+1 ELSE session_version END, updated_at=NOW() WHERE id=$1 RETURNING id,restaurant_code,username,display_name,status',
      [id, status || null, passwordHash]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Administrator account not found.' });
    await pool.query(
      'INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['audit_' + crypto.randomUUID(), result.rows[0].restaurant_code, req.user!.userId, 'TENANT_ADMIN_UPDATED', JSON.stringify({ administratorId: id, status: status || 'unchanged', passwordReset: Boolean(password) })]
    );
    return res.json({ success: true, administrator: result.rows[0] });
  } catch (error) {
    console.error('[Restaurant Admin Update] Failed:', error);
    return res.status(503).json({ success: false, error: 'Administrator account could not be updated.' });
  }
});

// GET /api/auth/session: Verify current session token
app.get('/api/auth/session', apiRateLimiter, requireAuth(), (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// POST /api/auth/logout: Revoke session token
app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization || (req.headers['x-restopass-token'] as string);
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : (authHeader || '').trim();
  if (token && !(await revokeSessionToken(token))) {
    return res.status(503).json({ success: false, error: 'Could not revoke the session because shared session security is unavailable.' });
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// ----------------------------------------------------
// Customer Non-SMS Authentication, Activation & Recovery Endpoints (Section 4)
// ----------------------------------------------------

function hashServerStaffSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function verifyServerStaffSecret(secret: string, stored: unknown): boolean {
  if (!secret || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return false;
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function computeServerCustomerPinHash(pin: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin.trim(), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function verifyServerCustomerPin(enteredPin: string, customer: any): boolean {
  if (!enteredPin || !customer || typeof customer.pinHash !== 'string' || !customer.pinHash) return false;
  const cleanEntered = enteredPin.trim();
  const expected = customer.pinHash.trim();
  if (expected.startsWith('scrypt$')) {
    try {
      const parts = expected.split('$');
      if (parts.length !== 6 || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return false;
      const salt = Buffer.from(parts[4], 'base64url');
      const expectedHash = Buffer.from(parts[5], 'base64url');
      if (salt.length !== 16 || expectedHash.length !== 32) return false;
      const actualHash = crypto.scryptSync(cleanEntered, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      return crypto.timingSafeEqual(actualHash, expectedHash);
    } catch { return false; }
  }
  const legacySalt = `RESTOPASS_CUST_SALT:${customer.id}:${customer.memberNo}`;
  const legacyPayload = `RESTOPASS_SALTED_PIN_V1:${legacySalt}:${cleanEntered}`;
  const legacyHash = crypto.createHash('sha256').update(legacyPayload).digest('hex');
  const plainHash = crypto.createHash('sha256').update(cleanEntered).digest('hex');
  return timingSafeCompare(cleanEntered, expected) || timingSafeCompare(legacyHash, expected) || timingSafeCompare(plainHash, expected);
}

// POST /api/customer/auth/login: Authenticate phone number + 6+ digit PIN (Rate-limited, lockout, generic error)
app.post('/api/customer/auth/login', authRateLimiter, (req, res) => {
  const { phone, pin, username } = req.body;
  const cleanPhone = (phone || username || '').trim();
  const cleanPin = (pin || '').trim();

  const customers = serverDbState?.customers || [];
  const cust = customers.find(
    (c: any) =>
      c.phone === cleanPhone ||
      (c.phone && c.phone.replace(/\s+/g, '') === cleanPhone.replace(/\s+/g, '')) ||
      c.memberNo === cleanPhone ||
      c.id === cleanPhone
  );

  // Generic error to prevent phone-number enumeration
  if (!cust) {
    return res.status(401).json({ success: false, error: 'Invalid phone number or PIN' });
  }

  // Account lockout protection
  if (cust.lockedUntil && new Date(cust.lockedUntil).getTime() > Date.now()) {
    const waitMin = Math.max(1, Math.ceil((new Date(cust.lockedUntil).getTime() - Date.now()) / 60000));
    return res.status(423).json({
      success: false,
      error: `Account temporarily locked due to repeated failed login attempts. Please try again in ${waitMin} minutes or visit cafeteria reception.`,
    });
  }

  // Approval status checks
  if (cust.provisionalStatus === 'pending_approval') {
    return res.status(403).json({
      success: false,
      error: 'Your registration is pending restaurant boss approval. You can eat grace meals at the stand with your Member ID.',
    });
  }
  if (cust.provisionalStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      error: 'Customer registration was not approved. Please visit cafeteria management.',
    });
  }
  if (cust.activationStatus === 'ready_for_activation') {
    return res.status(403).json({
      success: false,
      error: 'Account approved! Please complete your one-time activation at cafeteria reception to set your personal PIN.',
    });
  }

  const isPinValid = verifyServerCustomerPin(cleanPin, cust);
  if (!isPinValid) {
    cust.failedLoginAttempts = (cust.failedLoginAttempts || 0) + 1;
    if (cust.failedLoginAttempts >= 5) {
      cust.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    queueDbSave(serverDbState);
    return res.status(401).json({ success: false, error: 'Invalid phone number or PIN' });
  }

  // Login success
  if (!cust.pinHash.startsWith('scrypt$')) cust.pinHash = computeServerCustomerPinHash(cleanPin);
  cust.failedLoginAttempts = 0;
  cust.lockedUntil = null;
  cust.lastLoginAt = new Date().toISOString();
  queueDbSave(serverDbState);

  const token = createSessionToken({
    userId: cust.id,
    username: cust.phone || cust.memberNo,
    role: 'customer',
    restaurantCode: cust.restaurantCode,
  });

  return res.json({
    success: true,
    token,
    customer: {
      id: cust.id,
      name: cust.name,
      phone: cust.phone,
      memberNo: cust.memberNo,
      restaurantCode: cust.restaurantCode,
      activationStatus: cust.activationStatus,
      cardStatus: cust.cardStatus,
    },
  });
});

// POST /api/customer/auth/logout: Revoke current session
app.post('/api/customer/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization || (req.headers['x-restopass-token'] as string);
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : (authHeader || '').trim();
  if (token && !(await revokeSessionToken(token))) {
    return res.status(503).json({ success: false, error: 'Could not revoke the session because shared session security is unavailable.' });
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/customer/auth/session: Return authenticated customer session status
app.get('/api/customer/auth/session', apiRateLimiter, requireAuth(['customer']), (req, res) => {
  const cust = (serverDbState?.customers || []).find((c: any) => c.id === req.user?.userId);
  return res.json({
    success: true,
    user: req.user,
    customer: cust
      ? {
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
          memberNo: cust.memberNo,
          restaurantCode: cust.restaurantCode,
          activationStatus: cust.activationStatus,
          cardStatus: cust.cardStatus,
        }
      : null,
  });
});

// POST /api/customer/activation/request: Staff-issued short-lived, single-use activation code (Non-SMS)
app.post(
  '/api/customer/activation/request',
  apiRateLimiter,
  requireAuth(['stand_staff', 'restaurant_admin', 'super_admin']),
  (req, res) => {
    const { customerId, memberNo, phone } = req.body;
    const user = req.user!;
    const customers = serverDbState?.customers || [];
    const cust = customers.find(
      (c: any) =>
        c.id === customerId ||
        c.memberNo === memberNo ||
        (phone && c.phone === phone)
    );
    if (!cust) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (user.role !== 'super_admin' && cust.restaurantCode !== user.restaurantCode) {
      return res.status(403).json({ success: false, error: 'Customer belongs to another restaurant.' });
    }
    if (cust.provisionalStatus === 'pending_approval') {
      return res.status(400).json({ success: false, error: 'Registration is pending boss approval before activation.' });
    }
    if (cust.provisionalStatus === 'rejected' || cust.activationStatus === 'suspended') {
      return res.status(400).json({ success: false, error: 'Account is rejected or suspended.' });
    }

    if (!serverDbState.activationRequests) serverDbState.activationRequests = [];
    serverDbState.activationRequests.forEach((r: any) => {
      if (r.customerId === cust.id && !r.used) r.used = true;
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const activationRecord = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      customerId: cust.id,
      memberNo: cust.memberNo,
      phone: cust.phone,
      restaurantCode: cust.restaurantCode,
      activationCode: code,
      codeHash,
      authorizingStaffId: req.user!.userId,
      authorizingStaffName: req.user!.username,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    };
    serverDbState.activationRequests.unshift(activationRecord);
    queueDbSave(serverDbState);

    return res.json({
      success: true,
      activationCode: code,
      expiresAt,
      memberNo: cust.memberNo,
      customerName: cust.name,
    });
  }
);

// POST /api/customer/activation/complete: Customer privately sets their 6+ digit PIN
app.post('/api/customer/activation/complete', authRateLimiter, (req, res) => {
  const { phoneOrMember, activationCode, newPin } = req.body;
  const cleanIdentifier = (phoneOrMember || '').trim();
  const cleanPin = (newPin || '').trim();
  const cleanCode = (activationCode || '').trim();

  if (!/^\d{6,}$/.test(cleanPin)) {
    return res.status(400).json({ success: false, error: 'PIN must be at least 6 numeric digits.' });
  }

  const customers = serverDbState?.customers || [];
  const cust = customers.find(
    (c: any) =>
      c.phone === cleanIdentifier ||
      (c.phone && c.phone.replace(/\s+/g, '') === cleanIdentifier.replace(/\s+/g, '')) ||
      c.memberNo === cleanIdentifier ||
      c.id === cleanIdentifier
  );
  if (!cust) return res.status(400).json({ success: false, error: 'Invalid activation credentials or code.' });

  const requests = serverDbState?.activationRequests || [];
  const codeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
  const actReq = requests.find(
    (r: any) =>
      r.customerId === cust.id &&
      !r.used &&
      (r.activationCode === cleanCode || r.codeHash === codeHash) &&
      new Date(r.expiresAt).getTime() > Date.now()
  );

  if (!actReq) {
    return res.status(400).json({ success: false, error: 'Invalid, expired, or already used activation code.' });
  }

  const pinHash = computeServerCustomerPinHash(cleanPin);
  cust.pinHash = pinHash;
  cust.hasCustomPin = true;
  cust.pinSetAt = new Date().toISOString();
  cust.activationStatus = 'active';
  cust.failedLoginAttempts = 0;
  cust.lockedUntil = null;
  cust.cardReadyForPrint = true;

  actReq.used = true;
  actReq.usedAt = new Date().toISOString();

  queueDbSave(serverDbState);

  const token = createSessionToken({
    userId: cust.id,
    username: cust.phone || cust.memberNo,
    role: 'customer',
    restaurantCode: cust.restaurantCode,
  });

  return res.json({
    success: true,
    token,
    customer: {
      id: cust.id,
      name: cust.name,
      memberNo: cust.memberNo,
      phone: cust.phone,
      restaurantCode: cust.restaurantCode,
    },
  });
});

// POST /api/customer/recovery/request: Create audited PIN recovery request
app.post('/api/customer/recovery/request', apiRateLimiter, (req, res) => {
  const { customerId, phone, reason, idVerificationMethod, restaurantCode } = req.body;
  const customers = serverDbState?.customers || [];
  const cust = customers.find((c: any) => c.id === customerId || (phone && c.phone === phone));
  if (!cust) return res.status(404).json({ success: false, error: 'Customer not found' });

  if (!serverDbState.pinRecoveryRequests) serverDbState.pinRecoveryRequests = [];
  const requestId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const recReq = {
    id: requestId,
    customerId: cust.id,
    memberNo: cust.memberNo,
    phone: cust.phone,
    restaurantCode: cust.restaurantCode || restaurantCode || 'RW01',
    reason: (reason || 'Customer forgotten PIN').trim(),
    idVerificationMethod: idVerificationMethod || 'student_id_check',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  serverDbState.pinRecoveryRequests.unshift(recReq);
  queueDbSave(serverDbState);

  return res.json({ success: true, requestId });
});

// POST /api/customer/recovery/approve: Manager authorizes recovery and issues reset code
app.post(
  '/api/customer/recovery/approve',
  apiRateLimiter,
  requireAuth(['restaurant_admin', 'super_admin']),
  (req, res) => {
    const { requestId } = req.body;
    const user = req.user!;
    const requests = serverDbState?.pinRecoveryRequests || [];
    const recReq = requests.find((r: any) => r.id === requestId);
    if (!recReq) return res.status(404).json({ success: false, error: 'Recovery request not found' });
    if (user.role !== 'super_admin' && recReq.restaurantCode !== user.restaurantCode) {
      return res.status(403).json({ success: false, error: 'Recovery request belongs to another restaurant.' });
    }
    if (recReq.status !== 'pending') return res.status(400).json({ success: false, error: 'Request is already reviewed' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    recReq.status = 'approved';
    recReq.recoveryCode = code;
    recReq.recoveryCodeHash = codeHash;
    recReq.authorizingStaffId = req.user!.userId;
    recReq.authorizingStaffName = req.user!.username;
    recReq.approvedAt = new Date().toISOString();
    recReq.expiresAt = expiresAt;

    queueDbSave(serverDbState);
    return res.json({ success: true, recoveryCode: code, expiresAt });
  }
);

// POST /api/customer/recovery/complete: Customer privately sets new PIN
app.post('/api/customer/recovery/complete', authRateLimiter, (req, res) => {
  const { requestId, recoveryCode, newPin } = req.body;
  const cleanPin = (newPin || '').trim();
  if (!/^\d{6,}$/.test(cleanPin)) {
    return res.status(400).json({ success: false, error: 'PIN must be at least 6 numeric digits.' });
  }

  const requests = serverDbState?.pinRecoveryRequests || [];
  const recReq = requests.find((r: any) => r.id === requestId);
  if (!recReq) return res.status(404).json({ success: false, error: 'Recovery request not found' });
  if (recReq.status !== 'approved') return res.status(400).json({ success: false, error: 'Request not authorized for reset.' });
  if (recReq.expiresAt && new Date(recReq.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ success: false, error: 'Recovery code expired' });
  }

  const cleanCode = (recoveryCode || '').trim();
  const codeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
  if (recReq.recoveryCode !== cleanCode && recReq.recoveryCodeHash !== codeHash) {
    return res.status(400).json({ success: false, error: 'Invalid recovery code' });
  }

  const customers = serverDbState?.customers || [];
  const cust = customers.find((c: any) => c.id === recReq.customerId);
  if (!cust) return res.status(404).json({ success: false, error: 'Customer not found' });

  const pinHash = computeServerCustomerPinHash(cleanPin);
  cust.pinHash = pinHash;
  cust.hasCustomPin = true;
  cust.pinSetAt = new Date().toISOString();
  cust.failedLoginAttempts = 0;
  cust.lockedUntil = null;
  cust.keyVersion = (cust.keyVersion || 1) + 1; // revokes previous session keys
  recReq.status = 'completed';
  recReq.completedAt = new Date().toISOString();

  queueDbSave(serverDbState);
  return res.json({ success: true, message: 'PIN reset successfully. You can now log in.' });
});

// ----------------------------------------------------
// Private patron photo access and uploads
// ----------------------------------------------------

function normalizePrivatePhotoUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return '';
  try {
    const parsed = new URL(value, 'https://restopass.invalid');
    const key = parsed.searchParams.get('key') || '';
    if (parsed.pathname !== '/api/customer/photo' || !/^patron-photos\/[A-Za-z0-9._-]{1,180}$/.test(key)) return '';
    return `/api/customer/photo?key=${encodeURIComponent(key)}`;
  } catch {
    return '';
  }
}

// Photos are private objects; access is granted only through an authenticated,
// tenant-scoped route after confirming the object is attached to a customer record.
app.get('/api/customer/photo', apiRateLimiter, requireAuth(), async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!/^patron-photos\/[A-Za-z0-9._-]{1,180}$/.test(key)) {
    return res.status(400).json({ success: false, error: 'Invalid photo reference.' });
  }
  const privateUrl = `/api/customer/photo?key=${encodeURIComponent(key)}`;
  let customer = (serverDbState?.customers || []).find((item: any) => item.photoUrl === privateUrl);
  if (!customer && isPostgresConfigured()) {
    const pool = getPostgresPool();
    if (pool) {
      try {
        const result = await pool.query(
          "SELECT id, restaurant_code FROM customers WHERE data->>'photoUrl' = $1 LIMIT 1",
          [privateUrl]
        );
        if (result.rows[0]) {
          customer = { id: result.rows[0].id, restaurantCode: result.rows[0].restaurant_code };
        }
      } catch (e) {
        console.error('[Photo Lookup Postgres Error]', e);
      }
    }
  }
  if (!customer) return res.status(404).json({ success: false, error: 'Photo not found.' });
  const user = req.user!;
  if (user.role === 'customer' && customer.id !== user.userId) {
    return res.status(403).json({ success: false, error: 'You are not authorized to view this photo.' });
  }
  if (user.role !== 'super_admin' && customer.restaurantCode !== user.restaurantCode) {
    return res.status(403).json({ success: false, error: 'Photo belongs to another restaurant.' });
  }
  try {
    const photo = await downloadPatronPhoto(key);
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(photo.buffer);
  } catch (error) {
    console.error('[Private Photo Retrieval] Failed:', error);
    return res.status(404).json({ success: false, error: 'Photo is unavailable.' });
  }
});

// POST /api/upload/photo: Upload patron photos to private object storage.
app.post('/api/upload/photo', apiRateLimiter, requireAuth(['stand_staff', 'restaurant_admin', 'super_admin']), async (req, res) => {
  const { photoBase64, filenameHint } = req.body;
  if (!photoBase64 || typeof photoBase64 !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing required "photoBase64" data URL string.',
    });
  }

  try {
    const uploadResult = await uploadBase64Photo(photoBase64, filenameHint || 'patron');
    return res.json({
      success: true,
      url: `/api/customer/photo?key=${encodeURIComponent(uploadResult.key)}`,
      key: uploadResult.key,
      storageType: uploadResult.storageType,
      sizeBytes: uploadResult.sizeBytes,
    });
  } catch (err: any) {
    console.error('[Upload Photo Error]', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to process and store patron photo.',
    });
  }
});

// ----------------------------------------------------
// Authoritative Cryptographic QR & License Engine (Finding 1 & 4)
// ----------------------------------------------------

// POST /api/qr/token/phone: Authoritative generation of dynamic phone pass QR
app.post('/api/qr/token/phone', apiRateLimiter, requireAuth(), (req, res) => {
  const { restaurantCode, memberNo, keyVersion } = req.body;
  const user = req.user!;

  if (!restaurantCode || !memberNo) {
    return res.status(400).json({ success: false, error: 'restaurantCode and memberNo are required' });
  }

  // Authorization: Customers can only generate their own pass; staff/admin can generate for their restaurant
  if (user.role === 'customer' && (user.username !== memberNo || user.restaurantCode !== restaurantCode)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Customers may only generate their own pass' });
  }
  if (user.role === 'customer') {
    const qrEnt = checkServerStudentEntitlement(user.userId, 'digital_qr');
    if (!qrEnt.allowed) {
      return res.status(402).json({
        success: false,
        requiresSubscription: true,
        error: qrEnt.reason || 'Digital dashboard QR requires an active subscription (500 RWF/mo).',
      });
    }
  }
  if ((user.role === 'stand_staff' || user.role === 'restaurant_admin') && user.restaurantCode !== restaurantCode) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cross-restaurant token generation not allowed' });
  }

  const kVer = typeof keyVersion === 'number' ? keyVersion : 1;
  const restoKey = deriveServerRestaurantKey(restaurantCode);
  const custKey = deriveServerCustomerKey(restoKey, memberNo, kVer);
  const step = getCurrentServerTimeStep();
  const fullMac = serverHmac(custKey, `STEP:${step}`);
  const mac = fullMac.slice(0, 16);
  const token = `v1.${restaurantCode.toUpperCase()}.${memberNo}.${step}.${mac}`;
  const effectiveTime = Date.now();
  const secondsRemaining = 30 - Math.floor((effectiveTime % 30000) / 1000);

  return res.json({
    success: true,
    token,
    step,
    secondsRemaining,
  });
});

// POST /api/qr/token/card: Authoritative generation of physical card QR (Managers & Admins only)
app.post(
  '/api/qr/token/card',
  apiRateLimiter,
  requireAuth(['super_admin', 'restaurant_admin']),
  (req, res) => {
    const { restaurantCode, memberNo, cardVersion } = req.body;
    const user = req.user!;

    if (!restaurantCode || !memberNo) {
      return res.status(400).json({ success: false, error: 'restaurantCode and memberNo are required' });
    }

    if (user.role === 'restaurant_admin' && user.restaurantCode !== restaurantCode) {
      return res.status(403).json({ success: false, error: 'Forbidden: Cannot generate cards for other restaurants' });
    }

    const cVer = typeof cardVersion === 'number' ? cardVersion : 1;
    const restoKey = deriveServerRestaurantKey(restaurantCode);
    const fullMac = serverHmac(restoKey, `CARD:${memberNo}:V${cVer}`);
    const mac = fullMac.slice(0, 16);
    const token = `c1.${restaurantCode.toUpperCase()}.${memberNo}.${cVer}.${mac}`;

    return res.json({
      success: true,
      token,
      restaurantCode,
      memberNo,
      cardVersion: cVer,
    });
  }
);

// POST /api/qr/verify: Server-Authoritative QR Verification with Shared Persistent Replay Guard (Finding 4)
app.post(
  '/api/qr/verify',
  apiRateLimiter,
  requireAuth(['stand_staff', 'restaurant_admin', 'super_admin']),
  async (req, res) => {
    const { payload, restaurantCode } = req.body;
    const user = req.user!;

    if (!payload || typeof payload !== 'string') {
      return res.status(400).json({ success: false, valid: false, error: 'Missing QR payload' });
    }

    const targetResto = restaurantCode || user.restaurantCode;
    if (user.role !== 'super_admin' && user.restaurantCode !== targetResto) {
      return res.status(403).json({ success: false, valid: false, error: 'Cross-restaurant scan verification forbidden' });
    }

    const parts = payload.trim().split('.');
    if (parts.length < 5) {
      return res.json({ success: true, valid: false, error: 'Invalid QR format' });
    }

    const [versionPrefix, tokenResto, memberNo, stepOrVer, mac] = parts;
    if (tokenResto.toUpperCase() !== targetResto.toUpperCase()) {
      return res.json({
        success: true,
        valid: false,
        error: `Wrong restaurant: Token belongs to ${tokenResto}, not ${targetResto}`,
      });
    }

    const customer = (serverDbState?.customers || []).find(
      (c: any) => c.memberNo === memberNo && c.restaurantCode === targetResto
    );
    if (!customer) {
      return res.json({
        success: true,
        valid: false,
        error: `Customer #${memberNo} not found in restaurant records`,
      });
    }

    // 1. Physical Card QR Verification (c1)
    if (versionPrefix === 'c1') {
      const cardVer = parseInt(stepOrVer, 10);
      if (isNaN(cardVer)) {
        return res.json({ success: true, valid: false, error: 'Corrupt card token version' });
      }
      if (customer.cardStatus === 'locked') {
        return res.json({ success: true, valid: false, error: 'Card is locked by customer or manager' });
      }
      if (cardVer !== customer.cardVersion) {
        return res.json({ success: true, valid: false, error: 'Obsolete card: A newer card was reissued for this member' });
      }

      const restoKey = deriveServerRestaurantKey(targetResto);
      const expectedMac = serverHmac(restoKey, `CARD:${memberNo}:V${cardVer}`).slice(0, 16);
      if (!timingSafeCompare(mac, expectedMac)) {
        return res.json({
          success: true,
          valid: false,
          error: 'Cryptographic MAC verification failed (counterfeit card)',
        });
      }

      return res.json({
        success: true,
        valid: true,
        type: 'card',
        memberNo,
        customerId: customer.id,
        customerName: customer.name,
        customerPhoto: customer.photoUrl,
        isCard: true,
      });
    }

    // 2. Dynamic Phone QR Verification (v1) with Shared Multi-Terminal Replay Protection
    if (versionPrefix === 'v1') {
      // Digital dashboard QR requires an active subscription when monetization is enabled
      const qrEntitlement = checkServerStudentEntitlement(customer.id, 'digital_qr');
      if (!qrEntitlement.allowed) {
        return res.json({
          success: true,
          valid: false,
          requiresSubscription: true,
          error:
            'Digital QR pass requires an active dashboard subscription (500 RWF/mo). Please scan physical card or activate subscription.',
        });
      }

      const scannedStep = parseInt(stepOrVer, 10);
      if (isNaN(scannedStep)) {
        return res.json({ success: true, valid: false, error: 'Corrupt token step' });
      }

      const currentStep = getCurrentServerTimeStep();
      const STEP_TOLERANCE = 10;
      if (Math.abs(scannedStep - currentStep) > STEP_TOLERANCE) {
        return res.json({
          success: true,
          valid: false,
          error:
            scannedStep < currentStep
              ? 'Expired token. Please refresh your QR pass.'
              : 'Token clock drift detected. Check device clocks.',
        });
      }

      const restoKey = deriveServerRestaurantKey(targetResto);
      const custKey = deriveServerCustomerKey(restoKey, memberNo, customer.keyVersion || 1);
      const expectedMac = serverHmac(custKey, `STEP:${scannedStep}`).slice(0, 16);

      if (!timingSafeCompare(mac, expectedMac)) {
        return res.json({
          success: true,
          valid: false,
          error: 'Signature mismatch (invalid or reissued key)',
        });
      }

      // Verification is deliberately read-only. The consume endpoint records the token
      // in the same PostgreSQL transaction as the meal deduction.

      return res.json({
        success: true,
        valid: true,
        type: 'phone',
        memberNo,
        customerId: customer.id,
        customerName: customer.name,
        customerPhoto: customer.photoUrl,
        step: scannedStep,
        isCard: false,
      });
    }

    return res.json({ success: true, valid: false, error: `Unknown token protocol: ${versionPrefix}` });
  }
);

// POST /api/scans/consume: atomic, server-authoritative meal redemption.
// The database transaction is the authority; the browser must not deduct balances optimistically.
app.post(
  '/api/scans/consume',
  scanRateLimiter,
  requireAuth(['stand_staff', 'restaurant_admin']),
  async (req, res) => {
    const user = req.user!;
    const payload = typeof req.body?.payload === 'string' ? req.body.payload.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    const requestedStationId = typeof req.body?.stationId === 'string' ? req.body.stationId.trim() : '';
    const restaurantCode = user.restaurantCode;
    if (!payload || payload.length > 2048 || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey) || !requestedStationId) {
      return res.status(400).json({ success: false, error: 'A valid QR payload, station and idempotency key are required.' });
    }
    if (user.role === 'stand_staff' && (!user.stationId || user.stationId !== requestedStationId)) {
      return res.status(403).json({ success: false, error: 'This account is not assigned to the requested scanner station.' });
    }
    const station = (serverDbState?.scanPoints || []).find((p: any) =>
      p.id === requestedStationId && p.restaurantCode === restaurantCode && p.status === 'active'
    );
    if (!station || !station.isPaired) {
      return res.status(403).json({ success: false, error: 'Scanner station is not paired or active for this restaurant.' });
    }
    const currentRestaurant = (serverDbState?.restaurants || []).find((r: any) => r.code === restaurantCode);
    const restaurantLicenses = (serverDbState?.licenses || []).filter((l: any) => l.restaurantCode === restaurantCode);
    const licenseStatus = restaurantLicenses.find((l: any) => l.id === currentRestaurant?.currentLicenseId) || restaurantLicenses[restaurantLicenses.length - 1];
    const paidUntilMs = licenseStatus ? new Date(licenseStatus.validUntil).getTime() : 0;
    const graceEndsAtMs = paidUntilMs + 72 * 60 * 60 * 1000;
    const blockedRestaurantStates = ['pending_payment', 'suspended', 'expired'];
    if (!currentRestaurant || blockedRestaurantStates.includes(currentRestaurant.status) || !licenseStatus || !Number.isFinite(paidUntilMs) || Date.now() >= graceEndsAtMs) {
      return res.status(403).json({ success: false, error: 'Restaurant subscription is inactive or the 72-hour renewal grace period has ended.' });
    }

    const parts = payload.split('.');
    if (parts.length !== 5) return res.status(400).json({ success: false, error: 'Invalid QR format.' });
    const [version, tokenRestaurant, memberNo, stepOrVersion, mac] = parts;
    if (tokenRestaurant.toUpperCase() !== restaurantCode.toUpperCase()) {
      return res.status(403).json({ success: false, error: 'QR belongs to another restaurant.' });
    }

    const pool = getPostgresPool();
    if (!pool || !isPostgresConfigured()) {
      return res.status(503).json({ success: false, error: 'Authoritative scanning requires the production database.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize concurrent requests that reuse the same idempotency key before checking its result.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);

      // Idempotent retries return the exact original committed result.
      const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify({
        payload, restaurantCode, stationId: requestedStationId, actorId: user.userId, role: user.role,
      })).digest('hex');
      const prior = await client.query(
        'SELECT response, restaurant_code, request_hash, actor_user_id, station_id FROM scan_requests WHERE idempotency_key = $1 FOR UPDATE',
        [idempotencyKey]
      );
      if (prior.rows[0]?.response) {
        if (prior.rows[0].restaurant_code !== restaurantCode || prior.rows[0].request_hash !== requestFingerprint || prior.rows[0].actor_user_id !== user.userId || prior.rows[0].station_id !== requestedStationId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Idempotency key belongs to another restaurant.' });
        }
        await client.query('COMMIT');
        return res.json(prior.rows[0].response);
      }

      const customerResult = await client.query(
        'SELECT id, restaurant_code, member_no, card_status, card_version, key_version, data FROM customers WHERE restaurant_code = $1 AND member_no = $2 FOR UPDATE',
        [restaurantCode, memberNo]
      );
      const customerRow = customerResult.rows[0];
      if (!customerRow) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Customer record not found.' });
      }
      const customer = customerRow.data || {};
      if (customerRow.card_status !== 'active' || customer.activationStatus === 'suspended' || customer.provisionalStatus === 'rejected') {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, error: 'Customer account or card is inactive.' });
      }

      let tokenStep: number | null = null;
      if (version === 'c1') {
        const cardVersion = Number(stepOrVersion);
        const expected = serverHmac(deriveServerRestaurantKey(restaurantCode), `CARD:${memberNo}:V${cardVersion}`).slice(0, 16);
        if (!Number.isSafeInteger(cardVersion) || cardVersion !== customerRow.card_version || !timingSafeCompare(mac, expected)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Card signature or version is invalid.' });
        }
      } else if (version === 'v1') {
        tokenStep = Number(stepOrVersion);
        const currentStep = getCurrentServerTimeStep();
        if (!Number.isSafeInteger(tokenStep) || Math.abs(tokenStep - currentStep) > 10) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Digital QR expired. Refresh the customer QR.' });
        }
        const entitlement = checkServerStudentEntitlement(customerRow.id, 'digital_qr');
        if (!entitlement.allowed) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Digital QR access requires an active subscription.' });
        }
        const customerKey = deriveServerCustomerKey(deriveServerRestaurantKey(restaurantCode), memberNo, customerRow.key_version || 1);
        const expected = serverHmac(customerKey, `STEP:${tokenStep}`).slice(0, 16);
        if (!timingSafeCompare(mac, expected)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Digital QR signature is invalid.' });
        }
        // Unique database key makes replay prevention atomic across all app instances.
        const replay = await client.query(
          `INSERT INTO used_tokens (token_key, used_at, station_id, member_no, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
           ON CONFLICT (token_key) DO NOTHING RETURNING token_key`,
          [`${customerKey}:${tokenStep}`, Date.now(), requestedStationId, memberNo]
        );
        if ((replay.rowCount || 0) !== 1) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: 'This digital QR has already been used.' });
        }
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Unsupported QR protocol.' });
      }

      const checkpoint = await client.query(
        'SELECT balance, cutoff_timestamp FROM balance_checkpoints WHERE customer_id = $1 ORDER BY cutoff_timestamp DESC LIMIT 1',
        [customerRow.id]
      );
      const cutoff = checkpoint.rows[0]?.cutoff_timestamp || new Date(0);
      const baseBalance = Number(checkpoint.rows[0]?.balance || 0);
      const ledger = await client.query(
        'SELECT COALESCE(SUM(plates_delta), 0)::int AS delta FROM ledger_entries WHERE customer_id = $1 AND timestamp > $2',
        [customerRow.id, cutoff]
      );
      const balanceBefore = Math.max(0, baseBalance + Number(ledger.rows[0]?.delta || 0));
      let isGraceMeal = false;
      let gracePlateNumber: number | undefined;
      let pendingApprovalRows: any[] = [];
      if (balanceBefore < 1) {
        const pendingResult = await client.query(
          "SELECT id, data FROM pending_approvals WHERE customer_id = $1 AND restaurant_code = $2 AND status = 'pending' ORDER BY created_at ASC FOR UPDATE",
          [customerRow.id, restaurantCode]
        );
        pendingApprovalRows = pendingResult.rows;
        const totalGraceConsumed = pendingApprovalRows.reduce(
          (sum: number, row: any) => sum + Number(row.data?.gracePlatesConsumed || 0), 0
        );
        const effectiveGraceConsumed = Math.max(
          totalGraceConsumed,
          customer.provisionalStatus === 'pending_approval' ? Number(customer.gracePlatesConsumed || 0) : 0
        );
        const hasPendingPayment = pendingApprovalRows.length > 0 || customer.provisionalStatus === 'pending_approval';
        if (!hasPendingPayment || effectiveGraceConsumed >= 3) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: hasPendingPayment ? 'Grace meal limit reached (3/3). Await payment approval.' : 'No approved meal balance. Please top up or await payment approval.' });
        }
        const targetApproval = pendingApprovalRows.find((row: any) =>
          Number(row.data?.gracePlatesConsumed || 0) < Number(row.data?.gracePlatesAllowed || 3)
        );
        if (targetApproval) {
          const updatedApproval = {
            ...targetApproval.data,
            gracePlatesConsumed: Number(targetApproval.data?.gracePlatesConsumed || 0) + 1,
          };
          await client.query('UPDATE pending_approvals SET data = $2, updated_at = NOW() WHERE id = $1', [
            targetApproval.id, JSON.stringify(updatedApproval),
          ]);
          targetApproval.data = updatedApproval;
        }
        isGraceMeal = true;
        gracePlateNumber = effectiveGraceConsumed + 1;
        customer.gracePlatesConsumed = gracePlateNumber;
        customer.gracePlatesRemaining = Math.max(0, 3 - gracePlateNumber);
        await client.query('UPDATE customers SET data = $2, updated_at = NOW() WHERE id = $1', [
          customerRow.id, JSON.stringify(customer),
        ]);
      }

      const restaurant = (serverDbState?.restaurants || []).find((r: any) => r.code === restaurantCode);
      const plan = (serverDbState?.plans || []).find((p: any) => p.id === restaurant?.planId) || (serverDbState?.plans || [])[0];
      const terms = { ...(plan?.terms || {}), ...(restaurant?.termsOverride || {}) };
      const windowMinutes = Math.max(1, Number(terms.servingWindowMinutes || 120));
      const plateLimit = Math.max(1, Number(terms.plateLimitPerWindow || 3));
      const windowStart = new Date(Date.now() - windowMinutes * 60000);
      const recent = await client.query(
        'SELECT data FROM scan_events WHERE customer_id = $1 AND restaurant_code = $2 AND created_at >= $3 ORDER BY created_at DESC',
        [customerRow.id, restaurantCode, windowStart]
      );
      const recentEvents = recent.rows.map((r: any) => r.data || {});
      const platesInWindow = recentEvents.reduce((sum: number, ev: any) =>
        sum + ((ev.status === 'approved' || ev.status === 'warning_confirmed') ? Number(ev.platesDeducted || 0) : 0), 0);
      const lastStationScan = await client.query(
        "SELECT data FROM scan_events WHERE restaurant_code = $1 AND station_id = $2 AND status IN ('approved', 'warning_confirmed') ORDER BY created_at DESC LIMIT 1",
        [restaurantCode, requestedStationId]
      );
      if (lastStationScan.rows[0]?.data?.customerId === customerRow.id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Consecutive scans at this station are not allowed. Scan another customer first.' });
      }
      let supervisorOverride: any = null;
      if (platesInWindow >= plateLimit) {
        if (process.env.RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED !== 'true') {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, code: 'MEAL_LIMIT_REACHED', error: `Meal limit reached: maximum ${plateLimit} meals in ${windowMinutes} minutes.` });
        }
        const overrideId = typeof req.body?.supervisorOverrideId === 'string' ? req.body.supervisorOverrideId.trim() : '';
        if (!/^sov_[A-Za-z0-9_-]{8,64}$/.test(overrideId)) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, code: 'MEAL_LIMIT_REACHED', error: `Meal limit reached: maximum ${plateLimit} meals in ${windowMinutes} minutes. A supervisor approval is required.` });
        }
        const approved = await client.query(
          "SELECT * FROM scan_supervisor_overrides WHERE id=$1 AND restaurant_code=$2 AND customer_id=$3 AND station_id=$4 AND status='approved' AND expires_at>NOW() FOR UPDATE",
          [overrideId, restaurantCode, customerRow.id, requestedStationId]
        );
        if (!approved.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, code: 'SUPERVISOR_OVERRIDE_INVALID', error: 'Supervisor override is invalid, expired, already used or not bound to this customer and station.' });
        }
        supervisorOverride = approved.rows[0];
        await client.query(
          "UPDATE scan_supervisor_overrides SET status='consumed',consumed_at=NOW(),consumed_scan_id=$2 WHERE id=$1 AND status='approved'",
          [overrideId, 'pending']
        );
      }

      const now = new Date();
      const ledgerId = isGraceMeal ? null : `led_${crypto.randomUUID()}`;
      const scanId = `scan_${crypto.randomUUID()}`;
      const ledgerEntry = {
        id: ledgerId, customerId: customerRow.id, restaurantCode, type: 'scan',
        platesDelta: -1, timestamp: now.toISOString(), scanPointId: requestedStationId,
        staffId: user.userId, reference: `SCAN-${memberNo}`, idempotencyKey: `scan:${idempotencyKey}`,
      };
      const requiresPhotoCheck = !isGraceMeal && Boolean(customer.photoUrl) && crypto.randomBytes(1)[0] < 13;
      const event = {
        id: scanId, restaurantCode, customerId: customerRow.id,
        customerName: customer.name || 'Customer', customerPhoto: customer.photoUrl || '',
        memberNo, scanPointId: requestedStationId, scanPointName: station.name || 'Scanner',
        staffId: user.userId, staffName: user.username, timestamp: now.toISOString(),
        platesInWindow: platesInWindow + 1, platesDeducted: 1,
        photoCheckRequired: requiresPhotoCheck,
        photoCheckReason: requiresPhotoCheck ? 'random_sample' : 'none',
        photoCheckResult: 'none', status: (platesInWindow > 0 || isGraceMeal) ? 'warning_confirmed' : 'approved',
        isGracePlate: isGraceMeal, gracePlateNumber,
        supervisorOverrideId: supervisorOverride?.id,
        supervisorOverrideApprovedBy: supervisorOverride?.approved_by_user_id,
        overrideReason: isGraceMeal ? `Authorized grace meal (#${gracePlateNumber}/3). Awaiting manager payment approval.` : undefined,
      };
      if (!isGraceMeal) {
        await client.query(
          `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, idempotency_key, timestamp, data)
           VALUES ($1, $2, $3, 'scan', -1, $4, $5, $6)`,
          [ledgerId, restaurantCode, customerRow.id, ledgerEntry.idempotencyKey, now, JSON.stringify(ledgerEntry)]
        );
      }
      await client.query(
        `INSERT INTO scan_events (id, restaurant_code, customer_id, station_id, status, data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [scanId, restaurantCode, customerRow.id, requestedStationId, event.status, JSON.stringify(event), now]
      );
      const response = { success: true, accepted: true, scanEvent: event, ledgerEntry: isGraceMeal ? null : ledgerEntry, isGraceMeal, balanceBefore, balanceAfter: isGraceMeal ? 0 : balanceBefore - 1 };
      await client.query(
        'INSERT INTO scan_requests (idempotency_key, customer_id, restaurant_code, request_hash, actor_user_id, station_id, response, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [idempotencyKey, customerRow.id, restaurantCode, requestFingerprint, user.userId, requestedStationId, JSON.stringify(response), now]
      );
      if (supervisorOverride) {
        await client.query(
          "UPDATE scan_supervisor_overrides SET consumed_scan_id=$2 WHERE id=$1",
          [supervisorOverride.id, scanId]
        );
        await client.query(
          'INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
          ['aud_' + crypto.randomUUID(), restaurantCode, user.userId, 'SUPERVISOR_OVERRIDE_CONSUMED',
            JSON.stringify({ overrideId: supervisorOverride.id, scanId, customerId: customerRow.id, stationId: requestedStationId, approvedBy: supervisorOverride.approved_by_user_id })]
        );
      }
      await client.query('COMMIT');

      // Update process cache only after the durable transaction has committed.
      if (!isGraceMeal && Array.isArray(serverDbState?.ledgerEntries)) serverDbState.ledgerEntries.push(ledgerEntry);
      if (isGraceMeal) {
        const cachedCustomer = (serverDbState?.customers || []).find((c: any) => c.id === customerRow.id);
        if (cachedCustomer) {
          cachedCustomer.gracePlatesConsumed = customer.gracePlatesConsumed;
          cachedCustomer.gracePlatesRemaining = customer.gracePlatesRemaining;
        }
        for (const updated of pendingApprovalRows) {
          const cachedApproval = (serverDbState?.pendingApprovals || []).find((a: any) => a.id === updated.id);
          if (cachedApproval) cachedApproval.gracePlatesConsumed = updated.data.gracePlatesConsumed;
        }
      }
      if (Array.isArray(serverDbState?.scanEvents)) serverDbState.scanEvents.unshift(event);
      return res.json(response);
    } catch (error: any) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('[Atomic Scan] Transaction failed:', error);
      return res.status(503).json({ success: false, error: 'Scan could not be committed. Retry using the same idempotency key.' });
    } finally {
      client.release();
    }
  }
);



// Two-person supervisor override for a serving-window limit. Approval is one-time,
// customer/station-bound, short-lived and consumed inside the scan transaction.
app.post('/api/scans/supervisor-overrides', apiRateLimiter, requireAuth(['stand_staff','restaurant_admin']), async (req,res) => {
  if (process.env.RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED !== 'true') return res.status(503).json({success:false,code:'SUPERVISOR_OVERRIDES_DISABLED',error:'Supervisor overrides are disabled for this deployment.'});
  const user=req.user!;
  const customerId=typeof req.body?.customerId==='string'?req.body.customerId.trim():'';
  const stationId=typeof req.body?.stationId==='string'?req.body.stationId.trim():'';
  const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
  const idempotencyKey=typeof req.body?.idempotencyKey==='string'?req.body.idempotencyKey.trim():'';
  if(!customerId||!stationId||reason.length<12||reason.length>500||!/^[A-Za-z0-9:_-]{12,128}$/.test(idempotencyKey))
    return res.status(400).json({success:false,error:'Customer, station, detailed reason and idempotency key are required.'});
  if(user.role==='stand_staff'&&(!user.stationId||user.stationId!==stationId))
    return res.status(403).json({success:false,error:'Operator is not assigned to this station.'});
  const pool=getPostgresPool(); if(!pool||!isPostgresConfigured()) return res.status(503).json({success:false,error:'Supervisor overrides require PostgreSQL.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const station=(serverDbState?.scanPoints||[]).find((p:any)=>p.id===stationId&&p.restaurantCode===user.restaurantCode&&p.status==='active'&&p.isPaired);
    if(!station){await client.query('ROLLBACK');return res.status(403).json({success:false,error:'Station is not active and paired.'});}
    const customer=await client.query('SELECT id FROM customers WHERE id=$1 AND restaurant_code=$2 AND card_status=\'active\' FOR UPDATE',[customerId,user.restaurantCode]);
    if(!customer.rows[0]){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Active customer not found.'});}
    const prior=await client.query('SELECT id,data,status FROM scan_supervisor_overrides WHERE restaurant_code=$1 AND idempotency_key=$2 FOR UPDATE',[user.restaurantCode,idempotencyKey]);
    if(prior.rows[0]){
      const d=prior.rows[0].data;
      if(d.customerId!==customerId||d.stationId!==stationId||d.reason!==reason){await client.query('ROLLBACK');return res.status(409).json({success:false,error:'Idempotency key belongs to a different override request.'});}
      await client.query('COMMIT');return res.json({success:true,override:d,idempotent:true});
    }
    const id='sov_'+crypto.randomUUID(), now=new Date();
    const data={id,restaurantCode:user.restaurantCode,customerId,stationId,reason,status:'pending',
      requestedBy:{userId:user.userId,username:user.username,role:user.role},idempotencyKey,createdAt:now.toISOString()};
    await client.query("INSERT INTO scan_supervisor_overrides (id,restaurant_code,customer_id,station_id,status,requested_by_user_id,idempotency_key,data,expires_at) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,NOW()+INTERVAL '30 minutes')",
      [id,user.restaurantCode,customerId,stationId,user.userId,idempotencyKey,JSON.stringify(data)]);
    await client.query('INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['aud_'+crypto.randomUUID(),user.restaurantCode,user.userId,'SUPERVISOR_OVERRIDE_REQUESTED',JSON.stringify({overrideId:id,customerId,stationId,reason})]);
    await client.query('COMMIT');return res.status(201).json({success:true,override:data});
  } catch(e:any){try{await client.query('ROLLBACK')}catch{};if(e?.code==='23505')return res.status(409).json({success:false,error:'Override request already exists.'});console.error('[Override Request]',e);return res.status(503).json({success:false,error:'Override request was not saved.'});}
  finally{client.release();}
});

app.post('/api/scans/supervisor-overrides/:overrideId/approve',apiRateLimiter,requireAuth(['super_admin']),async(req,res)=>{
  if (process.env.RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED !== 'true') return res.status(503).json({success:false,code:'SUPERVISOR_OVERRIDES_DISABLED',error:'Supervisor overrides are disabled for this deployment.'});
  const actor=req.user!,reason=typeof req.body?.approvalReason==='string'?req.body.approvalReason.trim():'';
  if(reason.length<12||reason.length>500)return res.status(400).json({success:false,error:'A detailed approval reason is required.'});
  const pool=getPostgresPool();if(!pool||!isPostgresConfigured())return res.status(503).json({success:false,error:'Supervisor approval requires PostgreSQL.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const found=await client.query('SELECT * FROM scan_supervisor_overrides WHERE id=$1 FOR UPDATE',[req.params.overrideId]);
    const row=found.rows[0];
    if(!row){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Override request not found.'});}
    if(row.status!=='pending'||new Date(row.expires_at).getTime()<=Date.now()){await client.query('ROLLBACK');return res.status(409).json({success:false,error:'Override request is no longer pending or has expired.'});}
    if(row.requested_by_user_id===actor.userId){await client.query('ROLLBACK');return res.status(403).json({success:false,error:'Requester cannot approve their own override.'});}
    const data={...row.data,status:'approved',approvedBy:{userId:actor.userId,username:actor.username},approvalReason:reason,approvedAt:new Date().toISOString()};
    await client.query("UPDATE scan_supervisor_overrides SET status='approved',approved_by_user_id=$2,data=$3 WHERE id=$1",[row.id,actor.userId,JSON.stringify(data)]);
    await client.query('INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['aud_'+crypto.randomUUID(),row.restaurant_code,actor.userId,'SUPERVISOR_OVERRIDE_APPROVED',JSON.stringify({overrideId:row.id,requesterId:row.requested_by_user_id,customerId:row.customer_id,stationId:row.station_id,reason})]);
    await client.query('COMMIT');return res.json({success:true,override:data});
  }catch(e){try{await client.query('ROLLBACK')}catch{};console.error('[Override Approval]',e);return res.status(503).json({success:false,error:'Override approval was not committed.'});}
  finally{client.release();}
});


// Server-authoritative second-plate and photo spot-check workflows.
// Every action is tied to the original committed scan, the authenticated station,
// and a one-time idempotency key. Browser state is never treated as financial authority.
app.post('/api/scans/:scanId/second-plate', scanRateLimiter, requireAuth(['stand_staff', 'restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const scanId = String(req.params.scanId || '').trim();
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (!/^scan_[A-Za-z0-9_-]{8,64}$/.test(scanId) || !/^[A-Za-z0-9:_-]{12,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'A valid scan and idempotency key are required.' });
  }
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Second-plate authorization requires PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['second-plate:' + user.restaurantCode + ':' + idempotencyKey]);
    const prior = await client.query("SELECT data FROM ledger_entries WHERE idempotency_key=$1", ['extra:' + idempotencyKey]);
    if (prior.rows[0]) {
      const eventRow = await client.query('SELECT data,customer_id FROM scan_events WHERE id=$1 AND restaurant_code=$2', [scanId, user.restaurantCode]);
      if (!eventRow.rows[0] || prior.rows[0].data?.scanEventId !== scanId || prior.rows[0].data?.staffId !== user.userId) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Idempotency key is already bound to a different scan or operator.' });
      }
      const customerId = eventRow.rows[0]?.customer_id;
      const checkpoint = customerId ? await client.query('SELECT balance,cutoff_timestamp FROM balance_checkpoints WHERE customer_id=$1 ORDER BY cutoff_timestamp DESC LIMIT 1', [customerId]) : { rows: [] };
      const cutoff = checkpoint.rows[0]?.cutoff_timestamp || new Date(0);
      const delta = customerId ? await client.query('SELECT COALESCE(SUM(plates_delta),0)::int AS delta FROM ledger_entries WHERE customer_id=$1 AND timestamp>$2', [customerId, cutoff]) : { rows: [{ delta: 0 }] };
      await client.query('COMMIT');
      return res.json({ success: true, idempotent: true, scanEvent: eventRow.rows[0]?.data || null,
        ledgerEntry: prior.rows[0].data,
        balanceAfter: Number(checkpoint.rows[0]?.balance || 0) + Number(delta.rows[0]?.delta || 0) });
    }
    const found = await client.query('SELECT data,status,customer_id,station_id FROM scan_events WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [scanId, user.restaurantCode]);
    const row = found.rows[0];
    const event = row?.data;
    if (!row || !event || !['approved', 'warning_confirmed'].includes(row.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Only a currently committed scan can receive a second plate.' });
    }
    if (user.role === 'stand_staff' && (!user.stationId || user.stationId !== row.station_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'This operator is not assigned to the scan station.' });
    }
    if (event.isGracePlate || Number(event.platesDeducted) !== 1 || event.isSecondPlateAdded) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'This scan is not eligible for another plate.' });
    }
    const customerResult = await client.query('SELECT id,data FROM customers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [row.customer_id, user.restaurantCode]);
    if (!customerResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }
    const checkpoint = await client.query('SELECT balance,cutoff_timestamp FROM balance_checkpoints WHERE customer_id=$1 ORDER BY cutoff_timestamp DESC LIMIT 1', [row.customer_id]);
    const cutoff = checkpoint.rows[0]?.cutoff_timestamp || new Date(0);
    const delta = await client.query('SELECT COALESCE(SUM(plates_delta),0)::int AS delta FROM ledger_entries WHERE customer_id=$1 AND timestamp>$2', [row.customer_id, cutoff]);
    const balance = Number(checkpoint.rows[0]?.balance || 0) + Number(delta.rows[0]?.delta || 0);
    if (balance < 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Insufficient balance for a second plate.' });
    }
    const restaurant = (serverDbState?.restaurants || []).find((r: any) => r.code === user.restaurantCode);
    const plan = (serverDbState?.plans || []).find((p: any) => p.id === restaurant?.planId) || (serverDbState?.plans || [])[0];
    const terms = { ...(plan?.terms || {}), ...(restaurant?.termsOverride || {}) };
    const windowMinutes = Math.max(1, Number(terms.servingWindowMinutes || 120));
    const plateLimit = Math.max(1, Number(terms.plateLimitPerWindow || 3));
    const recent = await client.query(`SELECT data FROM scan_events WHERE customer_id=$1 AND restaurant_code=$2 AND created_at >= NOW() - ($3 * INTERVAL '1 minute') FOR UPDATE`, [row.customer_id, user.restaurantCode, windowMinutes]);
    const served = recent.rows.reduce((sum: number, r: any) => sum + (['approved','warning_confirmed'].includes(r.data?.status) ? Number(r.data?.platesDeducted || 0) : 0), 0);
    if (served + 1 > plateLimit) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'The second plate would exceed the serving-window limit.' });
    }
    const now = new Date();
    const ledgerId = 'led_' + crypto.randomUUID();
    const ledgerEntry = {
      id: ledgerId, customerId: row.customer_id, restaurantCode: user.restaurantCode,
      type: 'extra', platesDelta: -1, timestamp: now.toISOString(), scanPointId: row.station_id,
      staffId: user.userId, scanEventId: scanId, reference: 'SECOND-PLATE-' + event.memberNo,
      reason: 'Second plate authorized on active scan', idempotencyKey: 'extra:' + idempotencyKey,
      reversalOfId: undefined,
    };
    await client.query(
      "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'extra',-1,$4,$5,$6)",
      [ledgerId, user.restaurantCode, row.customer_id, 'extra:' + idempotencyKey, now, JSON.stringify(ledgerEntry)]
    );
    event.platesDeducted = 2;
    event.isSecondPlateAdded = true;
    event.secondPlateAuthorizedAt = now.toISOString();
    event.secondPlateAuthorizedBy = user.userId;
    event.secondPlateIdempotencyKey = idempotencyKey;
    await client.query('UPDATE scan_events SET data=$2 WHERE id=$1', [scanId, JSON.stringify(event)]);
    await client.query(
      'INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['aud_' + crypto.randomUUID(), user.restaurantCode, user.userId, 'SECOND_PLATE_AUTHORIZED',
        JSON.stringify({ scanId, customerId: row.customer_id, stationId: row.station_id, actorRole: user.role, timestamp: now.toISOString() })]
    );
    await client.query('COMMIT');
    if (Array.isArray(serverDbState?.ledgerEntries)) serverDbState.ledgerEntries.push(ledgerEntry);
    if (Array.isArray(serverDbState?.scanEvents)) {
      const cached = serverDbState.scanEvents.find((x: any) => x.id === scanId);
      if (cached) Object.assign(cached, event);
    }
    return res.json({ success: true, scanEvent: event, ledgerEntry, balanceAfter: balance - 1 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Second Plate] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Second plate was not committed. Retry with the same idempotency key.' });
  } finally { client.release(); }
});

app.post('/api/scans/:scanId/photo-check', scanRateLimiter, requireAuth(['stand_staff', 'restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const scanId = String(req.params.scanId || '').trim();
  const result = req.body?.result;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (!/^scan_[A-Za-z0-9_-]{8,64}$/.test(scanId) || !['matched','rejected'].includes(result) ||
      !/^[A-Za-z0-9:_-]{12,128}$/.test(idempotencyKey) || reason.length > 300) {
    return res.status(400).json({ success: false, error: 'A valid photo-check result and idempotency key are required.' });
  }
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Photo verification requires PostgreSQL.' });
  const client = await pool.connect();
  let reversalForCache: any = null;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['photo-check:' + user.restaurantCode + ':' + idempotencyKey]);
    const found = await client.query('SELECT data,status,customer_id,station_id FROM scan_events WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [scanId, user.restaurantCode]);
    const row = found.rows[0];
    const event = row?.data;
    if (!row || !event) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Scan event not found.' });
    }
    if (user.role === 'stand_staff' && (!user.stationId || user.stationId !== row.station_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'This operator is not assigned to the scan station.' });
    }
    if (event.photoCheckResult === result && event.photoCheckedBy === user.userId && event.photoCheckIdempotencyKey === idempotencyKey) {
      const checkpoint = await client.query('SELECT balance,cutoff_timestamp FROM balance_checkpoints WHERE customer_id=$1 ORDER BY cutoff_timestamp DESC LIMIT 1', [row.customer_id]);
      const cutoff = checkpoint.rows[0]?.cutoff_timestamp || new Date(0);
      const delta = await client.query('SELECT COALESCE(SUM(plates_delta),0)::int AS delta FROM ledger_entries WHERE customer_id=$1 AND timestamp>$2', [row.customer_id, cutoff]);
      const ledgerResult = result === 'rejected'
        ? await client.query("SELECT data FROM ledger_entries WHERE idempotency_key=$1", ['photo-reject:' + idempotencyKey])
        : { rows: [] };
      await client.query('COMMIT');
      return res.json({ success: true, idempotent: true, scanEvent: event, ledgerEntry: ledgerResult.rows[0]?.data || null,
        balanceAfter: Number(checkpoint.rows[0]?.balance || 0) + Number(delta.rows[0]?.delta || 0), reversed: result === 'rejected' });
    }
    if (!event.photoCheckRequired || event.photoCheckResult !== 'none' ||
        !['approved','warning_confirmed'].includes(row.status) || event.isGracePlate) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'This scan is not awaiting an eligible photo check.' });
    }
    const now = new Date();
    if (result === 'rejected') {
      const original = await client.query(
        "SELECT id FROM ledger_entries WHERE customer_id=$1 AND type='scan' AND data->>'timestamp'=$2 AND data->>'scanPointId'=$3 FOR UPDATE",
        [row.customer_id, event.timestamp, event.scanPointId]
      );
      if (!original.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Original scan ledger entry was not found; no automatic balance change was made.' });
      }
      const reversalId = 'led_' + crypto.randomUUID();
      const reversal = {
        id: reversalId, customerId: row.customer_id, restaurantCode: user.restaurantCode,
        type: 'reversal', platesDelta: 1, timestamp: now.toISOString(), scanPointId: row.station_id,
        staffId: user.userId, reason: 'Photo spot-check rejected: ' + (reason || 'photo did not match'),
        reference: 'PHOTO-REJECT-' + scanId, reversalOfId: original.rows[0].id,
        idempotencyKey: 'photo-reject:' + idempotencyKey,
      };
      await client.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'reversal',1,$4,$5,$6)",
        [reversalId, user.restaurantCode, row.customer_id, 'photo-reject:' + idempotencyKey, now, JSON.stringify(reversal)]
      );
      reversalForCache = reversal;
      event.status = 'rejected_photo';
      event.platesDeducted = 0;
      event.photoCheckResult = 'rejected';
      event.photoCheckIdempotencyKey = idempotencyKey;
      event.photoCheckReason = reason || 'photo_mismatch';
      event.photoCheckedAt = now.toISOString();
      event.photoCheckedBy = user.userId;
      await client.query("UPDATE scan_events SET status='rejected_photo',data=$2 WHERE id=$1", [scanId, JSON.stringify(event)]);
    } else {
      event.photoCheckResult = 'matched';
      event.photoCheckIdempotencyKey = idempotencyKey;
      event.photoCheckedAt = now.toISOString();
      event.photoCheckedBy = user.userId;
      await client.query('UPDATE scan_events SET data=$2 WHERE id=$1', [scanId, JSON.stringify(event)]);
    }
    await client.query(
      'INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['aud_' + crypto.randomUUID(), user.restaurantCode, user.userId,
        result === 'matched' ? 'PHOTO_CHECK_MATCHED' : 'PHOTO_CHECK_REJECTED',
        JSON.stringify({ scanId, customerId: row.customer_id, result, reason, actorRole: user.role, timestamp: now.toISOString() })]
    );
    const balanceCheckpoint = await client.query('SELECT balance,cutoff_timestamp FROM balance_checkpoints WHERE customer_id=$1 ORDER BY cutoff_timestamp DESC LIMIT 1', [row.customer_id]);
    const balanceCutoff = balanceCheckpoint.rows[0]?.cutoff_timestamp || new Date(0);
    const balanceDelta = await client.query('SELECT COALESCE(SUM(plates_delta),0)::int AS delta FROM ledger_entries WHERE customer_id=$1 AND timestamp>$2', [row.customer_id, balanceCutoff]);
    const balanceAfter = Number(balanceCheckpoint.rows[0]?.balance || 0) + Number(balanceDelta.rows[0]?.delta || 0);
    await client.query('COMMIT');
    if (reversalForCache && Array.isArray(serverDbState?.ledgerEntries)) serverDbState.ledgerEntries.push(reversalForCache);
    if (Array.isArray(serverDbState?.scanEvents)) {
      const cached = serverDbState.scanEvents.find((x: any) => x.id === scanId);
      if (cached) Object.assign(cached, event);
    }
    return res.json({ success: true, scanEvent: event, ledgerEntry: reversalForCache, balanceAfter, reversed: result === 'rejected' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Photo Check] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Photo check was not committed.' });
  } finally { client.release(); }
});


// Transactional customer registration and approval authority.
async function writeApprovalAudit(client: any, restaurantCode: string, user: UserSession, action: string, details: any) {
  await client.query(
    'INSERT INTO audit_logs (id, restaurant_code, user_id, action, data) VALUES ($1,$2,$3,$4,$5)',
    ['aud_' + crypto.randomUUID(), restaurantCode, user.userId, action,
      JSON.stringify({ actorRole: user.role, actorName: user.username, details, timestamp: new Date().toISOString() })]
  );
}

function updateApprovalCache(customer: any, approval: any) {
  if (Array.isArray(serverDbState?.customers)) {
    const i = serverDbState.customers.findIndex((x: any) => x.id === customer.id);
    if (i < 0) serverDbState.customers.push(customer); else serverDbState.customers[i] = customer;
  }
  if (Array.isArray(serverDbState?.pendingApprovals)) {
    const i = serverDbState.pendingApprovals.findIndex((x: any) => x.id === approval.id);
    if (i < 0) serverDbState.pendingApprovals.unshift(approval); else serverDbState.pendingApprovals[i] = approval;
  }
}

app.post('/api/approvals/registration', apiRateLimiter, requireAuth(['stand_staff', 'restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  const idType = typeof b.idType === 'string' ? b.idType.trim() : 'Student ID';
  const idNumber = typeof b.idNumber === 'string' ? b.idNumber.trim() : '';
  const plates = Number(b.platesRequested);
  const amount = Number(b.amountRwf);
  const reference = typeof b.paymentReference === 'string' ? b.paymentReference.trim() : '';
  const stationId = typeof b.stationId === 'string' ? b.stationId.trim() : '';
  if (name.length < 2 || name.length > 120 || phone.length < 7 || phone.length > 32 ||
      idNumber.length < 3 || idNumber.length > 128 || !Number.isSafeInteger(plates) || plates < 1 || plates > 10000 ||
      !Number.isSafeInteger(amount) || amount < 1 || amount > 10000000 ||
      !['cash', 'momo', 'mtn_momo', 'airtel_money', 'bank_transfer'].includes(b.paymentMethod) ||
      reference.length < 4 || reference.length > 128 || !stationId) {
    return res.status(400).json({ success: false, error: 'Valid customer identity, station, plate quantity, amount, payment method and reference are required.' });
  }
  if (user.role === 'stand_staff' && (!user.stationId || user.stationId !== stationId)) {
    return res.status(403).json({ success: false, error: 'Staff account is not assigned to this station.' });
  }
  const station = (serverDbState?.scanPoints || []).find((p: any) =>
    p.id === stationId && p.restaurantCode === user.restaurantCode && p.status === 'active' && p.isPaired
  );
  if (!station) return res.status(403).json({ success: false, error: 'Station is not paired and active.' });
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Registration requires PostgreSQL.' });
  const idHash = crypto.createHash('sha256').update('ID_SALT_RESTOPASS_RWANDA:' + idType + ':' + idNumber.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const referenceLock = 'approval-ref:' + user.restaurantCode + ':' + crypto.createHash('sha256').update(reference.toUpperCase()).digest('hex');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [referenceLock]);
    const duplicateRef = await client.query("SELECT id FROM pending_approvals WHERE restaurant_code=$1 AND data->>'paymentReference'=$2 UNION ALL SELECT id FROM payments WHERE restaurant_code=$1 AND data->>'reference'=$2 LIMIT 1", [user.restaurantCode, reference]);
    if (duplicateRef.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Payment reference has already been submitted.' }); }
    const studentReg = typeof b.studentProfile?.registrationNumber === 'string' ? b.studentProfile.registrationNumber.trim() : '';
    const identityLocks = [
      'customer-phone:' + user.restaurantCode + ':' + phone.replace(/\s+/g, ''),
      'customer-id:' + user.restaurantCode + ':' + idHash,
      ...(studentReg ? ['customer-student:' + user.restaurantCode + ':' + studentReg.toUpperCase()] : []),
    ].sort();
    for (const identityLock of identityLocks) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identityLock]);
    }
    const duplicate = await client.query(
      "SELECT member_no FROM customers WHERE restaurant_code=$1 AND (phone=$2 OR data->>'idHash'=$3 OR ($4<>'' AND data->'studentProfile'->>'registrationNumber'=$4)) LIMIT 1",
      [user.restaurantCode, phone, idHash, typeof b.studentProfile?.registrationNumber === 'string' ? b.studentProfile.registrationNumber.trim() : '']
    );
    if (duplicate.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Customer identity already exists as #' + duplicate.rows[0].member_no + '.' }); }
    const restaurant = (serverDbState?.restaurants || []).find((r: any) => r.code === user.restaurantCode && r.status === 'active');
    if (!restaurant) { await client.query('ROLLBACK'); return res.status(403).json({ success: false, error: 'Restaurant is inactive.' }); }
    const pkg = b.packageId ? (serverDbState?.packages || []).find((p: any) => p.id === b.packageId && p.restaurantCode === user.restaurantCode) : null;
    if (b.packageId && (!pkg || Number(pkg.platesCount) !== plates || Number(pkg.priceRwf) !== amount)) {
      await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Package price or plate count does not match server records.' });
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['member-sequence:' + user.restaurantCode]);
    // Timestamps are not a reliable sequence: multiple registrations can share
    // the same millisecond and UUID ordering is unrelated to member-number order.
    // The advisory lock above serializes writers; MAX numeric member_no prevents
    // reuse even when created_at values tie or an older record is inserted later.
    const latest = await client.query(
      "SELECT COALESCE(MAX(member_no::numeric), 28490) AS last_no FROM customers WHERE restaurant_code=$1 AND member_no ~ '^[0-9]+$'",
      [user.restaurantCode]
    );
    const lastNo = Number(latest.rows[0]?.last_no ?? 28490);
    if (!Number.isSafeInteger(lastNo) || lastNo < 28490) {
      throw new Error('Customer member-number sequence is invalid.');
    }
    const memberNo = String(lastNo + 1);
    const now = new Date().toISOString();
    const customerId = 'cust_' + crypto.randomUUID();
    const approvalId = 'appr_' + crypto.randomUUID();
    const customer = {
      id: customerId, memberNo, restaurantCode: user.restaurantCode, branchId: b.branchId || station.branchId,
      branchName: b.branchName || station.branchName, name, phone,
      photoUrl: normalizePrivatePhotoUrl(b.photoUrl),
      idType, idHash, idNumberMasked: idNumber.length > 5 ? idNumber.slice(0, 5) + '****' : '****',
      isStudent: Boolean(b.isStudent), studentProfile: b.isStudent && b.studentProfile && typeof b.studentProfile === 'object' ? b.studentProfile : undefined,
      cardVersion: 1, keyVersion: 1, cardStatus: 'active', pinHash: null, hasCustomPin: false,
      provisionalStatus: 'pending_approval', activationStatus: 'pending_approval', cardReadyForPrint: false,
      failedLoginAttempts: 0, gracePlatesConsumed: 0, gracePlatesRemaining: 3, pendingApprovalId: approvalId,
      createdAt: now, onboardingToken: 'OB-' + memberNo + '-PROV', consentSigned: true
    };
    const approval = {
      id: approvalId, restaurantCode: user.restaurantCode, branchId: customer.branchId, branchName: customer.branchName,
      type: 'new_customer', customerId, customerName: name, customerPhone: phone, customerPhoto: customer.photoUrl,
      memberNo, packageId: b.packageId || undefined, packageName: pkg?.name || (plates + ' Custom Plates'),
      platesRequested: plates, amountRwf: amount, paymentMethod: b.paymentMethod, paymentReference: reference,
      registeredByStaffId: user.userId, registeredByStaffName: user.username, stationId,
      stationName: station.name || station.stationName || 'Reception POS Desk',
      gracePlatesAllowed: 3, gracePlatesConsumed: 0, createdAt: now, status: 'pending',
      requiresSuperAdminCoSign: plates > 120, coSignStatus: plates > 120 ? 'awaiting_boss' : 'not_required'
    };
    await client.query(
      'INSERT INTO customers (id,restaurant_code,member_no,name,phone,card_status,card_version,key_version,is_student,pin_hash,photo_url,data) VALUES ($1,$2,$3,$4,$5,$6,1,1,$7,NULL,$8,$9)',
      [customerId, user.restaurantCode, memberNo, name, phone, 'active', Boolean(b.isStudent), customer.photoUrl, JSON.stringify(customer)]
    );
    await client.query(
      'INSERT INTO pending_approvals (id,restaurant_code,customer_id,type,status,data) VALUES ($1,$2,$3,$4,$5,$6)',
      [approvalId, user.restaurantCode, customerId, 'new_customer', 'pending', JSON.stringify(approval)]
    );
    await writeApprovalAudit(client, user.restaurantCode, user, 'PROVISIONAL_CUSTOMER_REGISTERED', { approvalId, customerId, memberNo, plates, amountRwf: amount });
    await client.query('COMMIT');
    updateApprovalCache(customer, approval);
    return res.status(201).json({ success: true, customer, approval });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Approval Registration] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Registration was not committed. Retry after checking the approval queue.' });
  } finally { client.release(); }
});

async function commitPendingApproval(client: any, approval: any, customer: any, actor: UserSession) {
  const purchaseKey = 'approval:' + approval.id + ':purchase';
  const prior = await client.query('SELECT id FROM ledger_entries WHERE idempotency_key=$1 FOR UPDATE', [purchaseKey]);
  if (prior.rows[0]) throw new Error('APPROVAL_ALREADY_CREDITED');
  const now = new Date();
  const grace = Math.max(0, Math.min(Number(approval.gracePlatesConsumed || 0), Number(approval.gracePlatesAllowed || 3)));
  const purchaseId = 'led_' + crypto.randomUUID();
  const purchase = {
    id: purchaseId, customerId: customer.id, restaurantCode: approval.restaurantCode, type: 'purchase',
    platesDelta: Number(approval.platesRequested), timestamp: now.toISOString(), staffId: actor.userId,
    reason: 'Approved purchase: +' + approval.platesRequested + ' plates', reference: approval.paymentReference,
    idempotencyKey: purchaseKey, amountRwf: Number(approval.amountRwf), approvalId: approval.id
  };
  await client.query(
    "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,amount_rwf,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'purchase',$4,$5,$6,$7,$8)",
    [purchaseId, approval.restaurantCode, customer.id, Number(approval.platesRequested), Number(approval.amountRwf), purchaseKey, now, JSON.stringify(purchase)]
  );
  let graceEntry: any = null;
  if (grace > 0) {
    const graceKey = 'approval:' + approval.id + ':grace';
    graceEntry = {
      id: 'led_' + crypto.randomUUID(), customerId: customer.id, restaurantCode: approval.restaurantCode,
      type: 'scan', platesDelta: -grace, timestamp: now.toISOString(), staffId: actor.userId,
      reason: 'Reconcile grace meals consumed while approval was pending', reference: 'GRACE-' + approval.id,
      idempotencyKey: graceKey, approvalId: approval.id
    };
    await client.query(
      "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'scan',$4,$5,$6,$7)",
      [graceEntry.id, approval.restaurantCode, customer.id, -grace, graceKey, now, JSON.stringify(graceEntry)]
    );
  }
  const payment = {
    id: 'pay_' + crypto.randomUUID(), restaurantCode: approval.restaurantCode, customerId: customer.id,
    customerName: customer.name, memberNo: customer.memberNo, packageId: approval.packageId,
    platesAdded: Number(approval.platesRequested), amountRwf: Number(approval.amountRwf),
    paymentMethod: approval.paymentMethod, reference: approval.paymentReference,
    adminStaffId: actor.userId, adminStaffName: actor.username, isProvisional: false,
    approvalId: approval.id, timestamp: now.toISOString()
  };
  await client.query('INSERT INTO payments (id,restaurant_code,customer_id,amount_rwf,data) VALUES ($1,$2,$3,$4,$5)',
    [payment.id, approval.restaurantCode, customer.id, Number(approval.amountRwf), JSON.stringify(payment)]);
  approval.status = 'approved';
  approval.gracePlatesConsumed = grace;
  approval.reviewedAt = now.toISOString();
  approval.reviewedByAdminName = approval.bossApprovedByName || actor.username;
  approval.committedAt = now.toISOString();
  await client.query("UPDATE pending_approvals SET status='approved',data=$2,updated_at=NOW() WHERE id=$1",
    [approval.id, JSON.stringify(approval)]);
  const remainingPending = await client.query(
    "SELECT data FROM pending_approvals WHERE customer_id=$1 AND status='pending' ORDER BY created_at ASC FOR UPDATE",
    [customer.id]
  );
  const remainingGraceUsed = remainingPending.rows.reduce((sum: number, row: any) =>
    sum + Number(row.data?.gracePlatesConsumed || 0), 0);
  customer.provisionalStatus = 'approved';
  customer.cardStatus = 'active';
  customer.gracePlatesConsumed = remainingGraceUsed;
  customer.gracePlatesRemaining = Math.max(0, 3 - remainingGraceUsed);
  customer.pendingApprovalId = remainingPending.rows[0]?.data?.id;
  if (approval.type === 'new_customer') {
    customer.activationStatus = customer.hasCustomPin ? 'active' : 'ready_for_activation';
    customer.cardReadyForPrint = true;
  }
  await client.query('UPDATE customers SET card_status=$2,data=$3,updated_at=NOW() WHERE id=$1',
    [customer.id, customer.cardStatus, JSON.stringify(customer)]);
  await writeApprovalAudit(client, approval.restaurantCode, actor, 'APPROVAL_ENTITLEMENT_COMMITTED',
    { approvalId: approval.id, customerId: customer.id, plates: approval.platesRequested, graceConsumed: grace });
  return { customer, approval, payment, purchase, graceEntry };
}

app.post('/api/approvals/topup', apiRateLimiter, requireAuth(['stand_staff', 'restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const b = req.body || {};
  const customerId = typeof b.customerId === 'string' ? b.customerId.trim() : '';
  const plates = Number(b.platesRequested);
  const amount = Number(b.amountRwf);
  const reference = typeof b.paymentReference === 'string' ? b.paymentReference.trim() : '';
  const stationId = typeof b.stationId === 'string' ? b.stationId.trim() : '';
  if (!customerId || !Number.isSafeInteger(plates) || plates < 1 || plates > 10000 ||
      !Number.isSafeInteger(amount) || amount < 1 || amount > 10000000 ||
      !['cash', 'momo', 'mtn_momo', 'airtel_money', 'bank_transfer'].includes(b.paymentMethod) ||
      reference.length < 4 || reference.length > 128 || !stationId) {
    return res.status(400).json({ success: false, error: 'Valid customer, station, quantity, amount, payment method and reference are required.' });
  }
  if (user.role === 'stand_staff' && (!user.stationId || user.stationId !== stationId)) {
    return res.status(403).json({ success: false, error: 'Staff account is not assigned to this station.' });
  }
  const station = (serverDbState?.scanPoints || []).find((p: any) => p.id === stationId && p.restaurantCode === user.restaurantCode && p.status === 'active' && p.isPaired);
  if (!station) return res.status(403).json({ success: false, error: 'Station is not paired and active.' });
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Pending top-ups require PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lockKey = 'approval-ref:' + user.restaurantCode + ':' + crypto.createHash('sha256').update(reference.toUpperCase()).digest('hex');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
    const duplicateRef = await client.query("SELECT id FROM pending_approvals WHERE restaurant_code=$1 AND data->>'paymentReference'=$2 UNION ALL SELECT id FROM payments WHERE restaurant_code=$1 AND data->>'reference'=$2 LIMIT 1", [user.restaurantCode, reference]);
    if (duplicateRef.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Payment reference has already been submitted.' }); }
    const cr = await client.query('SELECT data,card_status FROM customers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [customerId, user.restaurantCode]);
    if (!cr.rows[0] || cr.rows[0].card_status !== 'active') { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Active customer not found in this restaurant.' }); }
    const customer = cr.rows[0].data;
    const pkg = b.packageId ? (serverDbState?.packages || []).find((p: any) => p.id === b.packageId && p.restaurantCode === user.restaurantCode) : null;
    if (b.packageId && (!pkg || Number(pkg.platesCount) !== plates || Number(pkg.priceRwf) !== amount)) {
      await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Package does not match server-side price and plate count.' });
    }
    const now = new Date().toISOString();
    const approvalId = 'appr_topup_' + crypto.randomUUID();
    const approval = {
      id: approvalId, restaurantCode: user.restaurantCode, branchId: b.branchId || customer.branchId,
      branchName: b.branchName || customer.branchName, type: 'balance_topup', customerId,
      customerName: customer.name, customerPhone: customer.phone, customerPhoto: customer.photoUrl,
      memberNo: customer.memberNo, packageId: b.packageId || undefined,
      packageName: pkg?.name || (plates + ' Custom Plates'), platesRequested: plates, amountRwf: amount,
      paymentMethod: b.paymentMethod, paymentReference: reference, registeredByStaffId: user.userId,
      registeredByStaffName: user.username, stationId, stationName: station.name || 'Reception POS Desk',
      gracePlatesAllowed: 3, gracePlatesConsumed: 0, createdAt: now, status: 'pending',
      requiresSuperAdminCoSign: plates > 120, coSignStatus: plates > 120 ? 'awaiting_boss' : 'not_required'
    };
    const pendingRows = await client.query(
      "SELECT data FROM pending_approvals WHERE customer_id=$1 AND status='pending' ORDER BY created_at ASC FOR UPDATE",
      [customerId]
    );
    const pendingGrace = pendingRows.rows.reduce((sum: number, row: any) => sum + Number(row.data?.gracePlatesConsumed || 0), 0);
    customer.provisionalStatus = customer.provisionalStatus || 'approved';
    customer.gracePlatesConsumed = Math.max(Number(customer.gracePlatesConsumed || 0), pendingGrace);
    customer.gracePlatesRemaining = Math.max(0, 3 - customer.gracePlatesConsumed);
    customer.pendingApprovalId = customer.pendingApprovalId || approvalId;
    await client.query('UPDATE customers SET data=$2,updated_at=NOW() WHERE id=$1', [customerId, JSON.stringify(customer)]);
    await client.query('INSERT INTO pending_approvals (id,restaurant_code,customer_id,type,status,data) VALUES ($1,$2,$3,$4,$5,$6)',
      [approvalId, user.restaurantCode, customerId, 'balance_topup', 'pending', JSON.stringify(approval)]);
    await writeApprovalAudit(client, user.restaurantCode, user, 'PROVISIONAL_TOPUP_SUBMITTED', { approvalId, customerId, plates, amountRwf: amount, paymentReference: reference });
    await client.query('COMMIT');
    updateApprovalCache(customer, approval);
    return res.status(201).json({ success: true, customer, approval });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Pending Top-up] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Pending top-up was not committed.' });
  } finally { client.release(); }
});

app.post('/api/approvals/:approvalId/approve', apiRateLimiter, requireAuth(['restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Approval requires PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const initial = await client.query('SELECT customer_id FROM pending_approvals WHERE id=$1 AND restaurant_code=$2', [req.params.approvalId, user.restaurantCode]);
    if (!initial.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Approval not found.' }); }
    // Global lock order is customer row, then approval rows, matching scanner grace-meal transactions.
    const cr = await client.query('SELECT data FROM customers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [initial.rows[0].customer_id, user.restaurantCode]);
    if (!cr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Customer not found.' }); }
    const result = await client.query('SELECT data FROM pending_approvals WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [req.params.approvalId, user.restaurantCode]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Approval not found.' }); }
    const approval = result.rows[0].data;
    if (approval.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Approval is no longer pending.' }); }
    const customer = cr.rows[0].data;
    if (Number(approval.platesRequested) > 120) {
      approval.requiresSuperAdminCoSign = true;
      approval.coSignStatus = 'pending_super_admin';
      approval.bossApprovedAt = new Date().toISOString();
      approval.bossApprovedByUserId = user.userId;
      approval.bossApprovedByName = user.username;
      await client.query('UPDATE pending_approvals SET data=$2,updated_at=NOW() WHERE id=$1', [approval.id, JSON.stringify(approval)]);
      await writeApprovalAudit(client, user.restaurantCode, user, 'BOSS_APPROVED_AWAITING_COSIGN', { approvalId: approval.id, plates: approval.platesRequested });
      await client.query('COMMIT');
      updateApprovalCache(customer, approval);
      return res.json({ success: true, awaitingCoSign: true, approval });
    }
    const committed = await commitPendingApproval(client, approval, customer, user);
    await client.query('COMMIT');
    updateApprovalCache(committed.customer, committed.approval);
    if (Array.isArray(serverDbState?.payments)) serverDbState.payments.unshift(committed.payment);
    if (Array.isArray(serverDbState?.ledgerEntries)) {
      serverDbState.ledgerEntries.push(committed.purchase);
      if (committed.graceEntry) serverDbState.ledgerEntries.push(committed.graceEntry);
    }
    return res.json({ success: true, customer: sanitizeCustomerForResponse(committed.customer), approval: committed.approval, payment: committed.payment, ledgerEntries: [committed.purchase, ...(committed.graceEntry ? [committed.graceEntry] : [])] });
  } catch (error: any) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error?.message === 'APPROVAL_ALREADY_CREDITED') return res.status(409).json({ success: false, error: 'Approval was already credited.' });
    console.error('[Approval Commit] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Approval was not committed; retry after checking the approval queue.' });
  } finally { client.release(); }
});

app.post('/api/approvals/:approvalId/cosign', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  const user = req.user!;
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Co-signing requires PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const initial = await client.query('SELECT customer_id FROM pending_approvals WHERE id=$1', [req.params.approvalId]);
    if (!initial.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Approval not found.' }); }
    const cr = await client.query('SELECT data FROM customers WHERE id=$1 FOR UPDATE', [initial.rows[0].customer_id]);
    if (!cr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Customer not found.' }); }
    const result = await client.query('SELECT data FROM pending_approvals WHERE id=$1 FOR UPDATE', [req.params.approvalId]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Approval not found.' }); }
    const approval = result.rows[0].data;
    if (approval.status !== 'pending' || Number(approval.platesRequested) <= 120 ||
        !approval.bossApprovedAt || approval.coSignStatus !== 'pending_super_admin') {
      await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Request is not awaiting a valid high-value co-signature.' });
    }
    if (approval.bossApprovedByUserId === user.userId) {
      await client.query('ROLLBACK'); return res.status(403).json({ success: false, error: 'Boss approver and co-signer must be different authenticated principals.' });
    }
    approval.coSignStatus = 'co_signed';
    approval.coSignedAt = new Date().toISOString();
    approval.coSignedBySuperAdminUserId = user.userId;
    approval.coSignedBySuperAdminName = user.username;
    const committed = await commitPendingApproval(client, approval, cr.rows[0].data, user);
    await client.query('COMMIT');
    updateApprovalCache(committed.customer, committed.approval);
    if (Array.isArray(serverDbState?.payments)) serverDbState.payments.unshift(committed.payment);
    if (Array.isArray(serverDbState?.ledgerEntries)) {
      serverDbState.ledgerEntries.push(committed.purchase);
      if (committed.graceEntry) serverDbState.ledgerEntries.push(committed.graceEntry);
    }
    return res.json({ success: true, customer: sanitizeCustomerForResponse(committed.customer), approval: committed.approval, payment: committed.payment, ledgerEntries: [committed.purchase, ...(committed.graceEntry ? [committed.graceEntry] : [])] });
  } catch (error: any) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error?.message === 'APPROVAL_ALREADY_CREDITED') return res.status(409).json({ success: false, error: 'Approval was already credited.' });
    console.error('[Approval Co-sign] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Co-signature was not committed.' });
  } finally { client.release(); }
});

app.post('/api/approvals/:approvalId/reject', apiRateLimiter, requireAuth(['restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!reason) return res.status(400).json({ success: false, error: 'A rejection reason is required.' });
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Rejection requires PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const initial = await client.query('SELECT customer_id FROM pending_approvals WHERE id=$1 AND restaurant_code=$2', [req.params.approvalId, user.restaurantCode]);
    if (!initial.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Approval not found.' }); }
    const cr = await client.query('SELECT data FROM customers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [initial.rows[0].customer_id, user.restaurantCode]);
    if (!cr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Customer not found.' }); }
    const result = await client.query('SELECT data FROM pending_approvals WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [req.params.approvalId, user.restaurantCode]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Approval not found.' }); }
    const approval = result.rows[0].data;
    if (approval.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Approval is no longer pending.' }); }
    const customer = cr.rows[0].data;
    approval.status = 'rejected';
    approval.rejectionReason = reason;
    approval.reviewedAt = new Date().toISOString();
    approval.reviewedByAdminName = user.username;
    if (approval.type === 'new_customer') {
      customer.provisionalStatus = 'rejected';
      customer.cardStatus = 'locked';
      customer.activationStatus = 'suspended';
      await client.query('UPDATE customers SET card_status=$2,data=$3,updated_at=NOW() WHERE id=$1', [customer.id, 'locked', JSON.stringify(customer)]);
    }
    await client.query("UPDATE pending_approvals SET status='rejected',data=$2,updated_at=NOW() WHERE id=$1", [approval.id, JSON.stringify(approval)]);
    await writeApprovalAudit(client, user.restaurantCode, user, 'APPROVAL_REJECTED', { approvalId: approval.id, reason });
    await client.query('COMMIT');
    updateApprovalCache(customer, approval);
    return res.json({ success: true, customer: sanitizeCustomerForResponse(customer), approval });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Approval Reject] Transaction failed:', error);
    return res.status(503).json({ success: false, error: 'Rejection was not committed.' });
  } finally { client.release(); }
});


/**
 * Customer-to-customer plate transfers.
 * Disabled by default. Enable only in a hosted staging environment after
 * staff/device validation and transfer-specific security review.
 */
app.post('/api/customer/transfers', apiRateLimiter, requireAuth(['customer']), async (req, res) => {
  if (process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED !== 'true') {
    return res.status(503).json({ success: false, code: 'CUSTOMER_TRANSFERS_DISABLED', error: 'Customer transfers are not enabled for this deployment.' });
  }
  const user = req.user!;
  const recipientMemberNo = typeof req.body?.recipientMemberNo === 'string' ? req.body.recipientMemberNo.trim() : '';
  const plates = Number(req.body?.plates);
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(recipientMemberNo) ||
      !Number.isSafeInteger(plates) || plates < 1 || plates > 20 ||
      !/^[A-Za-z0-9:_-]{12,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'Provide a valid recipient member number, 1–20 plates and a unique idempotency key.' });
  }
  if (!checkServerStudentEntitlement(user.userId, 'digital_plate_transfer').allowed) {
    return res.status(403).json({ success: false, code: 'TRANSFER_ENTITLEMENT_REQUIRED', error: 'Your account is not eligible to transfer plates.' });
  }
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Transfers require PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['customer-transfer:' + user.restaurantCode + ':' + idempotencyKey]);
    const prior = await client.query(
      'SELECT id,data FROM transfers WHERE restaurant_code=$1 AND idempotency_key=$2 FOR UPDATE',
      [user.restaurantCode, idempotencyKey]
    );
    if (prior.rows[0]) {
      const previous = prior.rows[0].data;
      if (previous.senderCustomerId !== user.userId || previous.recipientMemberNo !== recipientMemberNo || Number(previous.plates) !== plates) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Idempotency key is already bound to a different transfer.' });
      }
      await client.query('COMMIT');
      return res.json({ success: true, idempotent: true, transfer: previous });
    }
    const recipientResult = await client.query(
      'SELECT id,member_no,name,card_status FROM customers WHERE restaurant_code=$1 AND member_no=$2',
      [user.restaurantCode, recipientMemberNo]
    );
    const recipient = recipientResult.rows[0];
    if (!recipient || recipient.card_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Recipient was not found or is not active in this restaurant.' });
    }
    if (recipient.id === user.userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'You cannot transfer plates to yourself.' });
    }
    const ids = [user.userId, recipient.id].sort();
    const locked = await client.query(
      'SELECT id,member_no,name,card_status FROM customers WHERE restaurant_code=$1 AND id = ANY($2::varchar[]) ORDER BY id FOR UPDATE',
      [user.restaurantCode, ids]
    );
    if (locked.rows.length !== 2 || locked.rows.some((c: any) => c.card_status !== 'active')) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Both customer accounts must remain active.' });
    }
    const balanceResult = await client.query(
      'SELECT customer_id,COALESCE(SUM(plates_delta),0)::int AS balance FROM ledger_entries WHERE restaurant_code=$1 AND customer_id = ANY($2::varchar[]) GROUP BY customer_id',
      [user.restaurantCode, ids]
    );
    const balances = new Map<string, number>(balanceResult.rows.map((r: any) => [String(r.customer_id), Number(r.balance)] as [string, number]));
    const senderBalance = balances.get(user.userId) || 0;
    if (senderBalance < plates) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, code: 'INSUFFICIENT_BALANCE', error: 'Insufficient available plates.' });
    }
    const now = new Date();
    const transferId = 'tr_' + crypto.randomUUID();
    const sender = locked.rows.find((c: any) => c.id === user.userId);
    const transfer = {
      id: transferId, restaurantCode: user.restaurantCode, senderCustomerId: user.userId,
      senderMemberNo: sender?.member_no, senderName: sender?.name,
      recipientCustomerId: recipient.id, recipientMemberNo: recipient.member_no,
      recipientName: recipient.name, plates, status: 'completed',
      idempotencyKey, createdAt: now.toISOString(),
    };
    const senderEntry = {
      id: 'led_' + crypto.randomUUID(), customerId: user.userId, restaurantCode: user.restaurantCode,
      type: 'transfer_out', platesDelta: -plates, timestamp: now.toISOString(),
      reference: transferId, transferId, counterpartyCustomerId: recipient.id,
      idempotencyKey: 'transfer:' + transferId + ':debit',
    };
    const recipientEntry = {
      id: 'led_' + crypto.randomUUID(), customerId: recipient.id, restaurantCode: user.restaurantCode,
      type: 'transfer_in', platesDelta: plates, timestamp: now.toISOString(),
      reference: transferId, transferId, counterpartyCustomerId: user.userId,
      idempotencyKey: 'transfer:' + transferId + ':credit',
    };
    await client.query(
      'INSERT INTO transfers (id,restaurant_code,sender_customer_id,recipient_customer_id,plates,idempotency_key,data,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [transferId,user.restaurantCode,user.userId,recipient.id,plates,idempotencyKey,JSON.stringify(transfer),now]
    );
    for (const entry of [senderEntry, recipientEntry]) {
      await client.query(
        'INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [entry.id,user.restaurantCode,entry.customerId,entry.type,entry.platesDelta,entry.idempotencyKey,now,JSON.stringify(entry)]
      );
    }
    await client.query(
      'INSERT INTO audit_logs (id,restaurant_code,user_id,action,data) VALUES ($1,$2,$3,$4,$5)',
      ['aud_' + crypto.randomUUID(),user.restaurantCode,user.userId,'CUSTOMER_PLATE_TRANSFER',JSON.stringify({
        transferId,recipientCustomerId:recipient.id,plates,idempotencyKey,createdAt:now.toISOString()
      })]
    );
    await client.query('COMMIT');
    return res.status(201).json({ success: true, transfer, senderBalanceAfter: senderBalance - plates,
      recipientBalanceAfter: (balances.get(recipient.id) || 0) + plates });
  } catch (error: any) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error?.code === '23505') return res.status(409).json({ success: false, error: 'This transfer was already processed.' });
    console.error('[Customer Transfer] failed:', error);
    return res.status(503).json({ success: false, error: 'Transfer was not committed. Retry with the same idempotency key.' });
  } finally { client.release(); }
});


/**
 * Two-person financial exception authority.
 * Requests never mutate balances. A separate platform supervisor approves them,
 * and the compensating ledger entries plus source status change commit atomically.
 */
app.post('/api/financial-exceptions', apiRateLimiter, requireAuth(['restaurant_admin']), async (req, res) => {
  const user = req.user!;
  const type = req.body?.type;
  const sourceId = typeof req.body?.sourceId === 'string' ? req.body.sourceId.trim() : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (!['scan_reversal', 'transfer_reversal', 'cash_refund'].includes(type) ||
      !sourceId || sourceId.length > 64 || reason.length < 12 || reason.length > 500 ||
      !/^[A-Za-z0-9:_-]{12,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'A supported exception type, source ID, detailed reason and unique idempotency key are required.' });
  }
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Financial exceptions require PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prior = await client.query(
      'SELECT data,status FROM financial_exception_requests WHERE restaurant_code=$1 AND idempotency_key=$2 FOR UPDATE',
      [user.restaurantCode, idempotencyKey]
    );
    if (prior.rows[0]) {
      const priorException = prior.rows[0].data;
      if (priorException.type !== type || priorException.sourceId !== sourceId) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Idempotency key was already used for a different exception request.' });
      }
      await client.query('COMMIT');
      return res.json({ success: true, exception: priorException, idempotent: true });
    }
    let snapshot: any;
    let customerId: string | null = null;
    if (type === 'scan_reversal') {
      const source = await client.query(
        'SELECT data,status,customer_id FROM scan_events WHERE id=$1 AND restaurant_code=$2 FOR UPDATE',
        [sourceId, user.restaurantCode]
      );
      const event = source.rows[0]?.data;
      if (!event || !['approved', 'warning_confirmed'].includes(source.rows[0].status) ||
          event.isGracePlate || Number(event.platesDeducted) !== 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Only a committed, paid, single-plate scan can be reversed.' });
      }
      customerId = source.rows[0].customer_id;
      snapshot = { scanEventId: sourceId, customerId, plates: 1, eventTimestamp: event.timestamp, scanPointId: event.scanPointId };
    } else if (type === 'transfer_reversal') {
      const source = await client.query(
        'SELECT data FROM transfers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE',
        [sourceId, user.restaurantCode]
      );
      const transfer = source.rows[0]?.data;
      if (!transfer || transfer.status !== 'completed') {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Only a completed transfer can be reversed.' });
      }
      customerId = transfer.senderCustomerId;
      snapshot = { transferId: sourceId, senderCustomerId: transfer.senderCustomerId, recipientCustomerId: transfer.recipientCustomerId, plates: Number(transfer.plates) };
    } else {
      const source = await client.query(
        'SELECT data,customer_id FROM payments WHERE id=$1 AND restaurant_code=$2 FOR UPDATE',
        [sourceId, user.restaurantCode]
      );
      const payment = source.rows[0]?.data;
      if (!payment || !source.rows[0].customer_id || !['cash', 'bank_transfer'].includes(payment.paymentMethod) ||
          payment.refundStatus === 'refunded' || Number(payment.amountRwf) < 1 || Number(payment.platesAdded) < 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Only an unreversed cash or bank-transfer top-up can enter this manual refund workflow. Mobile-money refunds require a verified provider refund integration.' });
      }
      const purchase = await client.query(
        "SELECT id,timestamp,data FROM ledger_entries WHERE restaurant_code=$1 AND customer_id=$2 AND type='purchase' AND data->>'paymentId'=$3 FOR UPDATE",
        [user.restaurantCode, source.rows[0].customer_id, sourceId]
      );
      if (!purchase.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'The original purchase ledger entry could not be found.' });
      }
      // Exclude the purchase row explicitly. PostgreSQL microseconds are truncated
      // when pg converts timestamptz to JS Date; comparing the rounded Date alone
      // can incorrectly classify the purchase itself as later activity.
      const later = await client.query(
        'SELECT id FROM ledger_entries WHERE customer_id=$1 AND id<>$2 AND timestamp >= (SELECT timestamp FROM ledger_entries WHERE id=$2) LIMIT 1',
        [source.rows[0].customer_id, purchase.rows[0].id]
      );
      if (later.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Refund is blocked because the customer has subsequent ledger activity. Reconcile the remaining plate liability manually before retrying.' });
      }
      customerId = source.rows[0].customer_id;
      snapshot = { paymentId: sourceId, customerId, purchaseLedgerId: purchase.rows[0].id, plates: Number(payment.platesAdded), amountRwf: Number(payment.amountRwf), paymentMethod: payment.paymentMethod };
    }
    const id = 'fex_' + crypto.randomUUID();
    const exception = { id, restaurantCode: user.restaurantCode, type, sourceId, reason,
      status: 'pending', requestedBy: { userId: user.userId, username: user.username, role: user.role },
      snapshot, idempotencyKey, createdAt: new Date().toISOString() };
    await client.query(
      'INSERT INTO financial_exception_requests (id,restaurant_code,exception_type,source_id,customer_id,status,idempotency_key,requested_by_user_id,data) VALUES ($1,$2,$3,$4,$5,\'pending\',$6,$7,$8)',
      [id, user.restaurantCode, type, sourceId, customerId, idempotencyKey, user.userId, JSON.stringify(exception)]
    );
    await writeApprovalAudit(client, user.restaurantCode, user, 'FINANCIAL_EXCEPTION_REQUESTED', { exceptionId: id, type, sourceId, reason });
    await client.query('COMMIT');
    return res.status(201).json({ success: true, exception });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    if ((error as any)?.code === '23505') return res.status(409).json({ success: false, error: 'An exception for this source transaction is already pending or has been approved.' });
    console.error('[Financial Exception Request] failed:', error);
    return res.status(503).json({ success: false, error: 'Financial exception request was not saved.' });
  } finally { client.release(); }
});

app.post('/api/financial-exceptions/:exceptionId/approve', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  const actor = req.user!;
  const reason = typeof req.body?.approvalReason === 'string' ? req.body.approvalReason.trim() : '';
  const payoutReference = typeof req.body?.payoutReference === 'string' ? req.body.payoutReference.trim() : '';
  if (reason.length < 12 || reason.length > 500) return res.status(400).json({ success: false, error: 'A detailed approval reason is required.' });
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Financial exception approval requires PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM financial_exception_requests WHERE id=$1 FOR UPDATE', [req.params.exceptionId]);
    if (!found.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Exception request not found.' }); }
    const row = found.rows[0];
    const exception = row.data;
    if (row.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Exception is no longer pending.' }); }
    if (row.requested_by_user_id === actor.userId) { await client.query('ROLLBACK'); return res.status(403).json({ success: false, error: 'The requester cannot approve their own financial exception.' }); }
    if (exception.type === 'cash_refund' && (payoutReference.length < 4 || payoutReference.length > 128)) {
      await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'A cash/bank payout receipt reference is required to confirm the refund.' });
    }
    const customerIds = exception.type === 'transfer_reversal'
      ? [exception.snapshot.senderCustomerId, exception.snapshot.recipientCustomerId].sort()
      : [exception.snapshot.customerId];
    const locked = new Map<string, any>();
    for (const customerId of customerIds) {
      const result = await client.query('SELECT id,data FROM customers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [customerId, row.restaurant_code]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Affected customer is no longer present in this restaurant.' }); }
      locked.set(customerId, result.rows[0].data);
    }
    const now = new Date();
    const addLedger = async (customerId: string, type: string, delta: number, suffix: string, reference: string, reversalOfId?: string) => {
      const id = 'led_' + crypto.randomUUID();
      const ledger = { id, customerId, restaurantCode: row.restaurant_code, type, platesDelta: delta,
        timestamp: now.toISOString(), staffId: actor.userId, reason, reference,
        reversalOfId: reversalOfId || undefined, idempotencyKey: 'fex:' + exception.id + ':' + suffix };
      await client.query(
        'INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, row.restaurant_code, customerId, type, delta, ledger.idempotencyKey, now, JSON.stringify(ledger)]
      );
      return ledger;
    };
    if (exception.type === 'scan_reversal') {
      const source = await client.query('SELECT data,status FROM scan_events WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [exception.sourceId, row.restaurant_code]);
      if (!source.rows[0] || !['approved', 'warning_confirmed'].includes(source.rows[0].status) || source.rows[0].data?.isGracePlate) {
        await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Scan is no longer eligible for reversal.' });
      }
      const ev = source.rows[0].data;
      const original = await client.query(
        "SELECT id FROM ledger_entries WHERE customer_id=$1 AND type='scan' AND data->>'timestamp'=$2 AND data->>'scanPointId'=$3 FOR UPDATE",
        [exception.snapshot.customerId, ev.timestamp, ev.scanPointId]
      );
      if (!original.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Original scan debit was not found; no balance was changed.' }); }
      await addLedger(exception.snapshot.customerId, 'reversal', 1, 'scan', original.rows[0].id, original.rows[0].id);
      ev.status = 'undone'; ev.reversedAt = now.toISOString(); ev.reversedBy = actor.userId;
      await client.query('UPDATE scan_events SET status=\'undone\',data=$2 WHERE id=$1', [exception.sourceId, JSON.stringify(ev)]);
    } else if (exception.type === 'transfer_reversal') {
      const source = await client.query('SELECT data FROM transfers WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [exception.sourceId, row.restaurant_code]);
      const transfer = source.rows[0]?.data;
      if (!transfer || transfer.status !== 'completed') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Transfer is no longer eligible for reversal.' }); }
      const recipientBalance = await client.query('SELECT COALESCE(SUM(plates_delta),0)::int AS balance FROM ledger_entries WHERE customer_id=$1', [transfer.recipientCustomerId]);
      if (Number(recipientBalance.rows[0].balance) < Number(transfer.plates)) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Recipient has already consumed the transferred plates; reversal would create a negative balance.' }); }
      await addLedger(transfer.senderCustomerId, 'reversal', Number(transfer.plates), 'transfer_sender', exception.sourceId);
      await addLedger(transfer.recipientCustomerId, 'reversal', -Number(transfer.plates), 'transfer_recipient', exception.sourceId);
      transfer.status = 'reversed'; transfer.reversedAt = now.toISOString(); transfer.reversedByAdminId = actor.userId;
      await client.query('UPDATE transfers SET data=$2 WHERE id=$1', [exception.sourceId, JSON.stringify(transfer)]);
    } else if (exception.type === 'cash_refund') {
      const source = await client.query('SELECT data FROM payments WHERE id=$1 AND restaurant_code=$2 FOR UPDATE', [exception.sourceId, row.restaurant_code]);
      const payment = source.rows[0]?.data;
      if (!payment || payment.refundStatus === 'refunded') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Payment is no longer eligible for refund.' }); }
      const later = await client.query(
        'SELECT id FROM ledger_entries WHERE customer_id=$1 AND id<>$2 AND timestamp >= (SELECT timestamp FROM ledger_entries WHERE id=$2) LIMIT 1',
        [exception.snapshot.customerId, exception.snapshot.purchaseLedgerId]
      );
      if (later.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Customer ledger changed after refund request; reconcile before payout.' }); }
      await addLedger(exception.snapshot.customerId, 'reversal', -Number(exception.snapshot.plates), 'refund', exception.sourceId, exception.snapshot.purchaseLedgerId);
      payment.refundStatus = 'refunded'; payment.refundedAt = now.toISOString();
      payment.refundReference = payoutReference; payment.refundedBy = actor.userId;
      await client.query('UPDATE payments SET data=$2 WHERE id=$1', [exception.sourceId, JSON.stringify(payment)]);
    }
    exception.status = 'approved'; exception.approval = { userId: actor.userId, username: actor.username, reason, payoutReference: payoutReference || undefined, approvedAt: now.toISOString() };
    await client.query('UPDATE financial_exception_requests SET status=\'approved\',approved_by_user_id=$2,data=$3,updated_at=NOW() WHERE id=$1', [exception.id, actor.userId, JSON.stringify(exception)]);
    await writeApprovalAudit(client, row.restaurant_code, actor, 'FINANCIAL_EXCEPTION_APPROVED', { exceptionId: exception.id, type: exception.type, sourceId: exception.sourceId, reason, payoutReference: payoutReference || undefined });
    await client.query('COMMIT');
    return res.json({ success: true, exception });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Financial Exception Approval] failed:', error);
    return res.status(503).json({ success: false, error: 'Financial exception was not approved or posted.' });
  } finally { client.release(); }
});


app.post('/api/financial-exceptions/:exceptionId/reject', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  const actor = req.user!;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 12 || reason.length > 500) return res.status(400).json({ success: false, error: 'A detailed rejection reason is required.' });
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Financial exception rejection requires PostgreSQL.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM financial_exception_requests WHERE id=$1 FOR UPDATE', [req.params.exceptionId]);
    if (!found.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Exception request not found.' }); }
    const row = found.rows[0];
    if (row.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'Exception is no longer pending.' }); }
    if (row.requested_by_user_id === actor.userId) { await client.query('ROLLBACK'); return res.status(403).json({ success: false, error: 'The requester cannot reject their own financial exception.' }); }
    const exception = { ...row.data, status: 'rejected', rejection: { userId: actor.userId, username: actor.username, reason, rejectedAt: new Date().toISOString() } };
    await client.query("UPDATE financial_exception_requests SET status='rejected',approved_by_user_id=$2,data=$3,updated_at=NOW() WHERE id=$1", [exception.id, actor.userId, JSON.stringify(exception)]);
    await writeApprovalAudit(client, row.restaurant_code, actor, 'FINANCIAL_EXCEPTION_REJECTED', { exceptionId: exception.id, type: exception.type, sourceId: exception.sourceId, reason });
    await client.query('COMMIT');
    return res.json({ success: true, exception });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[Financial Exception Rejection] failed:', error);
    return res.status(503).json({ success: false, error: 'Financial exception rejection was not committed.' });
  } finally { client.release(); }
});

app.get('/api/financial-exceptions', apiRateLimiter, requireAuth(['restaurant_admin', 'super_admin']), async (req, res) => {
  const user = req.user!;
  const pool = getPostgresPool();
  if (!pool || !isPostgresConfigured()) return res.status(503).json({ success: false, error: 'Financial exception queue requires PostgreSQL.' });
  try {
    const result = user.role === 'super_admin'
      ? await pool.query('SELECT data FROM financial_exception_requests ORDER BY created_at DESC LIMIT 200')
      : await pool.query('SELECT data FROM financial_exception_requests WHERE restaurant_code=$1 ORDER BY created_at DESC LIMIT 200', [user.restaurantCode]);
    return res.json({ success: true, exceptions: result.rows.map((r: any) => r.data) });
  } catch (error) {
    console.error('[Financial Exception Queue] failed:', error);
    return res.status(503).json({ success: false, error: 'Financial exception queue is unavailable.' });
  }
});

// POST /api/topups/commit: manager-confirmed top-up, ledger and payment are one DB transaction.
app.post(
  '/api/topups/commit',
  apiRateLimiter,
  requireAuth(['restaurant_admin']),
  async (req, res) => {
    const user = req.user!;
    const restaurantCode = user.restaurantCode;
    const customerId = typeof req.body?.customerId === 'string' ? req.body.customerId.trim() : '';
    const plates = Number(req.body?.plates);
    const amountRwf = Number(req.body?.amountRwf);
    const paymentMethod = req.body?.paymentMethod;
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    const packageId = typeof req.body?.packageId === 'string' ? req.body.packageId : undefined;
    const allowedMethods = ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer'];
    if (!customerId || !Number.isSafeInteger(plates) || plates < 1 || plates > 120 ||
        !Number.isSafeInteger(amountRwf) || amountRwf < 1 || amountRwf > 10000000 ||
        !allowedMethods.includes(paymentMethod) || reference.length < 4 || reference.length > 128) {
      return res.status(400).json({ success: false, error: 'Valid customer, 1–120 plates, amount, payment method and payment reference are required. Top-ups above 120 plates require the approval workflow.' });
    }
    const pool = getPostgresPool();
    if (!pool || !isPostgresConfigured()) {
      return res.status(503).json({ success: false, error: 'Authoritative top-ups require the production database.' });
    }
    const referenceKey = crypto.createHash('sha256').update(reference.toUpperCase()).digest('hex');
    const idempotencyKey = `topup:${restaurantCode}:${referenceKey}`.slice(0, 128);
    const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify({
      restaurantCode, customerId, plates, amountRwf, paymentMethod, packageId: packageId || null, actorId: user.userId,
    })).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);
      const prior = await client.query(
        'SELECT data FROM ledger_entries WHERE idempotency_key = $1 FOR UPDATE',
        [idempotencyKey]
      );
      if (prior.rows[0]) {
        const priorData = prior.rows[0].data || {};
        if (priorData.requestFingerprint !== requestFingerprint) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: 'This payment reference has already been used for a different top-up.' });
        }
        const paymentId = priorData.paymentId;
        const paymentResult = await client.query('SELECT data FROM payments WHERE id = $1', [paymentId]);
        await client.query('COMMIT');
        return res.json({ success: true, ledgerEntry: priorData, payment: paymentResult.rows[0]?.data, idempotent: true });
      }

      const customerResult = await client.query(
        'SELECT id, restaurant_code, member_no, card_status, data FROM customers WHERE id = $1 AND restaurant_code = $2 FOR UPDATE',
        [customerId, restaurantCode]
      );
      const customerRow = customerResult.rows[0];
      if (!customerRow || customerRow.card_status !== 'active') {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Active customer not found in this restaurant.' });
      }
      if (packageId) {
        const pkg = (serverDbState?.packages || []).find((item: any) => item.id === packageId && item.restaurantCode === restaurantCode);
        if (!pkg || Number(pkg.platesCount) !== plates || Number(pkg.priceRwf) !== amountRwf) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: 'Selected package no longer matches the server price. Refresh and retry.' });
        }
      }
      const customer = customerRow.data || {};
      const now = new Date();
      const ledgerId = `led_${crypto.randomUUID()}`;
      const paymentId = `pay_${crypto.randomUUID()}`;
      const ledgerEntry = {
        id: ledgerId, customerId, restaurantCode, type: 'purchase', platesDelta: plates,
        timestamp: now.toISOString(), staffId: user.userId,
        reason: `Manager-confirmed top-up: +${plates} plates (${paymentMethod})`,
        reference, idempotencyKey, amountRwf, requestFingerprint, paymentId,
      };
      const payment = {
        id: paymentId, restaurantCode, customerId, customerName: customer.name || 'Customer',
        memberNo: customerRow.member_no, packageId, platesAdded: plates, amountRwf,
        paymentMethod, reference, adminStaffId: user.userId, adminStaffName: user.username || user.userId,
        timestamp: now.toISOString(),
      };
      await client.query(
        `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, amount_rwf, idempotency_key, timestamp, data)
         VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8)`,
        [ledgerId, restaurantCode, customerId, plates, amountRwf, idempotencyKey, now, JSON.stringify(ledgerEntry)]
      );
      await client.query(
        'INSERT INTO payments (id, restaurant_code, customer_id, amount_rwf, data) VALUES ($1, $2, $3, $4, $5)',
        [paymentId, restaurantCode, customerId, amountRwf, JSON.stringify(payment)]
      );
      await client.query('COMMIT');

      if (Array.isArray(serverDbState?.ledgerEntries)) serverDbState.ledgerEntries.push(ledgerEntry);
      if (Array.isArray(serverDbState?.payments)) serverDbState.payments.unshift(payment);
      return res.json({ success: true, ledgerEntry, payment, idempotent: false });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('[Atomic Top-up] Transaction failed:', error);
      return res.status(503).json({ success: false, error: 'Top-up could not be committed. Retry with the same payment reference.' });
    } finally {
      client.release();
    }
  }
);

// POST /api/licenses/sign: Authoritative License Signer for Super Admin (Finding 1)
app.post(
  '/api/licenses/sign',
  apiRateLimiter,
  requireAuth(['super_admin']),
  (req, res) => {
    const { payload } = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Payload object is required' });
    }

    const raw = JSON.stringify(payload);
    const signature = 'ed25519_' + serverHmac(MASTER_KEY, `LICENSE_SIGNATURE:${raw}`).slice(0, 48);
    return res.json({
      success: true,
      signature,
      signedAt: new Date().toISOString(),
    });
  }
);


function getSaasMtnConfig() {
  const environment = process.env.MTN_MOMO_TARGET_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  if (process.env.RESTOPASS_SAAS_MTN_ENABLED !== 'true' ||
      (environment === 'production' && (process.env.NODE_ENV !== 'production' || process.env.RESTOPASS_SAAS_MTN_PRODUCTION_APPROVED !== 'true'))) return null;
  const apiUser = process.env.MTN_MOMO_COLLECTION_API_USER || '';
  const apiKey = process.env.MTN_MOMO_COLLECTION_API_KEY || '';
  const subscriptionKey = process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY || '';
  if (!apiUser || !apiKey || !subscriptionKey) return null;
  return { environment, targetEnvironment: environment === 'production' ? (process.env.MTN_MOMO_PRODUCTION_TARGET || '') : 'sandbox',
    baseUrl: environment === 'production' ? 'https://momodeveloper.mtn.com' : 'https://sandbox.momodeveloper.mtn.com',
    apiUser, apiKey, subscriptionKey };
}

async function getSaasMtnAccessToken(config: NonNullable<ReturnType<typeof getSaasMtnConfig>>): Promise<string> {
  const credentials = Buffer.from(config.apiUser + ':' + config.apiKey).toString('base64');
  const response = await fetch(config.baseUrl + '/collection/token/', { method: 'POST', headers: {
    Authorization: 'Basic ' + credentials, 'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    'X-Target-Environment': config.targetEnvironment,
  }});
  if (!response.ok) throw new Error('MTN token request failed: HTTP ' + response.status);
  const body: any = await response.json();
  if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('MTN access token missing');
  return body.access_token;
}
function normalizeSaasPayer(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[+\s-]/g, '') : '';
}
async function ensureRestaurantSaasSubscription(client: any, restaurantCode: string) {
  const found = await client.query('SELECT code,data FROM restaurants WHERE code=$1 FOR UPDATE', [restaurantCode]);
  if (!found.rows[0]) return null;
  const restaurant = found.rows[0].data || {};
  const plan = (serverDbState?.plans || []).find((item: any) => item.id === restaurant.planId);
  const price = Number(restaurant.saasSubscriptionPriceRwf || restaurant.termsOverride?.saasSubscriptionPriceRwf || restaurant.termsOverride?.basePriceRwf || plan?.terms?.basePriceRwf);
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error('Valid SaaS price must be configured.');
  await client.query("INSERT INTO restaurant_subscriptions (id,restaurant_code,status,price_rwf) VALUES ($1,$2,'pending_payment',$3) ON CONFLICT (restaurant_code) DO NOTHING",
    ['rs_' + crypto.randomUUID(), restaurantCode, price]);
  const subscription = await client.query('SELECT * FROM restaurant_subscriptions WHERE restaurant_code=$1 FOR UPDATE', [restaurantCode]);
  return { restaurant, subscription: subscription.rows[0] };
}

app.get('/api/restaurant-saas/subscription', apiRateLimiter, requireAuth(['restaurant_admin','super_admin']), async (req,res) => {
  const actor = req.user!;
  const code = actor.role === 'super_admin' ? String(req.query.restaurantCode || '') : actor.restaurantCode;
  if (!code) return res.status(400).json({success:false,error:'restaurantCode is required.'});
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({success:false,error:'SaaS billing requires PostgreSQL.'});
  const client = await pool.connect();
  try {
    const ensured = await ensureRestaurantSaasSubscription(client, code);
    if (!ensured) return res.status(404).json({success:false,error:'Restaurant not found.'});
    const payments = await client.query('SELECT id,internal_reference,amount_rwf,currency,status,provider_status,created_at,verified_at,entitlement_applied_at FROM restaurant_subscription_payments WHERE restaurant_code=$1 ORDER BY created_at DESC LIMIT 20',[code]);
    return res.json({success:true,subscription:ensured.subscription,payments:payments.rows});
  } catch (error) { console.error('[SaaS subscription read]',error); return res.status(503).json({success:false,error:'Subscription details unavailable.'}); }
  finally { client.release(); }
});

app.post('/api/restaurant-saas/subscription/price', apiRateLimiter, requireAuth(['super_admin']), async (req,res) => {
  const code = typeof req.body?.restaurantCode === 'string' ? req.body.restaurantCode.trim().toUpperCase() : '';
  const amount = Number(req.body?.amountRwf);
  if (!/^[A-Z0-9_-]{2,32}$/.test(code) || !Number.isSafeInteger(amount) || amount < 1 || amount > 100000000)
    return res.status(400).json({success:false,error:'Valid restaurant code and positive RWF amount required.'});
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({success:false,error:'SaaS pricing requires PostgreSQL.'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ensured = await ensureRestaurantSaasSubscription(client,code);
    if (!ensured) { await client.query('ROLLBACK'); return res.status(404).json({success:false,error:'Restaurant not found.'}); }
    const updatedRestaurant = {...ensured.restaurant,saasSubscriptionPriceRwf:amount};
    await client.query('UPDATE restaurants SET data=$2,updated_at=NOW() WHERE code=$1',[code,JSON.stringify(updatedRestaurant)]);
    const updated = await client.query('UPDATE restaurant_subscriptions SET price_rwf=$2,updated_at=NOW() WHERE restaurant_code=$1 RETURNING *',[code,amount]);
    await client.query("INSERT INTO restaurant_subscription_audit_logs (id,restaurant_code,actor_type,actor_id,action,data) VALUES ($1,$2,'super_admin',$3,'SAAS_PRICE_UPDATED',$4)",
      ['rsa_'+crypto.randomUUID(),code,req.user!.userId,JSON.stringify({amountRwf:amount,currency:'RWF'})]);
    await client.query('COMMIT');
    return res.json({success:true,subscription:updated.rows[0]});
  } catch(error) { try{await client.query('ROLLBACK')}catch{}; console.error('[SaaS price]',error); return res.status(503).json({success:false,error:'Price update failed.'}); }
  finally { client.release(); }
});

app.post('/api/restaurant-saas/payment/initiate', apiRateLimiter, requireAuth(['restaurant_admin']), async (req,res) => {
  const payer = normalizeSaasPayer(req.body?.payerMsisdn);
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (!/^2507[89]\d{7}$/.test(payer) || !/^[A-Za-z0-9._:-]{12,128}$/.test(idempotencyKey))
    return res.status(400).json({success:false,error:'Valid Rwanda MTN number and unique idempotency key required.'});
  const config = getSaasMtnConfig();
  if (!config) return res.status(503).json({success:false,error:'MTN collection disabled pending merchant credentials and approval.'});
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({success:false,error:'Payment requires PostgreSQL.'});
  const client = await pool.connect();
  const paymentId = 'rsp_'+crypto.randomUUID();
  const reference = 'RPS-'+crypto.randomUUID();
  try {
    await client.query('BEGIN');
    const ensured = await ensureRestaurantSaasSubscription(client,req.user!.restaurantCode);
    if (!ensured) { await client.query('ROLLBACK'); return res.status(404).json({success:false,error:'Restaurant not found.'}); }
    const amount = Number(ensured.subscription.price_rwf);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({restaurantCode:req.user!.restaurantCode,payer,amount,currency:'RWF'})).digest('hex');
    const prior = await client.query('SELECT * FROM restaurant_subscription_payments WHERE idempotency_key=$1 FOR UPDATE',[idempotencyKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].request_fingerprint !== fingerprint) { await client.query('ROLLBACK'); return res.status(409).json({success:false,error:'Idempotency key reused with different details.'}); }
      await client.query('COMMIT'); return res.json({success:true,payment:prior.rows[0],reused:true});
    }
    await client.query("INSERT INTO restaurant_subscription_payments (id,restaurant_code,provider,provider_environment,internal_reference,payer_msisdn,amount_rwf,currency,status,idempotency_key,request_fingerprint) VALUES ($1,$2,'mtn_momo',$3,$4,$5,$6,'RWF','created',$7,$8)",
      [paymentId,req.user!.restaurantCode,config.environment,reference,payer,amount,idempotencyKey,fingerprint]);
    await client.query('COMMIT');
    const token = await getSaasMtnAccessToken(config);
    const response = await fetch(config.baseUrl+'/collection/v1_0/requesttopay',{method:'POST',headers:{
      Authorization:'Bearer '+token,'X-Reference-Id':reference.replace(/^RPS-/,''),'X-Target-Environment':config.targetEnvironment,
      'Ocp-Apim-Subscription-Key':config.subscriptionKey,'Content-Type':'application/json'
    },body:JSON.stringify({amount:String(amount),currency:'RWF',externalId:reference,payer:{partyIdType:'MSISDN',partyId:payer},
      payerMessage:'RestoPass restaurant software subscription',payeeNote:'RestoPass SaaS access - 30 days'})});
    if (response.status !== 202) {
      await pool.query("UPDATE restaurant_subscription_payments SET status='failed',provider_status=$2,updated_at=NOW() WHERE id=$1 AND status='created'",[paymentId,'REQUEST_REJECTED_HTTP_'+response.status]);
      return res.status(502).json({success:false,error:'MTN did not accept the request. No subscription time was granted.'});
    }
    await pool.query("UPDATE restaurant_subscription_payments SET status='provider_pending',provider_status='PENDING',updated_at=NOW() WHERE id=$1",[paymentId]);
    return res.status(202).json({success:true,status:'provider_pending',paymentId,message:'Approve the MTN MoMo prompt. Access activates only after independent status verification.'});
  } catch(error) { try{await client.query('ROLLBACK')}catch{}; console.error('[SaaS payment initiation]',error); return res.status(503).json({success:false,error:'Payment request unavailable. Check payment history before retrying.'}); }
  finally { client.release(); }
});

app.post('/api/restaurant-saas/payment/:paymentId/verify', apiRateLimiter, requireAuth(['restaurant_admin','super_admin']), async (req,res) => {
  const actor = req.user!;
  const pool = getPostgresPool();
  if (!pool) return res.status(503).json({success:false,error:'Verification requires PostgreSQL.'});
  const config = getSaasMtnConfig();
  if (!config) return res.status(503).json({success:false,error:'MTN verification is disabled pending merchant credentials and approval.'});
  const client = await pool.connect();
  try {
    const found = await client.query('SELECT * FROM restaurant_subscription_payments WHERE id=$1',[req.params.paymentId]);
    const payment = found.rows[0];
    if (!payment) return res.status(404).json({success:false,error:'Payment attempt not found.'});
    if (actor.role !== 'super_admin' && payment.restaurant_code !== actor.restaurantCode) return res.status(403).json({success:false,error:'Payment belongs to another restaurant.'});
    if (payment.provider_environment !== config.environment) return res.status(409).json({success:false,error:'Payment environment mismatch.'});
    if (payment.entitlement_applied_at) return res.json({success:true,status:'successful',alreadyApplied:true});
    const token = await getSaasMtnAccessToken(config);
    const lookup = payment.internal_reference.replace(/^RPS-/,'');
    const response = await fetch(config.baseUrl+'/collection/v1_0/requesttopay/'+encodeURIComponent(lookup),{method:'GET',headers:{
      Authorization:'Bearer '+token,'X-Target-Environment':config.targetEnvironment,'Ocp-Apim-Subscription-Key':config.subscriptionKey
    }});
    if (!response.ok) return res.status(502).json({success:false,error:'MTN status unavailable; no entitlement changed.'});
    const provider:any = await response.json();
    const verified = provider?.status === 'SUCCESSFUL' && Number(provider?.amount) === Number(payment.amount_rwf)
      && provider?.currency === 'RWF' && provider?.externalId === payment.internal_reference
      && normalizeSaasPayer(provider?.payer?.partyId) === normalizeSaasPayer(payment.payer_msisdn)
      && typeof provider?.financialTransactionId === 'string' && provider.financialTransactionId.length > 0;
    if (!verified) {
      const status = ['FAILED','REJECTED','TIMEOUT','EXPIRED'].includes(provider?.status) ? 'failed' : 'provider_pending';
      await pool.query('UPDATE restaurant_subscription_payments SET status=$2,provider_status=$3,updated_at=NOW() WHERE id=$1 AND entitlement_applied_at IS NULL',[payment.id,status,String(provider?.status||'UNKNOWN').slice(0,64)]);
      return res.json({success:true,status,message:'MTN status has not met every entitlement verification condition.'});
    }
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM restaurant_subscription_payments WHERE id=$1 FOR UPDATE',[payment.id]);
    const pay = locked.rows[0];
    if (pay.entitlement_applied_at) { await client.query('COMMIT'); return res.json({success:true,status:'successful',alreadyApplied:true}); }
    const restaurantResult = await client.query('SELECT code,data FROM restaurants WHERE code=$1 FOR UPDATE',[pay.restaurant_code]);
    if (!restaurantResult.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({success:false,error:'Restaurant not found.'}); }
    const subResult = await client.query('SELECT * FROM restaurant_subscriptions WHERE restaurant_code=$1 FOR UPDATE',[pay.restaurant_code]);
    if (!subResult.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({success:false,error:'Subscription record missing.'}); }
    const restaurant = restaurantResult.rows[0].data || {};
    const subscription = subResult.rows[0];
    const paidEnd = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() : NaN;
    const verifiedAt = new Date();
    const startMs = Number.isFinite(paidEnd) && paidEnd > verifiedAt.getTime() ? paidEnd : verifiedAt.getTime();
    const end = new Date(startMs+30*24*60*60*1000).toISOString();
    const graceEnd = new Date(startMs+30*24*60*60*1000+72*60*60*1000).toISOString();
    const plan = (serverDbState?.plans||[]).find((item:any)=>item.id===restaurant.planId);
    const oldLicense = (serverDbState?.licenses||[]).find((item:any)=>item.id===restaurant.currentLicenseId);
    const maxScanPoints = Number(oldLicense?.maxScanPoints||plan?.terms?.maxScanPointsIncluded||1);
    const licenseId = 'LIC-'+pay.restaurant_code+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
    const payload = {licenseId,restaurantCode:pay.restaurant_code,planId:restaurant.planId,maxScanPoints,validUntil:end,graceDays:3};
    const signature = 'ed25519_'+serverHmac(MASTER_KEY,'LICENSE_SIGNATURE:'+JSON.stringify(payload)).slice(0,48);
    const license = {id:licenseId,restaurantCode:pay.restaurant_code,planId:restaurant.planId,maxScanPoints,validUntil:end,graceDays:3,
      featureFlags:oldLicense?.featureFlags||{spotChecksEnabled:true,multiStationEnabled:maxScanPoints>1,secondPlateAllowed:true,customerTransfersEnabled:true},
      signature,issuedAt:verifiedAt.toISOString(),paidUntil:end};
    await client.query('INSERT INTO licenses (id,restaurant_code,plan_id,valid_until,data) VALUES ($1,$2,$3,$4,$5)',[licenseId,pay.restaurant_code,restaurant.planId,end,JSON.stringify(license)]);
    const updatedRestaurant = {...restaurant,status:'active',currentLicenseId:licenseId,highestTimeSeen:Date.now()};
    await client.query('UPDATE restaurants SET status=$2,data=$3,updated_at=NOW() WHERE code=$1',[pay.restaurant_code,'active',JSON.stringify(updatedRestaurant)]);
    await client.query("UPDATE restaurant_subscriptions SET status='active',current_period_start=$2,current_period_end=$3,grace_period_end=$4,last_payment_id=$5,updated_at=NOW() WHERE restaurant_code=$1",
      [pay.restaurant_code,new Date(startMs).toISOString(),end,graceEnd,pay.id]);
    await client.query("UPDATE restaurant_subscription_payments SET status='successful',provider_transaction_id=$2,provider_status='SUCCESSFUL',verified_at=$3,entitlement_applied_at=$3,updated_at=NOW() WHERE id=$1",
      [pay.id,provider.financialTransactionId,verifiedAt.toISOString()]);
    await client.query("INSERT INTO restaurant_subscription_audit_logs (id,restaurant_code,actor_type,actor_id,action,payment_id,data) VALUES ($1,$2,'mtn_momo',$3,'SAAS_PAYMENT_VERIFIED',$4,$5)",
      ['rsa_'+crypto.randomUUID(),pay.restaurant_code,provider.financialTransactionId,pay.id,JSON.stringify({amountRwf:Number(pay.amount_rwf),currency:'RWF',periodStart:new Date(startMs).toISOString(),periodEnd:end,licenseId})]);
    await client.query('COMMIT');
    if (serverDbState) {
      serverDbState.restaurants=(serverDbState.restaurants||[]).map((item:any)=>item.code===pay.restaurant_code?updatedRestaurant:item);
      serverDbState.licenses=[...(serverDbState.licenses||[]),license];
    }
    return res.json({success:true,status:'successful',subscription:{status:'active',currentPeriodStart:new Date(startMs).toISOString(),currentPeriodEnd:end,gracePeriodEnd:graceEnd}});
  } catch(error) { try{await client.query('ROLLBACK')}catch{}; console.error('[SaaS payment verification]',error); return res.status(503).json({success:false,error:'Verification or entitlement application failed. No success is assumed; retry or reconcile.'}); }
  finally { client.release(); }
});

// ----------------------------------------------------
// Station Pairing Authority & Anti-Bypass Device Registry (Finding 3)
// ----------------------------------------------------
const stationPairingAttempts = new Map<string, { count: number; lockUntil: number }>();

app.post('/api/station/pair', authRateLimiter, async (req, res) => {
  const { restaurantCode, pairingKeyOrCode, deviceType, deviceFingerprint, stationId } = req.body;

  if (!restaurantCode || !pairingKeyOrCode) {
    return res.status(400).json({ success: false, error: 'restaurantCode and pairingKeyOrCode are required' });
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const lockKey = `${clientIp}:${restaurantCode}`;
  const now = Date.now();
  const attempt = stationPairingAttempts.get(lockKey);

  if (attempt && attempt.lockUntil > now) {
    const remainingSec = Math.ceil((attempt.lockUntil - now) / 1000);
    return res.status(429).json({
      success: false,
      error: `Station pairing temporarily locked due to repeated invalid attempts. Try again in ${remainingSec}s.`,
    });
  }

  const cleanKey = pairingKeyOrCode.trim().toUpperCase();

  // Strict check: Station must exist in scanPoints matching key, with NO hardcoded bypass codes allowed
  const stations = serverDbState?.scanPoints || [];
  const targetStation = stations.find((sp: any) => {
    if (sp.restaurantCode !== restaurantCode) return false;
    if (stationId && sp.id !== stationId) return false;
    const matchCode = sp.pairingCode && sp.pairingCode.toUpperCase() === cleanKey;
    const matchKey = sp.pairingKey && sp.pairingKey.toUpperCase() === cleanKey;
    return matchCode || matchKey;
  });

  if (!targetStation) {
    const newCount = (attempt?.count || 0) + 1;
    const lockUntil = newCount >= 5 ? now + 5 * 60 * 1000 : 0;
    stationPairingAttempts.set(lockKey, { count: newCount, lockUntil });

    return res.status(401).json({
      success: false,
      error: 'Invalid station pairing key. The key does not match any authorized station.',
    });
  }

  // Clear failed attempts on valid pairing
  stationPairingAttempts.delete(lockKey);

  const pairingToken = `DEV_CERT_${targetStation.id}_${now}.${serverHmac(SESSION_SECRET, targetStation.id)}`;
  targetStation.isPaired = true;
  targetStation.pairedAt = new Date(now).toISOString();
  targetStation.deviceType = deviceType || 'laptop_scanner';
  targetStation.pairedDeviceFingerprint = deviceFingerprint || 'Generic Terminal';
  targetStation.status = 'active';

  // Open cashier session on server
  if (!serverDbState.cashierSessions) serverDbState.cashierSessions = [];
  const sessionId = `sess_${restaurantCode.toLowerCase()}_${now}`;
  const assignedUser = (serverDbState.stationUsers || []).find(
    (u: any) => u.id === targetStation.assignedStaffUserId || u.stationId === targetStation.id
  );

  const newSession = {
    id: sessionId,
    restaurantCode,
    stationId: targetStation.id,
    stationName: targetStation.name,
    branchId: targetStation.branchId,
    branchName: targetStation.branchName,
    staffUserId: assignedUser?.id || 'usr_staff_default',
    staffName: assignedUser?.name || targetStation.assignedStaffUserName || 'Stand Operator',
    staffUsername: assignedUser?.username || 'cashier_desk',
    deviceType: targetStation.deviceType,
    sessionToken: pairingToken,
    startedAt: new Date(now).toISOString(),
    status: 'active',
  };

  serverDbState.cashierSessions
    .filter((s: any) => s.restaurantCode === restaurantCode && s.stationId === targetStation.id && s.status === 'active')
    .forEach((s: any) => {
      s.status = 'closed';
    });
  serverDbState.cashierSessions.unshift(newSession);

  await queueDbSave(serverDbState);

  return res.json({
    success: true,
    station: targetStation,
    session: newSession,
    pairingToken,
  });
});

app.post(
  '/api/station/revoke',
  apiRateLimiter,
  requireAuth(['restaurant_admin', 'super_admin']),
  async (req, res) => {
    const { stationId, restaurantCode } = req.body;
    const user = req.user!;

    if (!stationId) {
      return res.status(400).json({ success: false, error: 'stationId is required' });
    }

    const rCode = restaurantCode || user.restaurantCode;
    if (user.role !== 'super_admin' && user.restaurantCode !== rCode) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const station = (serverDbState?.scanPoints || []).find(
      (s: any) => s.id === stationId && s.restaurantCode === rCode
    );

    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found' });
    }

    station.isPaired = false;
    station.pairedAt = undefined;
    station.status = 'offline';

    // Close active sessions
    (serverDbState?.cashierSessions || [])
      .filter((s: any) => s.stationId === stationId && s.status === 'active')
      .forEach((s: any) => {
        s.status = 'closed';
        s.endedAt = new Date().toISOString();
      });

    await queueDbSave(serverDbState);

    return res.json({ success: true, message: `Station ${station.name} revoked successfully` });
  }
);

// ----------------------------------------------------
// RestoPass Student Digital Monetization & Entitlements Engine
// ----------------------------------------------------

/**
 * Server-authoritative entitlement verification for student digital features
 */
function checkServerStudentEntitlement(
  customerId: string,
  feature:
    | 'physical_card_scan'
    | 'digital_qr'
    | 'customer_dashboard'
    | 'digital_plate_transfer'
    | 'customer_transaction_history' = 'digital_plate_transfer',
  targetState: any = serverDbState
): {
  allowed: boolean;
  feature: string;
  status: string;
  inGracePeriod: boolean;
  enforcementEnabled: boolean;
  reason?: string;
  expiresAt?: string;
  gracePeriodEnd?: string;
} {
  ensureServerDbDefaults(targetState);
  const settings = targetState?.studentSubscriptionSettings;

  // Physical card QR scanning NEVER requires a dashboard subscription
  if (feature === 'physical_card_scan') {
    const subs = targetState?.customerSubscriptions || [];
    const sub = subs.find((s: any) => s.customerId === customerId);
    return {
      allowed: true,
      feature,
      status: sub?.status || 'inactive',
      inGracePeriod: sub?.status === 'grace_period',
      enforcementEnabled: Boolean(settings?.enabled),
      reason: 'Physical card QR scanning does not require a dashboard subscription.',
    };
  }

  if (!settings?.enabled) {
    return {
      allowed: true,
      feature,
      status: 'inactive',
      inGracePeriod: false,
      enforcementEnabled: false,
      reason: 'Student subscription monetization is disabled at launch',
    };
  }

  const subs = targetState?.customerSubscriptions || [];
  const sub = subs.find((s: any) => s.customerId === customerId);
  if (!sub) {
    return {
      allowed: false,
      feature,
      status: 'inactive',
      inGracePeriod: false,
      enforcementEnabled: true,
      reason: 'An active student subscription (500 RWF/mo) is required for this digital feature.',
    };
  }

  if (sub.status === 'complimentary') {
    return {
      allowed: true,
      feature,
      status: 'complimentary',
      inGracePeriod: false,
      enforcementEnabled: true,
      expiresAt: sub.currentPeriodEnd,
    };
  }

  const now = Date.now();
  const endMs = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : 0;
  const graceMs = sub.gracePeriodEnd
    ? new Date(sub.gracePeriodEnd).getTime()
    : endMs + (settings.graceDays || 3) * 24 * 3600 * 1000;

  if (sub.status === 'active') {
    if (now <= endMs) {
      return {
        allowed: true,
        feature,
        status: 'active',
        inGracePeriod: false,
        enforcementEnabled: true,
        expiresAt: sub.currentPeriodEnd,
        gracePeriodEnd: sub.gracePeriodEnd,
      };
    }
    if (now <= graceMs) {
      return {
        allowed: true,
        feature,
        status: 'grace_period',
        inGracePeriod: true,
        enforcementEnabled: true,
        expiresAt: sub.currentPeriodEnd,
        gracePeriodEnd: sub.gracePeriodEnd,
        reason: 'Subscription is in 3-day grace period. Please renew to avoid interruption.',
      };
    }
    sub.status = 'expired';
    return {
      allowed: false,
      feature,
      status: 'expired',
      inGracePeriod: false,
      enforcementEnabled: true,
      reason: 'Your subscription and 3-day grace period have expired. Please renew for 500 RWF/mo.',
    };
  }

  if (sub.status === 'grace_period' && now <= graceMs) {
    return {
      allowed: true,
      feature,
      status: 'grace_period',
      inGracePeriod: true,
      enforcementEnabled: true,
      expiresAt: sub.currentPeriodEnd,
      gracePeriodEnd: sub.gracePeriodEnd,
    };
  }

  return {
    allowed: false,
    feature,
    status: sub.status || 'expired',
    inGracePeriod: false,
    enforcementEnabled: true,
    reason: 'An active student subscription is required.',
  };
}

// GET /api/customer/subscription: Returns current customer subscription & entitlement
app.get('/api/customer/subscription', apiRateLimiter, requireAuth(), (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const user = req.user!;
  const customerId = req.query.customerId ? String(req.query.customerId) : user.userId;

  if (user.role === 'customer' && user.userId !== customerId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot access another customer\'s subscription' });
  }

  const sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.customerId === customerId) || null;
  const entitlement = checkServerStudentEntitlement(customerId, 'digital_plate_transfer');

  return res.json({
    success: true,
    settings: serverDbState.studentSubscriptionSettings,
    subscription: sub,
    entitlement,
  });
});

// POST /api/customer/subscription/checkout
// Deliberately unavailable until a provider account is registered and a verified adapter is configured.
// Do not create pending payment rows or tell customers that a USSD push was sent without provider confirmation.
app.post('/api/customer/subscription/checkout', apiRateLimiter, requireAuth(['customer']), (_req, res) => {
  return res.status(503).json({
    success: false,
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    error: 'Mobile Money checkout is not available yet. RestoPass will enable dashboard payments after provider API onboarding and security verification.',
    supportedProviders: ['mtn_momo', 'airtel_money'],
  });
});

// POST /api/payments/mobile-money/callback: Webhook callback from Mobile Money provider with Idempotency
app.post('/api/payments/mobile-money/callback', apiRateLimiter, (_req, res) => {
  return res.status(503).json({ success: false, error: 'Payment callback verification is not configured. No subscription was activated.' });
});

// POST /api/customer/subscription/cancel: Cancels future subscription renewal
app.post('/api/customer/subscription/cancel', apiRateLimiter, requireAuth(['customer']), async (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const user = req.user!;
  const sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.customerId === user.userId);
  if (!sub) {
    return res.status(404).json({ success: false, error: 'Subscription not found' });
  }
  sub.cancelAtPeriodEnd = true;
  sub.updatedAt = new Date().toISOString();
  await queueDbSave(serverDbState);
  return res.json({ success: true, message: 'Subscription cancellation scheduled at end of paid period', subscription: sub });
});

// GET /api/customer/subscription/payments: Returns customer payment history
app.get('/api/customer/subscription/payments', apiRateLimiter, requireAuth(['customer']), (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const user = req.user!;
  const payments = (serverDbState.studentSubscriptionPayments || []).filter((p: any) => p.customerId === user.userId);
  return res.json({ success: true, payments });
});

// GET /api/admin/subscriptions/overview: Administrator subscription metrics and revenue
app.get('/api/admin/subscriptions/overview', apiRateLimiter, requireAuth(['super_admin', 'restaurant_admin']), (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const user = req.user!;
  const rCode = user.role === 'super_admin' ? null : user.restaurantCode;

  const subs = (serverDbState.customerSubscriptions || []).filter((s: any) => !rCode || s.restaurantCode === rCode);
  const payments = (serverDbState.studentSubscriptionPayments || []).filter((p: any) => !rCode || p.restaurantCode === rCode);

  const activeCount = subs.filter((s: any) => s.status === 'active').length;
  const graceCount = subs.filter((s: any) => s.status === 'grace_period').length;
  const expiredCount = subs.filter((s: any) => s.status === 'expired').length;
  const complimentaryCount = subs.filter((s: any) => s.status === 'complimentary').length;
  const verifiedPayments = payments.filter((p: any) => p.status === 'verified');
  const totalRevenueRwf = verifiedPayments.reduce((sum: number, p: any) => sum + (p.amountRwf || 500), 0);

  return res.json({
    success: true,
    settings: serverDbState.studentSubscriptionSettings,
    overview: {
      totalSubscribers: subs.length,
      activeCount,
      graceCount,
      expiredCount,
      complimentaryCount,
      totalRevenueRwf,
      verifiedPaymentsCount: verifiedPayments.length,
    },
  });
});

// PATCH /api/admin/settings/student-subscriptions: Administrator toggle and configuration
app.patch('/api/admin/settings/student-subscriptions', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const { enabled, requireForTransfers, graceDays } = req.body;

  const current = serverDbState.studentSubscriptionSettings;
  serverDbState.studentSubscriptionSettings = {
    ...current,
    enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
    priceRwf: 500, // Price is strictly 500 RWF per specification
    currency: 'RWF',
    period: 'monthly',
    graceDays: typeof graceDays === 'number' ? graceDays : current.graceDays || 3,
    requireForTransfers: typeof requireForTransfers === 'boolean' ? requireForTransfers : current.requireForTransfers,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user!.username,
  };

  await queueDbSave(serverDbState);

  return res.json({
    success: true,
    settings: serverDbState.studentSubscriptionSettings,
    message: `Student subscription settings updated: enabled=${serverDbState.studentSubscriptionSettings.enabled}`,
  });
});

// POST /api/admin/customers/:customerId/entitlements: Grants complimentary access
app.post('/api/admin/customers/:customerId/entitlements', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const { customerId } = req.params;
  const { reason, durationDays } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, error: 'A mandatory reason is required to grant complimentary access' });
  }

  const customer = (serverDbState.customers || []).find((c: any) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }

  const nowMs = Date.now();
  const days = typeof durationDays === 'number' ? durationDays : 30;
  const periodEndMs = nowMs + days * 24 * 3600 * 1000;
  const graceEndMs = periodEndMs + 3 * 24 * 3600 * 1000;

  let sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.customerId === customerId);
  if (!sub) {
    sub = {
      id: `sub_${customerId}_${Date.now()}`,
      customerId: customer.id,
      memberNo: customer.memberNo,
      restaurantCode: customer.restaurantCode,
      status: 'complimentary',
      planName: 'Complimentary Student Pass',
      priceRwf: 0,
      currency: 'RWF',
      currentPeriodStart: new Date(nowMs).toISOString(),
      currentPeriodEnd: new Date(periodEndMs).toISOString(),
      gracePeriodEnd: new Date(graceEndMs).toISOString(),
      cancelAtPeriodEnd: false,
      paymentMethod: 'complimentary',
      complimentaryReason: reason.trim(),
      complimentaryGrantedBy: req.user!.username,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    };
    serverDbState.customerSubscriptions.push(sub);
  } else {
    sub.status = 'complimentary';
    sub.currentPeriodStart = new Date(nowMs).toISOString();
    sub.currentPeriodEnd = new Date(periodEndMs).toISOString();
    sub.gracePeriodEnd = new Date(graceEndMs).toISOString();
    sub.complimentaryReason = reason.trim();
    sub.complimentaryGrantedBy = req.user!.username;
    sub.updatedAt = new Date(nowMs).toISOString();
  }

  await queueDbSave(serverDbState);

  return res.json({ success: true, subscription: sub });
});

// DELETE /api/admin/customers/:customerId/entitlements/:entitlementId: Revokes complimentary access
app.delete('/api/admin/customers/:customerId/entitlements/:entitlementId', apiRateLimiter, requireAuth(['super_admin']), async (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const { customerId } = req.params;
  const sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.customerId === customerId);
  if (!sub) {
    return res.status(404).json({ success: false, error: 'Subscription not found' });
  }

  sub.status = 'expired';
  sub.currentPeriodEnd = new Date().toISOString();
  sub.gracePeriodEnd = new Date().toISOString();
  sub.updatedAt = new Date().toISOString();

  await queueDbSave(serverDbState);

  return res.json({ success: true, message: 'Complimentary entitlement revoked', subscription: sub });
});

// ----------------------------------------------------
// Role-Scoped State Retrieval & Updates (Findings 1, 2, 5, 6)
// ----------------------------------------------------

/**
 * Sanitizes and scopes database state according to caller's role (Finding 1)
 */
function sanitizeCustomerForResponse(customer: any): any {
  if (!customer || typeof customer !== 'object') return customer;
  const { pinHash, idHash, ...safeCustomer } = customer;
  return safeCustomer;
}

function scopeStateForUser(state: any, user: UserSession): any {
  if (!state) return null;
  const redactCustomers = (items: any[]) => (items || []).map((customer: any) => ({
    ...customer, pinHash: undefined, idHash: undefined,
  }));
  const redactStationUsers = (items: any[]) => (items || []).map((stationUser: any) => ({
    ...stationUser, passwordHash: undefined, pin: undefined,
  }));
  const redactActivationRequests = (items: any[]) => (items || []).map((ar: any) => ({
    ...ar, activationCode: undefined, codeHash: undefined,
  }));
  const redactPinRecoveryRequests = (items: any[]) => (items || []).map((pr: any) => ({
    ...pr, recoveryCode: undefined, recoveryCodeHash: undefined,
  }));

  // Operational data is available to super-admins, never raw authentication material.
  if (user.role === 'super_admin') {
    return {
      ...state,
      customers: redactCustomers(state.customers || []),
      stationUsers: redactStationUsers(state.stationUsers || []),
      activationRequests: redactActivationRequests(state.activationRequests || []),
      pinRecoveryRequests: redactPinRecoveryRequests(state.pinRecoveryRequests || []),
    };
  }

  // Restaurant Admin: Scoped exclusively to their restaurantCode
  if (user.role === 'restaurant_admin') {
    const rCode = user.restaurantCode;
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: redactCustomers((state.customers || []).filter((c: any) => c.restaurantCode === rCode)),
      ledgerEntries: (state.ledgerEntries || []).filter((l: any) => l.restaurantCode === rCode),
      checkpoints: (state.checkpoints || []).filter((cp: any) => cp.restaurantCode === rCode),
      scanEvents: (state.scanEvents || []).filter((s: any) => s.restaurantCode === rCode),
      scanPoints: (state.scanPoints || []).filter((sp: any) => sp.restaurantCode === rCode),
      transfers: (state.transfers || []).filter((tr: any) => tr.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      payments: (state.payments || []).filter((pm: any) => pm.restaurantCode === rCode),
      branches: (state.branches || []).filter((b: any) => b.restaurantCode === rCode),
      stationUsers: redactStationUsers((state.stationUsers || []).filter((su: any) => su.restaurantCode === rCode)),
      pendingApprovals: (state.pendingApprovals || []).filter((pa: any) => pa.restaurantCode === rCode),
      shifts: (state.shifts || []).filter((sh: any) => sh.restaurantCode === rCode),
      cashierSessions: (state.cashierSessions || []).filter((cs: any) => cs.restaurantCode === rCode),
      auditLogs: (state.auditLogs || []).filter((a: any) => a.restaurantCode === rCode),
      expenses: (state.expenses || []).filter((e: any) => e.restaurantCode === rCode),
      notifications: (state.notifications || []).filter(
        (n: any) => !n.restaurantCode || n.restaurantCode === rCode
      ),
      plans: state.plans || [],
      licenses: (state.licenses || []).filter((lic: any) => lic.restaurantCode === rCode),
      studentSubscriptionSettings: state.studentSubscriptionSettings || {
        enabled: false,
        priceRwf: 500,
        period: 'monthly',
        graceDays: 3,
        plateTransfersRequireSubscription: true,
      },
      customerSubscriptions: (state.customerSubscriptions || []).filter((cs: any) => cs.restaurantCode === rCode),
      studentSubscriptionPayments: (state.studentSubscriptionPayments || []).filter((sp: any) => sp.restaurantCode === rCode),
      activationRequests: redactActivationRequests((state.activationRequests || []).filter((ar: any) => ar.restaurantCode === rCode)),
      pinRecoveryRequests: redactPinRecoveryRequests((state.pinRecoveryRequests || []).filter((pr: any) => pr.restaurantCode === rCode)),
      customTranslations: state.customTranslations || {},
    };
  }

  // Stand Staff: Scoped to their restaurant and branch
  if (user.role === 'stand_staff') {
    const rCode = user.restaurantCode;
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: redactCustomers((state.customers || []).filter((c: any) => c.restaurantCode === rCode)),
      ledgerEntries: (state.ledgerEntries || []).filter((l: any) => l.restaurantCode === rCode),
      scanEvents: (state.scanEvents || []).filter((s: any) => s.restaurantCode === rCode),
      scanPoints: (state.scanPoints || []).filter((sp: any) => sp.restaurantCode === rCode),
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      branches: (state.branches || []).filter((b: any) => b.restaurantCode === rCode),
      stationUsers: redactStationUsers((state.stationUsers || []).filter((su: any) => su.restaurantCode === rCode)),
      pendingApprovals: (state.pendingApprovals || []).filter((pa: any) => pa.restaurantCode === rCode),
      shifts: (state.shifts || []).filter((sh: any) => sh.restaurantCode === rCode),
      activationRequests: redactActivationRequests((state.activationRequests || []).filter((ar: any) => ar.restaurantCode === rCode)),
      pinRecoveryRequests: redactPinRecoveryRequests((state.pinRecoveryRequests || []).filter((pr: any) => pr.restaurantCode === rCode)),
      notifications: (state.notifications || []).filter(
        (n: any) => !n.restaurantCode || n.restaurantCode === rCode
      ),
      plans: state.plans || [],
      licenses: (state.licenses || []).filter((lic: any) => lic.restaurantCode === rCode),
      studentSubscriptionSettings: state.studentSubscriptionSettings || {
        enabled: false,
        priceRwf: 500,
        period: 'monthly',
        graceDays: 3,
        plateTransfersRequireSubscription: true,
      },
      customTranslations: state.customTranslations || {},
    };
  }

  // Customer: Restricted to only their own customer record & personal ledger
  if (user.role === 'customer') {
    const rCode = user.restaurantCode;
    const custId = user.userId;
    const dashEnt = checkServerStudentEntitlement(custId, 'customer_dashboard', state);
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: redactCustomers((state.customers || []).filter((c: any) => c.id === custId || c.memberNo === user.username)),
      ledgerEntries: dashEnt.allowed ? (state.ledgerEntries || []).filter((l: any) => l.customerId === custId) : [],
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      notifications: dashEnt.allowed
        ? (state.notifications || []).filter((n: any) => !n.targetCustomerId || n.targetCustomerId === custId)
        : [],
      studentSubscriptionSettings: state.studentSubscriptionSettings || {
        enabled: false,
        priceRwf: 500,
        period: 'monthly',
        graceDays: 3,
        plateTransfersRequireSubscription: true,
      },
      customerSubscriptions: (state.customerSubscriptions || []).filter((cs: any) => cs.customerId === custId),
      studentSubscriptionPayments: (state.studentSubscriptionPayments || []).filter((sp: any) => sp.customerId === custId),
      customTranslations: state.customTranslations || {},
    };
  }

  return null;
}

// GET /api/state: Authenticated, role-isolated database state (Finding 1)
app.get('/api/state', apiRateLimiter, requireAuth(), (req, res) => {
  if (!serverDbState) {
    return res.json({
      success: true,
      hasServerState: false,
      state: null,
    });
  }

  const scopedState = scopeStateForUser(serverDbState, req.user!);
  res.json({
    success: true,
    hasServerState: true,
    state: scopedState,
  });
});

// POST /api/state: Full-state replacement is disabled. Financial and identity state
// must be changed through audited, server-authoritative operations.
app.post(
  '/api/state',
  apiRateLimiter,
  requireAuth(['super_admin', 'restaurant_admin']),
  (_req, res) => res.status(410).json({
    success: false,
    error: 'Full-state replacement is disabled. Use server-authoritative, audited operations.',
  })
);

// POST /api/sync: Authenticated, validated incremental synchronization with Idempotency (Findings 5 & 6)
app.post('/api/sync', syncRateLimiter, requireAuth(), async (req, res) => {
  const { fullState } = req.body;
  const user = req.user!;

  if (fullState && typeof fullState === 'object') {
    if (!serverDbState) {
      // Never let an authenticated browser initialize the authoritative database.
      // Initial state must be provisioned by a trusted migration/bootstrap process.
      return res.status(503).json({
        success: false,
        error: 'Authoritative server state is not initialized. Client-side bootstrap is disabled.',
      });
    } else {
      const allowedRestoCode = user.role === 'super_admin' ? null : user.restaurantCode;

      // Identity creation and approval decisions are financial/security boundaries.
      // Until dedicated PostgreSQL transaction endpoints are available, reject those
      // writes instead of accepting browser-supplied customer or approval records.
      const currentCustomersById = new Map((serverDbState.customers || []).map((c: any) => [c.id, c]));
      const incomingCustomersForGuard = (fullState.customers || []).filter((c: any) =>
        c && c.id && (!allowedRestoCode || c.restaurantCode === allowedRestoCode)
      );
      const attemptedCustomerMutation = incomingCustomersForGuard.some((incoming: any) => {
        const previous: any = currentCustomersById.get(incoming.id);
        if (!previous) return user.role !== 'customer';
        if (user.role === 'customer' && incoming.id === user.userId) {
          return Object.keys(incoming).some((key) =>
            key !== 'cardStatus' && JSON.stringify(incoming[key]) !== JSON.stringify(previous[key])
          );
        }
        const merged = { ...previous, ...incoming, pinHash: previous.pinHash };
        return JSON.stringify(merged) !== JSON.stringify(previous);
      });

      const currentApprovalsById = new Map((serverDbState.pendingApprovals || []).map((a: any) => [a.id, a]));
      const incomingApprovalsForGuard = user.role === 'customer'
        ? []
        : (fullState.pendingApprovals || []).filter((a: any) =>
            a && a.id && (!allowedRestoCode || a.restaurantCode === allowedRestoCode)
          );
      const attemptedApprovalMutation = incomingApprovalsForGuard.some((incoming: any) => {
        const previous: any = currentApprovalsById.get(incoming.id);
        return !previous || JSON.stringify({ ...previous, ...incoming }) !== JSON.stringify(previous);
      });

      if (attemptedCustomerMutation || attemptedApprovalMutation) {
        return res.status(409).json({
          success: false,
          code: 'AUTHORITATIVE_WORKFLOW_REQUIRED',
          error: 'Customer registration, identity changes and pending-payment approvals cannot be written through client sync. Use the server-authoritative approval workflow; this operation is not enabled yet.',
        });
      }

      // 1. Merge & update customers with strict role & tenant ownership validation
      const incomingCustomers = (fullState.customers || []).filter((c: any) => {
        if (!c || !c.id) return false;
        if (allowedRestoCode && c.restaurantCode !== allowedRestoCode) return false;
        if (user.role === 'customer' && c.id !== user.userId) return false;
        return true;
      });
      const existingCustomersMap = new Map((serverDbState.customers || []).map((c: any) => [c.id, c]));
      for (const inc of incomingCustomers) {
        const prev: any = existingCustomersMap.get(inc.id);
        if (prev) {
          if (user.role === 'customer') {
            // Customers may lock their own card, but cannot unlock it or replace server PIN hashes through sync.
            existingCustomersMap.set(inc.id, {
              ...prev,
              cardStatus: inc.cardStatus === 'locked' ? 'locked' : prev.cardStatus,
            });
          } else if (user.role === 'stand_staff') {
            // Staff may register new customers, but existing identity, card and credential records are not writable through sync.
            existingCustomersMap.set(inc.id, prev);
          } else {
            existingCustomersMap.set(inc.id, {
              ...prev,
              ...inc,
              pinHash: prev.pinHash,
            });
          }
        } else if (user.role !== 'customer') {
          // Only staff/admins may create new customer records
          existingCustomersMap.set(inc.id, inc);
        }
      }
      serverDbState.customers = Array.from(existingCustomersMap.values());

      // Helper to merge ID-keyed collections scoped by restaurantCode
      const mergeScopedCollection = (key: string, allowUpdate = true) => {
        if (!Array.isArray(fullState[key])) return;
        const currentList: any[] = serverDbState[key] || [];
        const map = new Map(currentList.map((item: any) => [item.id, item]));
        for (const inc of fullState[key]) {
          if (!inc || !inc.id) continue;
          if (SEED_EXPENSE_IDS.has(inc.id) || SEED_NOTIFICATION_IDS.has(inc.id) || SEED_BRANCH_IDS.has(inc.id) || SEED_USER_IDS.has(inc.id)) continue;
          if (allowedRestoCode && inc.restaurantCode && inc.restaurantCode !== allowedRestoCode) continue;
          if (user.role === 'customer' && inc.customerId && inc.customerId !== user.userId) continue;
          const prev = map.get(inc.id);
          if (prev) {
            if (allowUpdate) {
              map.set(inc.id, { ...prev, ...inc });
            }
          } else {
            map.set(inc.id, inc);
          }
        }
        serverDbState[key] = Array.from(map.values());
      };

      // Financial ledger entries are written only by server-authoritative transactions.
      // Client-supplied entries are ignored for every role.
      const incomingLedgers: any[] = [];

      serverDbState.ledgerEntries = [...(serverDbState.ledgerEntries || []), ...incomingLedgers];

      // Scan events are written only by server-side transactional scan endpoints.
      // Client-supplied scan events are intentionally ignored for every role.

      // 4. Merge notifications & operational collections with role guards
      mergeScopedCollection('notifications', true);
      // Subscription entitlements and payment records are never accepted from browser sync.
      // Only a verified provider settlement or an audited server-side complimentary grant may write them.

      if (user.role !== 'customer') {
        // Pending approvals are read-only through sync; dedicated transactional endpoints are required.
        mergeScopedCollection('shifts', true);
        mergeScopedCollection('activationRequests', user.role !== 'stand_staff');
        mergeScopedCollection('pinRecoveryRequests', user.role !== 'stand_staff');
      }

      if (user.role === 'restaurant_admin' || user.role === 'super_admin') {
        // Payment records and subscription state are manager-controlled, never staff/customer sync data.
        mergeScopedCollection('packages', true);
        mergeScopedCollection('menuItems', true);
        mergeScopedCollection('branches', true);
        mergeScopedCollection('scanPoints', true);
        // Staff secrets are hashed before persistence; browser state cannot read stored hashes.
        if (Array.isArray(fullState.stationUsers)) {
          const staffMap = new Map((serverDbState.stationUsers || []).map((item: any) => [item.id, item]));
          for (const incoming of fullState.stationUsers) {
            if (!incoming?.id || !incoming?.username || !incoming?.restaurantCode || SEED_USER_IDS.has(incoming.id)) continue;
            if (allowedRestoCode && incoming.restaurantCode !== allowedRestoCode) continue;
            const previous: any = staffMap.get(incoming.id);
            const station = (serverDbState.scanPoints || []).find((point: any) =>
              point.id === incoming.stationId && point.restaurantCode === incoming.restaurantCode
            );
            if (!station || !/^[a-zA-Z0-9._-]{3,64}$/.test(String(incoming.username))) continue;
            const suppliedPassword = typeof incoming.passwordHash === 'string' ? incoming.passwordHash : '';
            const suppliedPin = typeof incoming.pin === 'string' ? incoming.pin : '';
            if (suppliedPassword && suppliedPassword.length < 12) {
              return res.status(400).json({ success: false, error: 'Staff passwords must contain at least 12 characters.' });
            }
            if (suppliedPin && !/^\d{8,}$/.test(suppliedPin)) {
              return res.status(400).json({ success: false, error: 'Staff PINs must contain at least 8 digits.' });
            }
            if (previous) {
              const passwordChanged = suppliedPassword
                ? (suppliedPassword.startsWith('scrypt$')
                    ? suppliedPassword !== previous.passwordHash
                    : !verifyServerStaffSecret(suppliedPassword, previous.passwordHash))
                : false;
              const pinChanged = suppliedPin
                ? (suppliedPin.startsWith('scrypt$')
                    ? suppliedPin !== previous.pin
                    : !verifyServerStaffSecret(suppliedPin, previous.pin))
                : false;
              const assignmentChanged =
                (incoming.stationId !== undefined && incoming.stationId !== previous.stationId) ||
                (incoming.status !== undefined && incoming.status !== previous.status);
              staffMap.set(incoming.id, {
                ...previous, ...incoming,
                id: previous.id, restaurantCode: previous.restaurantCode,
                passwordHash: suppliedPassword
                  ? (suppliedPassword.startsWith('scrypt$') ? suppliedPassword : (passwordChanged ? hashServerStaffSecret(suppliedPassword) : previous.passwordHash))
                  : previous.passwordHash,
                pin: suppliedPin
                  ? (suppliedPin.startsWith('scrypt$') ? suppliedPin : (pinChanged ? hashServerStaffSecret(suppliedPin) : previous.pin))
                  : previous.pin,
                sessionVersion: Number(previous.sessionVersion || 1) + (passwordChanged || pinChanged || assignmentChanged ? 1 : 0),
              });
            } else {
              if (suppliedPassword.length < 12) {
                return res.status(400).json({ success: false, error: 'A new staff account requires a password of at least 12 characters.' });
              }
              staffMap.set(incoming.id, {
                ...incoming,
                passwordHash: suppliedPassword.startsWith('scrypt$') ? suppliedPassword : hashServerStaffSecret(suppliedPassword),
                pin: suppliedPin ? (suppliedPin.startsWith('scrypt$') ? suppliedPin : hashServerStaffSecret(suppliedPin)) : '',
                sessionVersion: 1,
              });
            }
          }
          serverDbState.stationUsers = Array.from(staffMap.values());
        }
        mergeScopedCollection('cashierSessions', true);
        mergeScopedCollection('expenses', true);

        // Allow restaurant admin to update their own restaurant branding/policies
        if (Array.isArray(fullState.restaurants)) {
          const rMap = new Map((serverDbState.restaurants || []).map((r: any) => [r.code, r]));
          const restaurantAdminFields = [
            'name', 'address', 'phone', 'email', 'logoUrl', 'primaryColor',
            'secondaryColor', 'welcomeMessage', 'description', 'website',
            'contactName', 'openingHours', 'timezone',
          ];
          for (const incR of fullState.restaurants) {
            if (!incR || !incR.code) continue;
            if (allowedRestoCode && incR.code !== allowedRestoCode) continue;
            const prevR: any = rMap.get(incR.code);
            if (user.role !== 'super_admin' && !prevR) continue;
            if (user.role === 'super_admin') {
              rMap.set(incR.code, prevR ? { ...prevR, ...incR } : incR);
            } else {
              const safeUpdate: any = {};
              for (const field of restaurantAdminFields) {
                if (Object.prototype.hasOwnProperty.call(incR, field)) safeUpdate[field] = incR[field];
              }
              rMap.set(incR.code, { ...prevR, ...safeUpdate });
            }
          }
          serverDbState.restaurants = Array.from(rMap.values());
        }
      }

      if (user.role === 'super_admin') {
        mergeScopedCollection('plans', true);
        mergeScopedCollection('licenses', true);
        if (fullState.studentSubscriptionSettings) {
          serverDbState.studentSubscriptionSettings = {
            ...serverDbState.studentSubscriptionSettings,
            ...fullState.studentSubscriptionSettings,
          };
        }
        if (fullState.customTranslations) {
          serverDbState.customTranslations = {
            ...(serverDbState.customTranslations || {}),
            ...fullState.customTranslations,
          };
        }
      }
    }

    const savedOk = await queueDbSave(serverDbState);
    if (!savedOk) {
      return res.status(500).json({
        success: false,
        error: 'Database persistence error: Failed to commit sync atomically.',
      });
    }

    const scopedState = scopeStateForUser(serverDbState, user);
    return res.json({
      success: true,
      serverState: scopedState,
      serverTime: new Date().toISOString(),
    });
  }

  const scopedState = scopeStateForUser(serverDbState, user);
  return res.json({
    success: true,
    serverState: scopedState,
    serverTime: new Date().toISOString(),
  });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Authority Error]', err);
  res.status(500).json({
    success: false,
    error: 'An internal server error occurred. Transaction was aborted.',
  });
});

// ----------------------------------------------------
// Server Lifecycle
// ----------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  let viteLoaded = false;

  if (isProduction) {
    const requiredCredentials = [
      ['RESTOPASS_SUPERADMIN_PASSWORD', process.env.RESTOPASS_SUPERADMIN_PASSWORD],


    ] as const;
    for (const [name, value] of requiredCredentials) {
      const minimumLength = 16;
      if (!value || value.length < minimumLength) throw new Error(`[FATAL] ${name} must be configured with at least ${minimumLength} characters in production.`);
    }
    if (!isRedisConfigured()) throw new Error('[FATAL] REDIS_URL is required in production for distributed scanner rate limiting.');
    if (!(await ensureRedisReady(10000))) throw new Error('[FATAL] Redis did not become ready; production startup is aborted so scanner protection cannot silently degrade.');
    if (!isPostgresConfigured()) throw new Error('[FATAL] DATABASE_URL is required in production. Refusing to start with local JSON persistence.');
  }
  if (isPostgresConfigured()) {
    console.log('[Server Authority] PostgreSQL detected. Connecting and initializing schema...');
    const initialized = await initPostgres(serverDbState);
    if (!initialized) throw new Error('[FATAL] PostgreSQL initialization failed. Production startup is aborted; no JSON fallback is permitted.');
    const pgState = await loadStateFromPostgres();
    if (!pgState) throw new Error('[FATAL] Could not load authoritative state from PostgreSQL. Startup is aborted.');
    serverDbState = pgState;
    ensureServerDbDefaults(serverDbState);
    console.log('[Server Authority] Authoritative state loaded from PostgreSQL.');
  } else {
    console.log('[Server Authority] Running in local storage mode (development only).');
  }

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      viteLoaded = true;
      console.log('[Server Authority] Vite development middleware active');
    } catch (viteErr: any) {
      console.warn('[Server Authority] Vite middleware unavailable, activating resilient static SPA server:', viteErr?.message || viteErr);
    }
  }

  if (isProduction || !viteLoaded) {
    const staticDir = fs.existsSync(path.resolve(process.cwd(), 'dist'))
      ? path.resolve(process.cwd(), 'dist')
      : process.cwd();
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      const htmlFile = fs.existsSync(path.join(staticDir, 'index.html'))
        ? path.join(staticDir, 'index.html')
        : path.resolve(process.cwd(), 'index.html');
      res.sendFile(htmlFile);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RestoPass Authority] Hardened Full-Stack Server listening on port ${PORT}`);
    console.log(`[RestoPass Authority] Access the application in browser at: http://localhost:${PORT}`);
  });
}

// Start only when directly executed (allows test imports without port binding)
const isDirectRun = Boolean(process.argv[1] && /(server\.(ts|js)|[\\/]server)$/i.test(process.argv[1]));
if (process.env.NODE_ENV !== 'test' && isDirectRun) {
  startServer();
}

function getServerDbState() {
  return serverDbState;
}

function setServerDbState(newState: any) {
  serverDbState = newState;
  ensureServerDbDefaults(serverDbState);
}

export {
  app,
  atomicSaveDb,
  queueDbSave,
  createSessionToken,
  verifySessionToken,
  scopeStateForUser,
  timingSafeCompare,
  checkServerStudentEntitlement,
  ensureServerDbDefaults,
  getServerDbState,
  setServerDbState,
  validateProductionSecrets,
  revokeSessionToken,
  isPlaceholderSecret,
};
