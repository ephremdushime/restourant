import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  isPostgresConfigured,
  checkPostgresReady,
  initPostgres,
  loadStateFromPostgres,
  saveStateToPostgres,
  insertLedgerEntryPostgres,
  commitPlateTransferPostgres,
} from './src/services/db/postgresAdapter';
import { recordTokenScan, isRedisConfigured, checkRedisReady } from './src/services/cache/redisClient';
import { uploadBase64Photo } from './src/services/storage/objectStorage';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Configure trust proxy for cloud deployment (Cloudflare, AWS ALB, Nginx, Railway, Render)
const trustProxySetting = process.env.TRUST_PROXY?.trim().toLowerCase();
if (trustProxySetting === 'true') {
  app.set('trust proxy', true);
} else if (trustProxySetting === 'false' || trustProxySetting === '0') {
  app.set('trust proxy', false);
} else if (trustProxySetting && /^\d+$/.test(trustProxySetting)) {
  app.set('trust proxy', Number(trustProxySetting));
} else if (trustProxySetting) {
  // Explicit trusted proxy subnet(s), e.g. loopback or a private reverse-proxy network.
  app.set('trust proxy', trustProxySetting);
} else {
  // Do not trust client-supplied X-Forwarded-* headers unless the operator opts in.
  app.set('trust proxy', false);
}

// Cryptographic secrets for session signing & data integrity
const DEV_SESSION_SECRET = crypto
  .createHash('sha256')
  .update('RESTOPASS_DEV_EPHEMERAL_SESSION_KEY_V1')
  .digest('hex');
const DEV_MASTER_SECRET = ['RESTOPASS', 'RWANDA', 'MASTER', '2026', 'SUPER', 'ADMIN', 'EPHREM'].join('_');

const FORBIDDEN_PLACEHOLDERS = [
  'REPLACE_WITH',
  'CHANGE_ME',
  'CHANGE_THIS',
  'CHANGETHIS',
  'YOUR_SECRET',
  'EXAMPLE_SECRET',
  'GENERATE_',
  'CONFIGURE_',
  'YOUR_',
];

function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): {
  sessionSecret: string;
  masterSecret: string;
} {
  const isProd = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET?.trim() || '';
  const masterSecret = (env.RESTOPASS_MASTER_SECRET || env.RESTOPASS_MASTER_KEY || '')?.trim();

  if (isProd) {
    if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === DEV_SESSION_SECRET) {
      throw new Error(
        '[FATAL SECURITY ERROR] SESSION_SECRET (>= 32 characters) must be configured in production environment. Server startup aborted.'
      );
    }
    if (FORBIDDEN_PLACEHOLDERS.some((p) => sessionSecret.toUpperCase().includes(p))) {
      throw new Error(
        '[FATAL SECURITY ERROR] SESSION_SECRET contains an unconfigured placeholder. Generate a strong random production secret.'
      );
    }

    if (!masterSecret || masterSecret.length < 32 || masterSecret === DEV_MASTER_SECRET) {
      throw new Error(
        '[FATAL SECURITY ERROR] RESTOPASS_MASTER_SECRET (>= 32 characters) must be configured in production environment. Server startup aborted.'
      );
    }
    if (FORBIDDEN_PLACEHOLDERS.some((p) => masterSecret.toUpperCase().includes(p))) {
      throw new Error(
        '[FATAL SECURITY ERROR] RESTOPASS_MASTER_SECRET contains an unconfigured placeholder. Generate a strong random production secret.'
      );
    }

    const requiredAdminPasswords = [
      ['RESTOPASS_SUPERADMIN_PASSWORD', env.RESTOPASS_SUPERADMIN_PASSWORD],
      ['RESTOPASS_BOSS_PASSWORD', env.RESTOPASS_BOSS_PASSWORD],
    ] as const;
    for (const [name, value] of requiredAdminPasswords) {
      const secret = value?.trim() || '';
      if (secret.length < 16 || FORBIDDEN_PLACEHOLDERS.some((p) => secret.toUpperCase().includes(p))) {
        throw new Error(`[FATAL SECURITY ERROR] ${name} must be configured with at least 16 non-placeholder characters in production.`);
      }
    }

    const staffPin = env.RESTOPASS_STAFF_DEFAULT_PIN?.trim();
    if (staffPin && !/^\d{6,8}$/.test(staffPin)) {
      throw new Error('[FATAL SECURITY ERROR] RESTOPASS_STAFF_DEFAULT_PIN must be 6-8 digits when configured.');
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
  // An empty but correctly shaped database is valid on first cloud boot;
  // the super-admin must be able to onboard the first restaurant.
  return Boolean(obj && typeof obj === 'object' && Array.isArray(obj.restaurants) && Array.isArray(obj.customers));
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
  if (!state.transfers) state.transfers = [];
  if (!state.auditLogs) state.auditLogs = [];
  if (!state.shifts) state.shifts = [];
  if (!state.cashierSessions) state.cashierSessions = [];
  if (!state.packages) state.packages = [];
  if (!state.menuItems) state.menuItems = [];
  if (!state.plans) state.plans = [];
  if (!state.customTranslations) state.customTranslations = {};
  if (!state.usedTokens) state.usedTokens = [];
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
  if (!state.subscriptionPayments) state.subscriptionPayments = [];
  if (!state.activationCodes) state.activationCodes = [];
  if (!state.restaurantSubscriptions) state.restaurantSubscriptions = [];
  if (!state.restaurantSubscriptionPayments) state.restaurantSubscriptionPayments = [];
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
      try {
        fs.writeFileSync(DB_FILE, serialized, { encoding: 'utf-8', flag: 'w' });
        saved = true;
      } catch (writeErr) {
        console.error('[Server Authority] Final persistence fallback failed:', writeErr);
      }
      try { fs.unlinkSync(tempFile); } catch {}
    }
    return saved;
  } catch (err) {
    console.error('[Server Authority] Critical Error persisting database:', err);
    return false;
  }
}

if (serverDbState) {
  atomicSaveDb(serverDbState);
}

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
        const fileOk = atomicSaveDb(state);
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
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none';"
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

// Periodic memory pruning to prevent unbound Map growth in high DAU production
setInterval(() => {
  const now = Date.now();
  for (const store of rateLimitStores.values()) {
    for (const [ip, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(ip);
      }
    }
  }
}, 5 * 60 * 1000).unref();

const authRateLimiter = createRateLimiter('auth', 20, 60 * 1000); // 20 attempts per minute
const activationRateLimiter = createRateLimiter('activation', 5, 15 * 60 * 1000); // 5 activation attempts per 15 minutes
const recoveryRateLimiter = createRateLimiter('recovery', 5, 15 * 60 * 1000); // 5 recovery attempts per 15 minutes
const apiRateLimiter = createRateLimiter('api', 120, 60 * 1000); // 120 requests per minute
const syncRateLimiter = createRateLimiter('sync', 40, 60 * 1000); // 40 syncs per minute

// Request body parser with scoped limits (supports patron portrait uploads)
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'public/uploads')));

// ----------------------------------------------------
// Cryptographic Session Engine & Token Verification (Finding 1 & 4)
// ----------------------------------------------------
export interface UserSession {
  userId: string;
  username: string;
  role: 'stand_staff' | 'restaurant_admin' | 'customer' | 'super_admin';
  restaurantCode: string;
  stationId?: string;
  iat: number;
  exp: number;
}

const revokedTokens = new Set<string>();

// Periodic pruning of expired revoked session tokens
setInterval(() => {
  const now = Date.now();
  for (const token of revokedTokens) {
    const parts = token.slice('rp_sess_'.length).split('.');
    if (parts.length === 2) {
      try {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
        if (payload.exp && payload.exp < now) {
          revokedTokens.delete(token);
        }
      } catch {
        revokedTokens.delete(token);
      }
    }
  }
}, 10 * 60 * 1000).unref();

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
function verifySessionToken(token: string): UserSession | null {
  try {
    if (!token || !token.startsWith('rp_sess_')) return null;
    if (revokedTokens.has(token)) return null;

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
    if (!payload.userId || !payload.role || !payload.exp) return null;

    if (Date.now() > payload.exp) {
      return null;
    }

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
function requireAuth(allowedRoles?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || (req.headers['x-restopass-token'] as string);
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (authHeader) {
      token = authHeader.trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in to access this resource.',
      });
    }

    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session. Please sign in again.',
      });
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

// Readiness is stricter than liveness: configured durable dependencies must answer.
app.get('/api/ready', async (_req, res) => {
  const checks: Record<string, boolean> = {
    applicationState: Boolean(serverDbState),
    database: !isPostgresConfigured(),
    cache: !isRedisConfigured(),
  };
  if (isPostgresConfigured()) checks.database = await checkPostgresReady();
  if (isRedisConfigured()) checks.cache = await checkRedisReady();

  const ready = Object.values(checks).every(Boolean);
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
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
    const isProd = process.env.NODE_ENV === 'production';
    const configuredSuperAdminPassword = process.env.RESTOPASS_SUPERADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD;
    if (isProd && !configuredSuperAdminPassword) {
      console.error('[SECURITY ERROR] Super Admin login attempted in production, but RESTOPASS_SUPERADMIN_PASSWORD is not configured.');
      return res.status(500).json({ success: false, error: 'Super Admin login disabled: Administrator password not set in environment.' });
    }

    const validPassword = configuredSuperAdminPassword
      ? timingSafeCompare(password || '', configuredSuperAdminPassword)
      : (!isProd && typeof password === 'string' && password.length >= 8);

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

  // 2. Restaurant Admin / Boss Authentication
  if (role === 'restaurant_admin') {
    if (!restaurantCode) {
      return res.status(400).json({ success: false, error: 'Restaurant code is required' });
    }
    const isProd = process.env.NODE_ENV === 'production';
    const configuredBossPassword = process.env.RESTOPASS_BOSS_PASSWORD || process.env.BOSS_PASSWORD;
    const validPassword = configuredBossPassword
      ? timingSafeCompare(password || '', configuredBossPassword)
      : (!isProd && typeof password === 'string' && password.length >= 6);

    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid Restaurant Administrator credentials' });
    }

    const currentResto = (serverDbState?.restaurants || []).find((r: any) => r.code === restaurantCode);
    if (!currentResto || currentResto.status === 'suspended' || currentResto.status === 'expired') {
      return res.status(403).json({ success: false, error: 'Restaurant is unavailable or not authorized for administrator access.' });
    }
    const safeBossUsername = (username || `admin_${restaurantCode}@example.local`).trim();
    const token = createSessionToken({
      userId: `admin_${restaurantCode}`,
      username: safeBossUsername,
      role: 'restaurant_admin',
      restaurantCode,
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'restaurant_admin',
        username: safeBossUsername,
        restaurantCode,
        userLabel: `${currentResto?.name || restaurantCode} Boss Admin`,
      },
    });
  }

  // 3. Stand POS Staff Authentication
  if (role === 'stand_staff') {
    if (!restaurantCode) {
      return res.status(400).json({ success: false, error: 'Restaurant code is required' });
    }
    const isProd = process.env.NODE_ENV === 'production';
    const entered = (pin || password || '').trim();
    const configuredStaffPin = process.env.RESTOPASS_STAFF_DEFAULT_PIN;
    const matchingStaffUser = (serverDbState?.stationUsers || []).find(
      (u: any) => u.restaurantCode === restaurantCode && (u.username === username || u.id === username)
    );

    let validPin = false;
    if (matchingStaffUser?.pin) {
      validPin = timingSafeCompare(entered, matchingStaffUser.pin);
    } else if (configuredStaffPin && !isProd) {
      validPin = timingSafeCompare(entered, configuredStaffPin);
    } else if (!isProd) {
      validPin = timingSafeCompare(entered, '1234') || (entered.length >= 4);
    }

    if (!validPin) {
      return res.status(401).json({ success: false, error: 'Invalid Staff PIN or Password' });
    }

    const safeStaffUsername = (username || 'operator').trim();
    const token = createSessionToken({
      userId: `staff_${safeStaffUsername}_${restaurantCode}`,
      username: safeStaffUsername,
      role: 'stand_staff',
      restaurantCode,
      stationId: stationId || 'stand_1',
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'stand_staff',
        username: safeStaffUsername,
        restaurantCode,
        stationId: stationId || 'stand_1',
        userLabel: `Staff: ${safeStaffUsername || 'Stand Operator'}`,
      },
    });
  }

  // 4. Customer Meal Pass Authentication
  if (role === 'customer') {
    const customers = serverDbState?.customers || [];
    if (typeof restaurantCode !== 'string' || !restaurantCode.trim() || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Restaurant selection and customer identifier are required.' });
    }
    const cleanCustomerIdentifier = username.trim();
    const cust = customers.find(
      (c: any) =>
        c.restaurantCode === restaurantCode &&
        (c.memberNo === cleanCustomerIdentifier ||
          c.phone === cleanCustomerIdentifier ||
          c.id === cleanCustomerIdentifier)
    );

    // Use the dedicated customer-authentication error to avoid account enumeration.
    if (!cust) {
      return res.status(401).json({ success: false, error: 'Invalid phone number or PIN' });
    }
    if (cust.lockedUntil && new Date(cust.lockedUntil).getTime() > Date.now()) {
      return res.status(423).json({ success: false, error: 'Account temporarily locked. Please try again later or visit cafeteria reception.' });
    }
    if (cust.provisionalStatus === 'pending_approval' ||
        cust.provisionalStatus === 'rejected' ||
        cust.activationStatus === 'ready_for_activation' ||
        cust.activationStatus === 'suspended') {
      return res.status(403).json({ success: false, error: 'Customer account is not active. Please contact cafeteria management.' });
    }

    const previousPinHash = cust.pinHash;
    const validPin = verifyServerCustomerPin(pin || '', cust) ||
      (process.env.NODE_ENV !== 'production' && !cust.hasCustomPin && (pin === '1234' || pin === '123456'));
    if (!validPin) {
      cust.failedLoginAttempts = (cust.failedLoginAttempts || 0) + 1;
      if (cust.failedLoginAttempts >= 5) {
        cust.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await queueDbSave(serverDbState);
      return res.status(401).json({ success: false, error: 'Invalid phone number or PIN' });
    }

    cust.failedLoginAttempts = 0;
    cust.lockedUntil = null;
    cust.lastLoginAt = new Date().toISOString();
    if (cust.pinHash !== previousPinHash) {
      console.info('[Auth] Upgraded legacy customer PIN hash to scrypt.');
    }
    await queueDbSave(serverDbState);

    const token = createSessionToken({
      userId: cust.id,
      username: cust.memberNo,
      role: 'customer',
      restaurantCode: cust.restaurantCode,
    });

    return res.json({
      success: true,
      token,
      user: {
        role: 'customer',
        username: cust.memberNo,
        restaurantCode: cust.restaurantCode,
        userLabel: `${cust.name} (#${cust.memberNo})`,
        customerId: cust.id,
      },
    });
  }

  return res.status(400).json({ success: false, error: 'Unsupported role' });
});

// GET /api/auth/session: Verify current session token
app.get('/api/auth/session', apiRateLimiter, requireAuth(), (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// POST /api/auth/logout: Revoke session token
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || (req.headers['x-restopass-token'] as string);
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (token) {
    revokedTokens.add(token);
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// ----------------------------------------------------
// Customer Non-SMS Authentication, Activation & Recovery Endpoints (Section 4)
// ----------------------------------------------------

function computeServerCustomerPinHash(pin: string, _customerId: string, _memberNo: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin.trim(), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

function verifyServerCustomerPin(enteredPin: string, customer: any): boolean {
  if (!enteredPin || !customer) return false;
  const cleanEntered = enteredPin.trim();
  const expected = typeof customer.pinHash === 'string' ? customer.pinHash.trim() : '';
  if (!expected) return false;

  if (expected.startsWith('scrypt$')) {
    const parts = expected.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    const salt = parts[4];
    const storedHash = parts[5];
    if (cost !== 16384 || blockSize !== 8 || parallelization !== 1 ||
        !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(storedHash)) {
      return false;
    }
    const actual = crypto.scryptSync(cleanEntered, salt, 64, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    }).toString('hex');
    return timingSafeCompare(actual, storedHash);
  }

  // Legacy SHA-256 PIN formats are accepted only to migrate existing accounts.
  // Successful verification immediately replaces the weak hash with scrypt.
  const legacySalts = [
    `RESTOPASS_CUST_SALT:${customer.id}:${customer.memberNo}`,
    `RESTOPASS_CUST_PIN_SALT_${customer.id}_${customer.memberNo}`,
  ];
  const legacyHashes = legacySalts.map((salt) =>
    crypto.createHash('sha256')
      .update(`RESTOPASS_SALTED_PIN_V1:${salt}:${cleanEntered}`)
      .digest('hex')
  );
  legacyHashes.push(crypto.createHash('sha256').update(cleanEntered).digest('hex'));

  if (legacyHashes.some((hash) => timingSafeCompare(hash, expected))) {
    customer.pinHash = computeServerCustomerPinHash(cleanEntered, customer.id, customer.memberNo);
    customer.hasCustomPin = true;
    return true;
  }
  return false;
}

// POST /api/customer/auth/login: Authenticate phone number + 6+ digit PIN (Rate-limited, lockout, generic error)
app.post('/api/customer/auth/login', authRateLimiter, async (req, res) => {
  const { phone, pin, username, restaurantCode } = req.body;
  const cleanPhone = typeof phone === 'string' ? phone.trim() : typeof username === 'string' ? username.trim() : '';
  const cleanPin = typeof pin === 'string' ? pin.trim() : '';
  if (typeof restaurantCode !== 'string' || !restaurantCode.trim()) {
    return res.status(400).json({ success: false, error: 'Restaurant selection is required.' });
  }

  const customers = serverDbState?.customers || [];
  const cust = customers.find(
    (c: any) =>
      c.restaurantCode === restaurantCode &&
      (c.phone === cleanPhone ||
        (c.phone && c.phone.replace(/\s+/g, '') === cleanPhone.replace(/\s+/g, '')) ||
        c.memberNo === cleanPhone ||
        c.id === cleanPhone)
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
  if (cust.activationStatus === 'suspended') {
    return res.status(403).json({ success: false, error: 'Customer account is suspended. Please contact cafeteria management.' });
  }

  const previousPinHash = cust.pinHash;
  const isPinValid = verifyServerCustomerPin(cleanPin, cust);
  if (!isPinValid) {
    cust.failedLoginAttempts = (cust.failedLoginAttempts || 0) + 1;
    if (cust.failedLoginAttempts >= 5) {
      cust.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    await queueDbSave(serverDbState);
    return res.status(401).json({ success: false, error: 'Invalid phone number or PIN' });
  }

  // Login success
  cust.failedLoginAttempts = 0;
  cust.lockedUntil = null;
  cust.lastLoginAt = new Date().toISOString();
  if (cust.pinHash !== previousPinHash) console.info('[Auth] Upgraded legacy customer PIN hash to scrypt.');
  await queueDbSave(serverDbState); // Persists lockout reset and any legacy PIN-hash upgrade.

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
app.post('/api/customer/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || (req.headers['x-restopass-token'] as string);
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }
  if (token) revokedTokens.add(token);
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

// POST /api/customer/activation/request: Staff-issued short-lived, single-use activation code
app.post(
  '/api/customer/activation/request',
  apiRateLimiter,
  requireAuth(['stand_staff', 'restaurant_admin', 'super_admin']),
  async (req, res) => {
    if (!serverDbState) return res.status(503).json({ success: false, error: 'Server state is not initialized.' });
    const { customerId, memberNo, phone } = req.body || {};
    const requestedIdentifier = [customerId, memberNo, phone].find((value) => typeof value === 'string' && value.trim());
    if (!requestedIdentifier) return res.status(400).json({ success: false, error: 'Customer identifier is required.' });
    const cust = (serverDbState.customers || []).find((item: any) =>
      (req.user!.role === 'super_admin' || item.restaurantCode === req.user!.restaurantCode) &&
      (item.id === requestedIdentifier || item.memberNo === requestedIdentifier || item.phone === requestedIdentifier)
    );
    if (!cust) return res.status(404).json({ success: false, error: 'Customer not found in your authorized restaurant.' });
    if (cust.provisionalStatus === 'pending_approval') {
      return res.status(400).json({ success: false, error: 'Registration is pending boss approval before activation.' });
    }
    if (cust.provisionalStatus === 'rejected' || cust.activationStatus === 'suspended') {
      return res.status(400).json({ success: false, error: 'Account is rejected or suspended.' });
    }
    if (cust.activationStatus === 'active') {
      return res.status(409).json({ success: false, error: 'Customer account is already active.' });
    }

    if (!Array.isArray(serverDbState.activationRequests)) serverDbState.activationRequests = [];
    const previousRequests = serverDbState.activationRequests.map((item: any) => ({ ...item }));
    serverDbState.activationRequests.forEach((item: any) => {
      if (item.customerId === cust.id && !item.used) item.used = true;
    });
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = serverHmac(MASTER_KEY, \`ACTIVATION:\${cust.id}:\${code}\`);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const activationRecord = {
      id: \`act_\${crypto.randomUUID()}\`,
      customerId: cust.id,
      memberNo: cust.memberNo,
      phone: cust.phone,
      restaurantCode: cust.restaurantCode,
      codeHash,
      authorizingStaffId: req.user!.userId,
      authorizingStaffName: req.user!.username,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    };
    serverDbState.activationRequests.unshift(activationRecord);
    const saved = await queueDbSave(serverDbState);
    if (!saved) {
      serverDbState.activationRequests = previousRequests;
      return res.status(500).json({ success: false, error: 'Activation code could not be stored. No code was issued.' });
    }
    return res.json({ success: true, activationCode: code, expiresAt, memberNo: cust.memberNo, customerName: cust.name });
  }
);

// POST /api/customer/activation/complete: Customer privately sets their PIN
app.post('/api/customer/activation/complete', activationRateLimiter, async (req, res) => {
  if (!serverDbState) return res.status(503).json({ success: false, error: 'Server state is not initialized.' });
  const { phoneOrMember, activationCode, newPin, restaurantCode } = req.body || {};
  const cleanIdentifier = typeof phoneOrMember === 'string' ? phoneOrMember.trim() : '';
  const cleanPin = typeof newPin === 'string' ? newPin.trim() : '';
  const cleanCode = typeof activationCode === 'string' ? activationCode.trim() : '';
  if (typeof restaurantCode !== 'string' || !restaurantCode.trim() || !cleanIdentifier || !cleanCode) {
    return res.status(400).json({ success: false, error: 'Restaurant, customer identifier and activation code are required.' });
  }
  if (!/^\d{6,}$/.test(cleanPin)) {
    return res.status(400).json({ success: false, error: 'PIN must be at least 6 numeric digits.' });
  }
  const cust = (serverDbState.customers || []).find((item: any) =>
    item.restaurantCode === restaurantCode &&
    (item.phone === cleanIdentifier ||
      (item.phone && item.phone.replace(/\s+/g, '') === cleanIdentifier.replace(/\s+/g, '')) ||
      item.memberNo === cleanIdentifier ||
      item.id === cleanIdentifier)
  );
  if (!cust || cust.provisionalStatus === 'pending_approval' ||
      cust.provisionalStatus === 'rejected' || cust.activationStatus === 'suspended') {
    return res.status(400).json({ success: false, error: 'Invalid activation credentials or code.' });
  }
  if (cust.activationStatus === 'active') {
    return res.status(409).json({ success: false, error: 'Customer account is already active.' });
  }
  const requests = serverDbState.activationRequests || [];
  const expectedCodeHash = serverHmac(MASTER_KEY, \`ACTIVATION:\${cust.id}:\${cleanCode}\`);
  const legacyCodeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
  const actReq = requests.find((item: any) =>
    item.customerId === cust.id &&
    item.restaurantCode === cust.restaurantCode &&
    !item.used &&
    new Date(item.expiresAt).getTime() > Date.now() &&
    (timingSafeCompare(item.codeHash || '', expectedCodeHash) ||
      item.activationCode === cleanCode ||
      item.codeHash === legacyCodeHash)
  );
  if (!actReq) return res.status(400).json({ success: false, error: 'Invalid, expired, or already used activation code.' });

  const previousCustomer = { ...cust };
  const previousRequest = { ...actReq };
  cust.pinHash = computeServerCustomerPinHash(cleanPin, cust.id, cust.memberNo);
  cust.hasCustomPin = true;
  cust.pinSetAt = new Date().toISOString();
  cust.activationStatus = 'active';
  cust.failedLoginAttempts = 0;
  cust.lockedUntil = null;
  cust.cardReadyForPrint = true;
  actReq.used = true;
  actReq.usedAt = new Date().toISOString();
  delete actReq.activationCode;
  const saved = await queueDbSave(serverDbState);
  if (!saved) {
    Object.assign(cust, previousCustomer);
    Object.assign(actReq, previousRequest);
    return res.status(500).json({ success: false, error: 'Activation could not be committed. No account changes were confirmed.' });
  }
  const token = createSessionToken({ userId: cust.id, username: cust.phone || cust.memberNo, role: 'customer', restaurantCode: cust.restaurantCode });
  return res.json({
    success: true,
    token,
    customer: { id: cust.id, name: cust.name, memberNo: cust.memberNo, phone: cust.phone, restaurantCode: cust.restaurantCode },
  });
});

// POST /api/customer/recovery/request: Create tenant-scoped PIN recovery request
app.post('/api/customer/recovery/request', recoveryRateLimiter, async (req, res) => {
  if (!serverDbState) return res.status(503).json({ success: false, error: 'Server state is not initialized.' });
  const { customerId, phone, reason, idVerificationMethod, restaurantCode } = req.body || {};
  if (typeof restaurantCode !== 'string' || !restaurantCode.trim()) {
    return res.status(400).json({ success: false, error: 'Restaurant selection is required.' });
  }
  const identifier = typeof customerId === 'string' && customerId.trim()
    ? customerId.trim()
    : typeof phone === 'string' ? phone.trim() : '';
  const cust = (serverDbState.customers || []).find((item: any) =>
    item.restaurantCode === restaurantCode && (item.id === identifier || item.phone === identifier)
  );
  if (!cust) return res.status(404).json({ success: false, error: 'Customer not found in the selected restaurant.' });
  const allowedMethods = ['student_id_check', 'national_id_check', 'photo_match', 'manager_override'];
  if (idVerificationMethod && !allowedMethods.includes(idVerificationMethod)) {
    return res.status(400).json({ success: false, error: 'Unsupported identity verification method.' });
  }
  if (!Array.isArray(serverDbState.pinRecoveryRequests)) serverDbState.pinRecoveryRequests = [];
  const requestId = \`rec_\${crypto.randomUUID()}\`;
  const recReq = {
    id: requestId,
    customerId: cust.id,
    memberNo: cust.memberNo,
    phone: cust.phone,
    restaurantCode: cust.restaurantCode,
    reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : 'Customer forgotten PIN',
    idVerificationMethod: idVerificationMethod || 'student_id_check',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  serverDbState.pinRecoveryRequests.unshift(recReq);
  const saved = await queueDbSave(serverDbState);
  if (!saved) {
    serverDbState.pinRecoveryRequests = serverDbState.pinRecoveryRequests.filter((item: any) => item.id !== requestId);
    return res.status(500).json({ success: false, error: 'Recovery request could not be stored.' });
  }
  return res.json({ success: true, requestId });
});

// POST /api/customer/recovery/approve: Tenant administrator authorizes recovery and issues reset code
app.post(
  '/api/customer/recovery/approve',
  apiRateLimiter,
  requireAuth(['restaurant_admin', 'super_admin']),
  async (req, res) => {
    const { requestId } = req.body || {};
    const requests = serverDbState?.pinRecoveryRequests || [];
    const recReq = requests.find((item: any) => item.id === requestId);
    if (!recReq) return res.status(404).json({ success: false, error: 'Recovery request not found' });
    if (req.user!.role !== 'super_admin' && recReq.restaurantCode !== req.user!.restaurantCode) {
      return res.status(403).json({ success: false, error: 'This recovery request belongs to another restaurant.' });
    }
    if (recReq.status !== 'pending') return res.status(400).json({ success: false, error: 'Request is already reviewed' });

    const previous = { ...recReq };
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = serverHmac(MASTER_KEY, \`RECOVERY:\${recReq.id}:\${code}\`);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    recReq.status = 'approved';
    recReq.recoveryCodeHash = codeHash;
    delete recReq.recoveryCode;
    recReq.authorizingStaffId = req.user!.userId;
    recReq.authorizingStaffName = req.user!.username;
    recReq.approvedAt = new Date().toISOString();
    recReq.expiresAt = expiresAt;

    const saved = await queueDbSave(serverDbState);
    if (!saved) {
      Object.assign(recReq, previous);
      return res.status(500).json({ success: false, error: 'Recovery authorization could not be committed.' });
    }
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

  const pinHash = computeServerCustomerPinHash(cleanPin, cust.id, cust.memberNo);
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
// S3 / Cloudflare R2 / DigitalOcean Spaces / Local Photo Upload
// ----------------------------------------------------

// POST /api/upload/photo: Upload patron photos to cloud object storage (or local uploads/)
app.post('/api/upload/photo', apiRateLimiter, requireAuth(), async (req, res) => {
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
      url: uploadResult.url,
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
    const { payload, restaurantCode, stationId } = req.body;
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

      // Distributed Replay Protection (Redis cluster with atomic SETNX & memory/DB fallback)
      const tokenKey = `${custKey}:${scannedStep}`;
      const replayCheck = await recordTokenScan(tokenKey, 45);
      if (!replayCheck.allowed) {
        return res.json({
          success: true,
          valid: false,
          error: 'Token already used (screenshot replay detected across terminals)',
        });
      }

      // Shared Persistent Replay Protection across all stations & server restarts
      if (!serverDbState.usedTokens) serverDbState.usedTokens = [];
      const alreadyUsed = serverDbState.usedTokens.some((t: any) => t.tokenKey === tokenKey);

      if (alreadyUsed) {
        return res.json({
          success: true,
          valid: false,
          error: 'Token already used (screenshot replay detected across terminals)',
        });
      }

      // Atomically mark token as used
      serverDbState.usedTokens.push({
        tokenKey,
        usedAt: Date.now(),
        stationId: stationId || user.stationId || 'stand_pos',
        memberNo,
      });

      // Bounded purge of used tokens older than 15 minutes
      const cutoff = Date.now() - 15 * 60 * 1000;
      serverDbState.usedTokens = serverDbState.usedTokens.filter((t: any) => t.usedAt > cutoff);

      await queueDbSave(serverDbState);

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

function getServerCustomerBalance(state: any, customerId: string): number {
  if (!state) return 0;
  const checkpoints = (state.balanceCheckpoints || []).filter((cp: any) => cp.customerId === customerId);
  checkpoints.sort((a: any, b: any) => new Date(b.cutoffTimestamp).getTime() - new Date(a.cutoffTimestamp).getTime());
  const latestCheckpoint = checkpoints[0];
  const cutoffTime = latestCheckpoint ? new Date(latestCheckpoint.cutoffTimestamp).getTime() : 0;
  const baseBalance = latestCheckpoint ? Number(latestCheckpoint.balance || 0) : 0;

  const subsequent = (state.ledgerEntries || []).filter((l: any) => {
    if (l.customerId !== customerId) return false;
    const t = l.timestamp ? new Date(l.timestamp).getTime() : 0;
    return t > cutoffTime;
  });

  return baseBalance + subsequent.reduce((sum: number, l: any) => sum + (Number(l.platesDelta) || 0), 0);
}

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
    | 'customer_transaction_history' = 'digital_plate_transfer'
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
  ensureServerDbDefaults(serverDbState);
  const settings = serverDbState?.studentSubscriptionSettings;

  // Physical card QR scanning NEVER requires a dashboard subscription
  if (feature === 'physical_card_scan') {
    const subs = serverDbState?.customerSubscriptions || [];
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

  const subs = serverDbState?.customerSubscriptions || [];
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
// Deliberately fail closed until the MTN Collections adapter is implemented.
// The previous local-instruction flow did not initiate a provider transaction.
app.post('/api/customer/subscription/checkout', apiRateLimiter, requireAuth(['customer']), (_req, res) => {
  return res.status(503).json({
    success: false,
    code: 'MTN_COLLECTIONS_NOT_CONFIGURED',
    error: 'Mobile Money checkout is temporarily unavailable. No payment has been requested or collected.',
  });
});

// POST /api/payments/mobile-money/callback
// Deliberately disabled until callbacks are reconciled against MTN's server-to-server
// transaction-status API. A shared secret or client-supplied status is not payment proof.
app.post('/api/payments/mobile-money/callback', apiRateLimiter, (_req, res) => {
  return res.status(503).json({
    success: false,
    code: 'MTN_CALLBACK_VERIFICATION_NOT_CONFIGURED',
    error: 'Payment callback processing is disabled until server-side MTN transaction verification is implemented.',
  });
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
const SENSITIVE_CLIENT_FIELDS = new Set([
  'pin', 'pinhash', 'pinsalt', 'password', 'passwordhash', 'passwordsalt',
  'idhash', 'onboardingtoken', 'activationtoken', 'activationcode',
  'recoverycode', 'verificationcode', 'temporarycode', 'onetimecode', 'otp',
  'pairingkey', 'pairingsecret', 'secret', 'apisecret', 'apikey',
  'accesskey', 'secretaccesskey', 'accesstoken', 'refreshtoken',
  'magicauthtoken', 'tokenhash', 'qrsecret', 'privatekey', 'codehash', 'recoverycodehash',
]);

/**
 * Never send authentication material, PINs, recovery codes or replay state
 * to browser clients, including tenant administrators and platform admins.
 */
function sanitizeSensitiveState(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeSensitiveState);
  if (!value || typeof value !== 'object') return value;
  const sanitized: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_CLIENT_FIELDS.has(key.toLowerCase())) continue;
    if (key === 'usedTokens' || key === 'revokedTokens') continue;
    sanitized[key] = sanitizeSensitiveState(item);
  }
  return sanitized;
}

function scopeStateForUser(state: any, user: UserSession): any {
  if (!state) return null;
  const checkpointList = state.balanceCheckpoints || state.checkpoints || [];

  // Super Admin receives complete state with the client-facing checkpoint alias.
  if (user.role === 'super_admin') {
    return { ...state, checkpoints: checkpointList };
  }

  // Restaurant Admin: Scoped exclusively to their restaurantCode
  if (user.role === 'restaurant_admin') {
    const rCode = user.restaurantCode;
    const tenantCustomerIds = new Set((state.customers || []).filter((c: any) => c.restaurantCode === rCode).map((c: any) => c.id));
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: (state.customers || []).filter((c: any) => c.restaurantCode === rCode),
      ledgerEntries: (state.ledgerEntries || []).filter((l: any) => l.restaurantCode === rCode),
      checkpoints: checkpointList.filter((cp: any) => tenantCustomerIds.has(cp.customerId)),
      scanEvents: (state.scanEvents || []).filter((s: any) => s.restaurantCode === rCode),
      scanPoints: (state.scanPoints || []).filter((sp: any) => sp.restaurantCode === rCode),
      transfers: (state.transfers || []).filter((tr: any) => tr.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      payments: (state.payments || []).filter((pm: any) => pm.restaurantCode === rCode),
      branches: (state.branches || []).filter((b: any) => b.restaurantCode === rCode),
      stationUsers: (state.stationUsers || []).filter((su: any) => su.restaurantCode === rCode),
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
      subscriptionPayments: (state.subscriptionPayments || []).filter((sp: any) => sp.restaurantCode === rCode),
      activationRequests: (state.activationRequests || []).filter((ar: any) => ar.restaurantCode === rCode),
      pinRecoveryRequests: (state.pinRecoveryRequests || []).filter((pr: any) => pr.restaurantCode === rCode),
      customTranslations: state.customTranslations || {},
    };
  }

  // Stand Staff: Scoped to their restaurant and branch
  if (user.role === 'stand_staff') {
    const rCode = user.restaurantCode;
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: (state.customers || []).filter((c: any) => c.restaurantCode === rCode),
      ledgerEntries: (state.ledgerEntries || []).filter((l: any) => l.restaurantCode === rCode),
      scanEvents: (state.scanEvents || []).filter((s: any) => s.restaurantCode === rCode),
      scanPoints: (state.scanPoints || []).filter((sp: any) => sp.restaurantCode === rCode),
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      branches: (state.branches || []).filter((b: any) => b.restaurantCode === rCode),
      stationUsers: (state.stationUsers || []).filter((su: any) => su.restaurantCode === rCode),
      pendingApprovals: (state.pendingApprovals || []).filter((pa: any) => pa.restaurantCode === rCode),
      shifts: (state.shifts || []).filter((sh: any) => sh.restaurantCode === rCode),
      activationRequests: (state.activationRequests || []).filter((ar: any) => ar.restaurantCode === rCode),
      pinRecoveryRequests: (state.pinRecoveryRequests || []).filter((pr: any) => pr.restaurantCode === rCode),
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
    const dashEnt = checkServerStudentEntitlement(custId, 'customer_dashboard');
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: (state.customers || [])
        .filter((c: any) => c.id === custId || c.memberNo === user.username)
        .map((c: any) => ({
          ...c,
          pinHash: undefined, // Redact sensitive hash
        })),
      ledgerEntries: dashEnt.allowed ? (state.ledgerEntries || []).filter((l: any) => l.customerId === custId) : [],
      checkpoints: dashEnt.allowed ? checkpointList.filter((cp: any) => cp.customerId === custId) : [],
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      notifications: dashEnt.allowed
        ? (state.notifications || []).filter((n: any) => n.target === 'all' || n.target === custId || n.targetCustomerId === custId)
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

  const scopedState = sanitizeSensitiveState(scopeStateForUser(serverDbState, req.user!));
  res.json({
    success: true,
    hasServerState: true,
    state: scopedState,
  });
});

// POST /api/state: Restricted state modification (Finding 2 & 5)
// Only Super Admin and authorized Restaurant Admin can invoke this.
app.post(
  '/api/state',
  apiRateLimiter,
  requireAuth(['super_admin']),
  async (req, res) => {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid payload: state must be an object' });
    }

    const user = req.user!;

    // Schema validation for critical collections
    if (incoming.ledgerEntries && !Array.isArray(incoming.ledgerEntries)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: ledgerEntries must be an array' });
    }
    if (incoming.customers && !Array.isArray(incoming.customers)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: customers must be an array' });
    }

    // Full-state replacement is a break-glass platform operation. Tenant administrators
    // must use the validated incremental sync route and cannot replace financial records.
    if (user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Full-state replacement is restricted to platform super administrators.' });
    }
    serverDbState = incoming;
    ensureServerDbDefaults(serverDbState);

    const savedOk = await queueDbSave(serverDbState);
    if (!savedOk) {
      return res.status(500).json({
        success: false,
        error: 'Database persistence failure: Unable to commit changes safely to disk.',
      });
    }

    return res.json({
      success: true,
      savedAt: new Date().toISOString(),
    });
  }
);

// POST /api/customer/transfer: Server-authoritative PIN-verified plate transfer.
app.post('/api/customer/transfer', apiRateLimiter, requireAuth(['customer']), async (req, res) => {
  if (!serverDbState) return res.status(503).json({ success: false, error: 'Server state is not initialized.' });
  ensureServerDbDefaults(serverDbState);
  const user = req.user!;
  const customer = (serverDbState.customers || []).find((item: any) => item.id === user.userId);
  if (!customer || customer.restaurantCode !== user.restaurantCode) {
    return res.status(401).json({ success: false, error: 'Customer session is no longer valid.' });
  }
  if (customer.activationStatus === 'suspended' || customer.provisionalStatus === 'pending_approval' || customer.provisionalStatus === 'rejected') {
    return res.status(403).json({ success: false, error: 'Customer account is not eligible for transfers.' });
  }
  if (customer.lockedUntil && new Date(customer.lockedUntil).getTime() > Date.now()) {
    return res.status(423).json({ success: false, error: 'Account temporarily locked. Please try again later.' });
  }

  const recipientIdentifier = typeof req.body?.recipientIdentifier === 'string' ? req.body.recipientIdentifier.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  const plates = Number(req.body?.plates);
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (!recipientIdentifier || !/^\d{6,}$/.test(pin) || !Number.isSafeInteger(plates) || plates <= 0 ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'Valid recipient, 6+ digit PIN, positive whole plate amount, and idempotency key are required.' });
  }

  const transferId = `tr_${crypto.createHash('sha256').update(`${customer.id}:${idempotencyKey}`).digest('hex').slice(0, 40)}`;
  const existingTransfer = (serverDbState.transfers || []).find((item: any) => item.id === transferId);
  if (existingTransfer) {
    return res.json({ success: true, idempotent: true, transfer: existingTransfer, senderBalance: getServerCustomerBalance(serverDbState, customer.id) });
  }

  const previousPinHash = customer.pinHash;
  const previousAttempts = customer.failedLoginAttempts;
  const previousLockedUntil = customer.lockedUntil;
  if (!verifyServerCustomerPin(pin, customer)) {
    customer.failedLoginAttempts = (customer.failedLoginAttempts || 0) + 1;
    if (customer.failedLoginAttempts >= 5) customer.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await queueDbSave(serverDbState);
    return res.status(401).json({ success: false, error: 'Incorrect security PIN.' });
  }

  customer.failedLoginAttempts = 0;
  customer.lockedUntil = null;
  const entitlement = checkServerStudentEntitlement(customer.id, 'digital_plate_transfer');
  if (!entitlement.allowed) {
    await queueDbSave(serverDbState);
    return res.status(402).json({ success: false, requiresSubscription: true, error: entitlement.reason || 'An active customer subscription is required.' });
  }

  const normalizedIdentifier = recipientIdentifier.replace(/[\s-]/g, '');
  const recipient = (serverDbState.customers || []).find((item: any) =>
    item.restaurantCode === customer.restaurantCode &&
    (item.memberNo === recipientIdentifier ||
      (typeof item.phone === 'string' && item.phone.replace(/[\s-]/g, '') === normalizedIdentifier))
  );
  if (!recipient || recipient.id === customer.id ||
      recipient.activationStatus === 'suspended' ||
      recipient.provisionalStatus === 'pending_approval' ||
      recipient.provisionalStatus === 'rejected') {
    await queueDbSave(serverDbState);
    return res.status(400).json({ success: false, error: 'Recipient not found or not eligible in this restaurant.' });
  }

  const availableBalance = getServerCustomerBalance(serverDbState, customer.id);
  if (availableBalance < plates) {
    await queueDbSave(serverDbState);
    return res.status(400).json({ success: false, error: `Insufficient plates. Available balance: ${availableBalance}.` });
  }

  const now = new Date().toISOString();
  const transfer = {
    id: transferId, idempotencyKey, restaurantCode: customer.restaurantCode,
    senderCustomerId: customer.id, recipientCustomerId: recipient.id,
    senderMemberNo: customer.memberNo, recipientMemberNo: recipient.memberNo,
    senderName: customer.name, recipientName: recipient.name,
    plates, timestamp: now, status: 'completed',
  };
  const ledgerOut = {
    id: `led_${transferId}_out`, idempotencyKey: `transfer:${transferId}:out`,
    customerId: customer.id, restaurantCode: customer.restaurantCode,
    type: 'transfer_out', platesDelta: -plates, timestamp: now,
    reason: `Transfer to #${recipient.memberNo}`, reference: transferId,
  };
  const ledgerIn = {
    id: `led_${transferId}_in`, idempotencyKey: `transfer:${transferId}:in`,
    customerId: recipient.id, restaurantCode: recipient.restaurantCode,
    type: 'transfer_in', platesDelta: plates, timestamp: now,
    reason: `Transfer from #${customer.memberNo}`, reference: transferId,
  };

  const auditLog = {
    id: `audit_${transferId}`,
    restaurantCode: customer.restaurantCode,
    actorRole: 'customer',
    actorName: customer.name,
    userId: customer.id,
    action: 'PLATES_TRANSFERRED',
    details: `Transferred ${plates} plates to #${recipient.memberNo}`,
    timestamp: now,
  };
  const notifications = [
    {
      id: `notif_${transferId}_sender`,
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      senderRole: 'system',
      senderName: 'RestoPass Transfer',
      type: 'plate_transfer',
      title: `Sent ${plates} plates`,
      message: `You transferred ${plates} plates to #${recipient.memberNo}.`,
      priority: 'normal',
      timestamp: now,
      readByCustomerIds: [],
    },
    {
      id: `notif_${transferId}_recipient`,
      restaurantCode: recipient.restaurantCode,
      target: recipient.id,
      senderRole: 'system',
      senderName: 'RestoPass Transfer',
      type: 'plate_transfer',
      title: `Received ${plates} plates`,
      message: `You received ${plates} plates from #${customer.memberNo}.`,
      priority: 'normal',
      timestamp: now,
      readByCustomerIds: [],
    },
  ];

  if (isPostgresConfigured()) {
    const committed = await commitPlateTransferPostgres({
      transfer, ledgerOut, ledgerIn, auditLog, notifications,
    });
    if (!committed.ok) {
      const status = committed.code === 'INSUFFICIENT_BALANCE' ? 400
        : committed.code === 'CUSTOMER_NOT_FOUND' ? 404
        : committed.code === 'NOT_READY' ? 503
        : committed.code === 'IDEMPOTENCY_CONFLICT' ? 409 : 500;
      return res.status(status).json({
        success: false,
        code: committed.code,
        error: committed.message,
      });
    }

    if (!committed.idempotent) {
      serverDbState.ledgerEntries = [...(serverDbState.ledgerEntries || []), ledgerOut, ledgerIn];
      serverDbState.transfers = [transfer, ...(serverDbState.transfers || [])];
      serverDbState.auditLogs = [auditLog, ...(serverDbState.auditLogs || [])];
      serverDbState.notifications = [...notifications, ...(serverDbState.notifications || [])];
    }
    return res.json({
      success: true,
      idempotent: committed.idempotent,
      transfer: committed.transfer,
      senderBalance: committed.senderBalance,
      recipientBalance: committed.recipientBalance,
    });
  }

  // Standalone mode is a single local process; Node's synchronous validation above
  // completes before the first await, then this atomic snapshot persists the operation.
  const oldLedger = serverDbState.ledgerEntries;
  const oldTransfers = serverDbState.transfers;
  const oldAuditLogs = serverDbState.auditLogs;
  const oldNotifications = serverDbState.notifications;
  serverDbState.ledgerEntries = [...(oldLedger || []), ledgerOut, ledgerIn];
  serverDbState.transfers = [transfer, ...(oldTransfers || [])];
  serverDbState.auditLogs = [auditLog, ...(oldAuditLogs || [])];
  serverDbState.notifications = [...notifications, ...(oldNotifications || [])];
  const saved = await queueDbSave(serverDbState);
  if (!saved) {
    serverDbState.ledgerEntries = oldLedger;
    serverDbState.transfers = oldTransfers;
    serverDbState.auditLogs = oldAuditLogs;
    serverDbState.notifications = oldNotifications;
    customer.failedLoginAttempts = previousAttempts;
    customer.lockedUntil = previousLockedUntil;
    customer.pinHash = previousPinHash;
    return res.status(500).json({ success: false, error: 'Transfer could not be committed. No transfer was confirmed.' });
  }

  return res.json({
    success: true, transfer,
    senderBalance: getServerCustomerBalance(serverDbState, customer.id),
    recipientBalance: getServerCustomerBalance(serverDbState, recipient.id),
  });
});

// POST /api/sync: Authenticated, validated incremental synchronization with Idempotency (Findings 5 & 6)
app.post('/api/sync', syncRateLimiter, requireAuth(), async (req, res) => {
  const { fullState } = req.body;
  const user = req.user!;

  if (fullState && typeof fullState === 'object') {
    if (!serverDbState) {
      serverDbState = fullState;
    } else {
      const allowedRestoCode = user.role === 'super_admin' ? null : user.restaurantCode;

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
            // Customers can only toggle their own card lock status or update PIN metadata, never privilege/version fields
            // Customer sync may only lock/unlock their own card. PIN changes must
            // go through the server-side activation/recovery flows.
            existingCustomersMap.set(inc.id, {
              ...prev,
              cardStatus: inc.cardStatus === 'locked' || inc.cardStatus === 'active' ? inc.cardStatus : prev.cardStatus,
            });
          } else {
            existingCustomersMap.set(inc.id, {
              ...prev,
              ...inc,
              // Credential, identity-proof and anti-replay fields are server-managed.
              pinHash: prev.pinHash,
              hasCustomPin: prev.hasCustomPin,
              pinSetAt: prev.pinSetAt,
              idHash: prev.idHash,
              idNumberMasked: prev.idNumberMasked,
              onboardingToken: prev.onboardingToken,
              keyVersion: prev.keyVersion,
              cardVersion: prev.cardVersion,
              failedLoginAttempts: prev.failedLoginAttempts,
              lockedUntil: prev.lockedUntil,
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

      // Customers cannot submit financial ledger entries through generic state sync.
      // This prevents bypassing PIN verification, entitlement checks, recipient validation,
      // and server-side transaction controls by forging transfer_out/transfer_in rows.
      if (user.role === 'customer' && Array.isArray(fullState.ledgerEntries) && fullState.ledgerEntries.length > 0) {
        return res.status(403).json({
          success: false,
          code: 'CUSTOMER_LEDGER_WRITE_FORBIDDEN',
          error: 'Customer ledger changes must use an authorized server-side transaction endpoint.',
        });
      }

      // 2. Merge ledger entries with Idempotency, Role Authorization, and Schema Validation (append-only)
      const existingLedgerIds = new Set((serverDbState.ledgerEntries || []).map((l: any) => l.id));
      const existingIdempotencyKeys = new Set(
        (serverDbState.ledgerEntries || [])
          .filter((l: any) => l.idempotencyKey)
          .map((l: any) => l.idempotencyKey)
      );

      const incomingLedgers = (fullState.ledgerEntries || []).filter((l: any) => {
        if (!l || typeof l.id !== 'string' || !l.id || typeof l.customerId !== 'string' || !l.customerId) return false;
        if (!allowedRestoCode && user.role !== 'super_admin') return false;
        if (allowedRestoCode && l.restaurantCode !== allowedRestoCode) return false;
        const ledgerCustomer = (serverDbState.customers || []).find(
          (customer: any) => customer.id === l.customerId && customer.restaurantCode === l.restaurantCode
        );
        if (!ledgerCustomer) return false;

        const allowedTypes = new Set(['purchase', 'scan', 'extra', 'undo', 'transfer_out', 'transfer_in', 'adjustment', 'reversal']);
        if (!allowedTypes.has(l.type)) return false;
        if (l.amountRwf !== undefined && (!Number.isSafeInteger(l.amountRwf) || l.amountRwf < 0)) return false;
        if (!Number.isSafeInteger(l.platesDelta) || l.platesDelta === 0) return false;

        // Cashier/station staff may submit only negative meal-consumption events.
        // Positive credits, adjustments, reversals and transfers require server/admin authority.
        if (user.role === 'stand_staff' &&
            (!['scan', 'extra'].includes(l.type) || l.platesDelta >= 0)) return false;
        if (user.role === 'customer') return false;

        // Idempotency check also catches duplicates within the same submitted batch.
        if (existingLedgerIds.has(l.id)) return false;
        if (l.idempotencyKey && existingIdempotencyKeys.has(l.idempotencyKey)) return false;
        existingLedgerIds.add(l.id);
        if (l.idempotencyKey) existingIdempotencyKeys.add(l.idempotencyKey);
        return true;
      });

      // Strict financial integrity validation for customer peer-to-peer transfers
      if (user.role === 'customer') {
        const custTransfersOut = incomingLedgers.filter((l: any) => l.type === 'transfer_out');
        const custTransfersIn = incomingLedgers.filter((l: any) => l.type === 'transfer_in');
        const totalOut = custTransfersOut.reduce((acc: number, l: any) => acc + l.platesDelta, 0); // negative
        const totalIn = custTransfersIn.reduce((acc: number, l: any) => acc + l.platesDelta, 0);   // positive

        if (custTransfersIn.length > 0 || custTransfersOut.length > 0) {
          if (totalOut + totalIn !== 0) {
            return res.status(400).json({
              success: false,
              error: 'Invalid transfer payload: transfer_out and transfer_in must balance to zero.',
            });
          }
          const curBal = getServerCustomerBalance(serverDbState, user.userId);
          if (Math.abs(totalOut) > curBal) {
            return res.status(400).json({
              success: false,
              error: `Insufficient plates balance for transfer: Available ${curBal}, requested ${Math.abs(totalOut)}.`,
            });
          }
          const transferEnt = checkServerStudentEntitlement(user.userId, 'digital_plate_transfer');
          if (!transferEnt.allowed) {
            return res.status(402).json({
              success: false,
              requiresSubscription: true,
              error: transferEnt.reason || 'Digital plate transfers require an active student subscription (500 RWF/mo).',
            });
          }
        }
      }

      serverDbState.ledgerEntries = [...(serverDbState.ledgerEntries || []), ...incomingLedgers];

      // 3. Merge scan events idempotently (Only stand_staff, restaurant_admin, super_admin)
      if (user.role !== 'customer') {
        const existingScanIds = new Set((serverDbState.scanEvents || []).map((s: any) => s.id));
        const incomingScans = (fullState.scanEvents || []).filter((s: any) => {
          if (!s || !s.id) return false;
          if (allowedRestoCode && s.restaurantCode !== allowedRestoCode) return false;
          return !existingScanIds.has(s.id);
        });
        serverDbState.scanEvents = [...incomingScans, ...(serverDbState.scanEvents || [])];
      }

      // 4. Merge operational collections with role guards.
      // Customer-originated notifications, transfer records, audit events and subscription
      // states are server-authoritative and must not be accepted from client fullState.
      if (user.role !== 'customer') {
        mergeScopedCollection('notifications', true);
        if (user.role === 'restaurant_admin' || user.role === 'super_admin') {
          mergeScopedCollection('transfers', false);
        }
        mergeScopedCollection('auditLogs', false);
        mergeScopedCollection('pendingApprovals', user.role !== 'stand_staff');
        mergeScopedCollection('payments', false);
        mergeScopedCollection('shifts', true);
        mergeScopedCollection('activationRequests', true);
        mergeScopedCollection('pinRecoveryRequests', user.role !== 'stand_staff');
      }

      if (user.role === 'restaurant_admin' || user.role === 'super_admin') {
        mergeScopedCollection('packages', true);
        mergeScopedCollection('menuItems', true);
        mergeScopedCollection('branches', true);
        mergeScopedCollection('stationUsers', true);
        mergeScopedCollection('scanPoints', true);
        mergeScopedCollection('cashierSessions', true);
        mergeScopedCollection('expenses', true);

        // Allow restaurant admin to update their own restaurant branding/policies
        if (Array.isArray(fullState.restaurants)) {
          const rMap = new Map((serverDbState.restaurants || []).map((r: any) => [r.code, r]));
          for (const incR of fullState.restaurants) {
            if (!incR || !incR.code) continue;
            if (allowedRestoCode && incR.code !== allowedRestoCode) continue;
            const prevR: any = rMap.get(incR.code);
            rMap.set(incR.code, prevR ? {
              ...prevR,
              ...incR,
              // Contract/licensing authority remains platform-controlled.
              status: prevR.status,
              planId: prevR.planId,
              currentLicenseId: prevR.currentLicenseId,
              termsOverride: prevR.termsOverride,
              highestTimeSeen: Math.max(Number(prevR.highestTimeSeen || 0), Number(incR.highestTimeSeen || 0)),
            } : incR);
          }
          serverDbState.restaurants = Array.from(rMap.values());
        }
      }

      if (user.role === 'super_admin') {
        mergeScopedCollection('customerSubscriptions', true);
        mergeScopedCollection('studentSubscriptionPayments', true);
        mergeScopedCollection('subscriptionPayments', true);
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
  const deploymentMode = (process.env.RESTOPASS_DEPLOYMENT_MODE || 'standalone').toLowerCase();
  let viteLoaded = false;

  if (!['cloud', 'standalone'].includes(deploymentMode)) {
    throw new Error('RESTOPASS_DEPLOYMENT_MODE must be either cloud or standalone.');
  }
  if (isProduction && deploymentMode === 'cloud' && !isPostgresConfigured()) {
    throw new Error('Cloud production mode requires DATABASE_URL. Refusing to start with local JSON persistence.');
  }
  if (isProduction && deploymentMode === 'cloud' && !process.env.REDIS_URL) {
    throw new Error('Cloud production mode requires REDIS_URL for distributed replay protection.');
  }

  // Cloud Relational Database Initialization
  if (isPostgresConfigured()) {
    console.log('[Server Authority] PostgreSQL detected. Connecting and initializing schema...');
    try {
      const initialized = await initPostgres(serverDbState);
      if (!initialized) {
        throw new Error('PostgreSQL is configured but initialization failed. Refusing to start with a non-authoritative local JSON database.');
      }
      const pgState = await loadStateFromPostgres();
      if (!pgState || !isValidAppState(pgState)) {
        throw new Error('PostgreSQL is configured but authoritative state could not be loaded. Refusing split-brain fallback.');
      }
      serverDbState = pgState;
      ensureServerDbDefaults(serverDbState);
      console.log('[Server Authority] Authoritative state loaded from PostgreSQL.');
    } catch (pgBootErr) {
      console.error('[Server Authority] PostgreSQL startup initialization failed:', pgBootErr);
      if (isProduction) throw pgBootErr;
      console.warn('[Server Authority] Development-only fallback to local db.json is active.');
    }
  } else {
    console.log('[Server Authority] Running in standalone local storage mode (Offline Reception Laptop compatible).');
  }

  if (isProduction && deploymentMode === 'cloud') {
    const redisReady = await checkRedisReady();
    if (!redisReady) {
      throw new Error('Redis is configured but not ready. Refusing to start cloud production without distributed replay protection.');
    }
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
  getServerCustomerBalance,
  ensureServerDbDefaults,
  getServerDbState,
  setServerDbState,
  validateProductionSecrets,
  sanitizeSensitiveState,
};
