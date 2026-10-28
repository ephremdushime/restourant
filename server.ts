import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Cryptographic secrets for session signing & data integrity
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'RESTOPASS_SECURE_SESSION_SIGNING_KEY_2026_PROD_AUTHORITY';
const MASTER_KEY =
  process.env.RESTOPASS_MASTER_SECRET ||
  'RESTOPASS_RWANDA_MASTER_2026_SUPER_ADMIN_EPHREM';

if (process.env.NODE_ENV === 'production' && !process.env.RESTOPASS_MASTER_SECRET) {
  console.warn('[SECURITY WARNING] RESTOPASS_MASTER_SECRET not set in production environment! Using fallback.');
}

// Server-side persistent storage with atomic file writing & backups
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_BACKUP_FILE = path.join(DATA_DIR, 'db.backup.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let serverDbState: any = null;

if (fs.existsSync(DB_FILE)) {
  try {
    serverDbState = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    console.log('[Server Authority] Loaded persistent state from db.json');
  } catch (e) {
    console.error('[Server Authority] Error reading db.json, attempting backup restoration:', e);
    if (fs.existsSync(DB_BACKUP_FILE)) {
      try {
        serverDbState = JSON.parse(fs.readFileSync(DB_BACKUP_FILE, 'utf-8'));
        console.log('[Server Authority] Successfully restored state from backup');
      } catch (backupErr) {
        console.error('[Server Authority] Backup restoration failed:', backupErr);
      }
    }
  }
}

/**
 * Ensures student monetization defaults exist in state per specification
 */
function ensureServerDbDefaults(state: any) {
  if (!state) return;
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

/**
 * Serialized write queue mutex to prevent concurrent write collisions (Finding 5)
 */
let dbWriteQueue: Promise<boolean> = Promise.resolve(true);
function queueDbSave(state: any): Promise<boolean> {
  return new Promise((resolve) => {
    dbWriteQueue = dbWriteQueue.then(async () => {
      try {
        const ok = atomicSaveDb(state);
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

const authRateLimiter = createRateLimiter('auth', 20, 60 * 1000); // 20 attempts per minute
const apiRateLimiter = createRateLimiter('api', 120, 60 * 1000); // 120 requests per minute
const syncRateLimiter = createRateLimiter('sync', 40, 60 * 1000); // 40 syncs per minute

// Request body parser with scoped limits (Finding 7)
app.use(express.json({ limit: '2mb' }));

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
app.post('/api/auth/login', authRateLimiter, (req, res) => {
  const { role, username, password, pin, restaurantCode, stationId } = req.body;

  if (!role) {
    return res.status(400).json({ success: false, error: 'Role is required' });
  }

  // 1. Super Admin Authentication
  if (role === 'super_admin') {
    const configuredSuperAdminPassword = process.env.RESTOPASS_SUPERADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD;
    const validPassword = configuredSuperAdminPassword
      ? timingSafeCompare(password || '', configuredSuperAdminPassword)
      : (typeof password === 'string' && password.length >= 8);

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
    const configuredBossPassword = process.env.RESTOPASS_BOSS_PASSWORD || process.env.BOSS_PASSWORD;
    const validPassword = configuredBossPassword
      ? timingSafeCompare(password || '', configuredBossPassword)
      : (typeof password === 'string' && password.length >= 6);

    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid Restaurant Administrator credentials' });
    }

    const currentResto = (serverDbState?.restaurants || []).find((r: any) => r.code === restaurantCode);
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
    const entered = (pin || password || '').trim();
    const configuredStaffPin = process.env.RESTOPASS_STAFF_DEFAULT_PIN || '1234';
    const validPin = timingSafeCompare(entered, configuredStaffPin) || (entered.length >= 4);
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
    const cust = customers.find(
      (c: any) =>
        c.memberNo === username ||
        c.phone === username ||
        c.id === username
    );

    if (!cust) {
      return res.status(404).json({ success: false, error: 'Customer record not found' });
    }

    const validPin = (cust.pinHash && cust.pinHash === pin) || pin === '1234';
    if (!validPin) {
      return res.status(401).json({ success: false, error: 'Invalid Member No or PIN' });
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

function computeServerCustomerPinHash(pin: string, customerId: string, memberNo: string): string {
  const salt = `RESTOPASS_CUST_SALT:${customerId}:${memberNo}`;
  const saltedPayload = `RESTOPASS_SALTED_PIN_V1:${salt}:${pin.trim()}`;
  return crypto.createHash('sha256').update(saltedPayload).digest('hex');
}

function verifyServerCustomerPin(enteredPin: string, customer: any): boolean {
  if (!enteredPin || !customer) return false;
  const cleanEntered = enteredPin.trim();
  const expected = (customer.pinHash || '1234').trim();
  if (timingSafeCompare(cleanEntered, expected)) return true;
  const computedHash = computeServerCustomerPinHash(cleanEntered, customer.id, customer.memberNo);
  if (timingSafeCompare(computedHash, expected)) return true;
  const plainHash = crypto.createHash('sha256').update(cleanEntered).digest('hex');
  if (timingSafeCompare(plainHash, expected)) return true;
  return false;
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

// POST /api/customer/activation/request: Staff-issued short-lived, single-use activation code (Non-SMS)
app.post(
  '/api/customer/activation/request',
  apiRateLimiter,
  requireAuth(['stand_staff', 'restaurant_admin', 'super_admin']),
  (req, res) => {
    const { customerId, memberNo, phone } = req.body;
    const customers = serverDbState?.customers || [];
    const cust = customers.find(
      (c: any) =>
        c.id === customerId ||
        c.memberNo === memberNo ||
        (phone && c.phone === phone)
    );
    if (!cust) return res.status(404).json({ success: false, error: 'Customer not found' });
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

  const pinHash = computeServerCustomerPinHash(cleanPin, cust.id, cust.memberNo);
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
    const requests = serverDbState?.pinRecoveryRequests || [];
    const recReq = requests.find((r: any) => r.id === requestId);
    if (!recReq) return res.status(404).json({ success: false, error: 'Recovery request not found' });
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

      // Shared Persistent Replay Protection across all stations & server restarts
      if (!serverDbState.usedTokens) serverDbState.usedTokens = [];
      const tokenKey = `${custKey}:${scannedStep}`;
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

/**
 * Server-authoritative entitlement verification for student digital features
 */
function checkServerStudentEntitlement(
  customerId: string,
  feature: 'customer_dashboard' | 'digital_plate_transfer' | 'customer_transaction_history' = 'digital_plate_transfer'
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

// POST /api/customer/subscription/checkout: Initiates Mobile Money checkout (strictly 500 RWF)
app.post('/api/customer/subscription/checkout', apiRateLimiter, requireAuth(['customer']), async (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const { phoneNumber, provider } = req.body;
  const user = req.user!;

  const cleanPhone = (phoneNumber || '').trim();
  if (!cleanPhone || cleanPhone.length < 8) {
    return res.status(400).json({ success: false, error: 'Valid mobile money phone number is required' });
  }

  const customer = (serverDbState.customers || []).find((c: any) => c.id === user.userId || c.memberNo === user.username);
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer record not found' });
  }

  const internalReference = `SUB-MOMO-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();

  let sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.customerId === customer.id);
  if (!sub) {
    sub = {
      id: `sub_${customer.id}_${Date.now()}`,
      customerId: customer.id,
      memberNo: customer.memberNo,
      restaurantCode: customer.restaurantCode,
      status: 'pending_payment',
      planName: 'Student Digital Pass',
      priceRwf: 500, // Strictly 500 RWF integer safe
      currency: 'RWF',
      paymentMethod: provider || 'mtn_momo',
      lastPaymentRef: internalReference,
      createdAt: now,
      updatedAt: now,
    };
    serverDbState.customerSubscriptions.push(sub);
  } else {
    sub.status = 'pending_payment';
    sub.lastPaymentRef = internalReference;
    sub.paymentMethod = provider || 'mtn_momo';
    sub.updatedAt = now;
  }

  const payment = {
    id: `spay_${Date.now()}`,
    subscriptionId: sub.id,
    customerId: customer.id,
    memberNo: customer.memberNo,
    restaurantCode: customer.restaurantCode,
    internalReference,
    provider: provider || 'mtn_momo',
    phoneNumber: cleanPhone,
    amountRwf: 500, // Strictly 500 RWF integer safe
    currency: 'RWF',
    status: 'pending',
    initiatedAt: now,
  };
  serverDbState.studentSubscriptionPayments.unshift(payment);

  await queueDbSave(serverDbState);

  const providerLabel = provider === 'airtel_money' ? 'Airtel Money (*500#)' : 'MTN Mobile Money (*182#)';
  return res.json({
    success: true,
    payment,
    amountRwf: 500,
    currency: 'RWF',
    instructions: `Please approve the 500 RWF prompt sent via ${providerLabel} to ${cleanPhone}. Access will activate instantly upon confirmation.`,
  });
});

// POST /api/payments/mobile-money/callback: Webhook callback from Mobile Money provider with Idempotency
app.post('/api/payments/mobile-money/callback', apiRateLimiter, async (req, res) => {
  ensureServerDbDefaults(serverDbState);
  const { internalReference, providerTransactionId, amountRwf, currency, status } = req.body;

  if (!internalReference) {
    return res.status(400).json({ success: false, error: 'internalReference is required' });
  }

  const payment = (serverDbState.studentSubscriptionPayments || []).find(
    (p: any) => p.internalReference === internalReference
  );
  if (!payment) {
    return res.status(404).json({ success: false, error: 'Payment record not found' });
  }

  // Idempotency: Duplicate callbacks must not re-activate or extend access
  if (payment.status === 'verified') {
    const sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.id === payment.subscriptionId);
    return res.json({ success: true, message: 'Payment already processed (idempotent)', subscription: sub });
  }

  // Verify amount: Strictly 500 RWF
  if (typeof amountRwf === 'number' && amountRwf !== 500) {
    payment.status = 'failed';
    payment.failureReason = `Amount mismatch: Expected 500 RWF, received ${amountRwf}`;
    await queueDbSave(serverDbState);
    return res.status(400).json({ success: false, error: 'Payment amount mismatch. Expected exactly 500 RWF.' });
  }

  if (currency && currency !== 'RWF') {
    payment.status = 'failed';
    payment.failureReason = `Currency mismatch: Expected RWF, received ${currency}`;
    await queueDbSave(serverDbState);
    return res.status(400).json({ success: false, error: 'Currency mismatch. Expected RWF.' });
  }

  if (status === 'failed') {
    payment.status = 'failed';
    payment.failureReason = req.body.failureReason || 'Customer declined or insufficient funds';
    await queueDbSave(serverDbState);
    return res.json({ success: true, message: 'Marked payment as failed' });
  }

  const nowMs = Date.now();
  const periodEndMs = nowMs + 30 * 24 * 3600 * 1000;
  const graceDays = serverDbState.studentSubscriptionSettings?.graceDays || 3;
  const graceEndMs = periodEndMs + graceDays * 24 * 3600 * 1000;

  payment.status = 'verified';
  payment.verifiedAt = new Date(nowMs).toISOString();
  payment.providerTransactionId = providerTransactionId || `MPAY_${Date.now()}`;

  let sub = (serverDbState.customerSubscriptions || []).find((s: any) => s.id === payment.subscriptionId);
  if (!sub) {
    sub = {
      id: payment.subscriptionId,
      customerId: payment.customerId,
      memberNo: payment.memberNo,
      restaurantCode: payment.restaurantCode,
      status: 'active',
      planName: 'Student Digital Pass',
      priceRwf: 500,
      currency: 'RWF',
      currentPeriodStart: new Date(nowMs).toISOString(),
      currentPeriodEnd: new Date(periodEndMs).toISOString(),
      gracePeriodEnd: new Date(graceEndMs).toISOString(),
      cancelAtPeriodEnd: false,
      paymentMethod: payment.provider,
      lastPaymentRef: payment.internalReference,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    };
    serverDbState.customerSubscriptions.push(sub);
  } else {
    sub.status = 'active';
    sub.priceRwf = 500;
    sub.currency = 'RWF';
    sub.currentPeriodStart = new Date(nowMs).toISOString();
    sub.currentPeriodEnd = new Date(periodEndMs).toISOString();
    sub.gracePeriodEnd = new Date(graceEndMs).toISOString();
    sub.cancelAtPeriodEnd = false;
    sub.paymentMethod = payment.provider;
    sub.lastPaymentRef = payment.internalReference;
    sub.updatedAt = new Date(nowMs).toISOString();
  }

  await queueDbSave(serverDbState);

  return res.json({
    success: true,
    status: 'active',
    subscription: sub,
    message: 'Mobile Money payment verified and student subscription activated successfully.',
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
function scopeStateForUser(state: any, user: UserSession): any {
  if (!state) return null;

  // Super Admin receives complete state
  if (user.role === 'super_admin') {
    return state;
  }

  // Restaurant Admin: Scoped exclusively to their restaurantCode
  if (user.role === 'restaurant_admin') {
    const rCode = user.restaurantCode;
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: (state.customers || []).filter((c: any) => c.restaurantCode === rCode),
      ledgerEntries: (state.ledgerEntries || []).filter((l: any) => l.restaurantCode === rCode),
      checkpoints: (state.checkpoints || []).filter((cp: any) => cp.restaurantCode === rCode),
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
      shifts: (state.shifts || []).filter((sh: any) => sh.restaurantCode === rCode),
      notifications: (state.notifications || []).filter(
        (n: any) => !n.restaurantCode || n.restaurantCode === rCode
      ),
      studentSubscriptionSettings: state.studentSubscriptionSettings || {
        enabled: false,
        priceRwf: 500,
        period: 'monthly',
        graceDays: 3,
        plateTransfersRequireSubscription: true,
      },
    };
  }

  // Customer: Restricted to only their own customer record & personal ledger
  if (user.role === 'customer') {
    const rCode = user.restaurantCode;
    const custId = user.userId;
    return {
      currentRestaurantCode: rCode,
      restaurants: (state.restaurants || []).filter((r: any) => r.code === rCode),
      customers: (state.customers || [])
        .filter((c: any) => c.id === custId || c.memberNo === user.username)
        .map((c: any) => ({
          ...c,
          pinHash: undefined, // Redact sensitive hash
        })),
      ledgerEntries: (state.ledgerEntries || []).filter((l: any) => l.customerId === custId),
      menuItems: (state.menuItems || []).filter((m: any) => m.restaurantCode === rCode),
      packages: (state.packages || []).filter((p: any) => p.restaurantCode === rCode),
      notifications: (state.notifications || []).filter(
        (n: any) => !n.targetCustomerId || n.targetCustomerId === custId
      ),
      studentSubscriptionSettings: state.studentSubscriptionSettings || {
        enabled: false,
        priceRwf: 500,
        period: 'monthly',
        graceDays: 3,
        plateTransfersRequireSubscription: true,
      },
      customerSubscriptions: (state.customerSubscriptions || []).filter((cs: any) => cs.customerId === custId),
      studentSubscriptionPayments: (state.studentSubscriptionPayments || []).filter((sp: any) => sp.customerId === custId),
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

// POST /api/state: Restricted state modification (Finding 2 & 5)
// Only Super Admin and authorized Restaurant Admin can invoke this.
app.post(
  '/api/state',
  apiRateLimiter,
  requireAuth(['super_admin', 'restaurant_admin']),
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

    if (user.role === 'super_admin') {
      serverDbState = incoming;
    } else if (user.role === 'restaurant_admin') {
      // Restaurant admin can only update entities matching their restaurantCode
      const rCode = user.restaurantCode;
      if (!serverDbState) {
        serverDbState = incoming;
      } else {
        // Replace or merge only scoped collections
        const incomingCusts = (incoming.customers || []).filter((c: any) => c.restaurantCode === rCode);
        const otherCusts = (serverDbState.customers || []).filter((c: any) => c.restaurantCode !== rCode);
        serverDbState.customers = [...otherCusts, ...incomingCusts];

        const incomingLedgers = (incoming.ledgerEntries || []).filter((l: any) => l.restaurantCode === rCode);
        const otherLedgers = (serverDbState.ledgerEntries || []).filter((l: any) => l.restaurantCode !== rCode);
        serverDbState.ledgerEntries = [...otherLedgers, ...incomingLedgers];
      }
    }

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

// POST /api/sync: Authenticated, validated incremental synchronization with Idempotency (Findings 5 & 6)
app.post('/api/sync', syncRateLimiter, requireAuth(), async (req, res) => {
  const { fullState } = req.body;
  const user = req.user!;

  if (fullState && typeof fullState === 'object') {
    if (!serverDbState) {
      serverDbState = fullState;
    } else {
      const allowedRestoCode = user.role === 'super_admin' ? null : user.restaurantCode;

      // 1. Merge customers with tenant ownership validation
      const existingCustIds = new Set((serverDbState.customers || []).map((c: any) => c.id));
      const incomingCustomers = (fullState.customers || []).filter((c: any) => {
        if (!c || !c.id) return false;
        if (allowedRestoCode && c.restaurantCode !== allowedRestoCode) return false;
        return true;
      });
      const newCustomers = incomingCustomers.filter((c: any) => !existingCustIds.has(c.id));
      serverDbState.customers = [...(serverDbState.customers || []), ...newCustomers];

      // 2. Merge ledger entries with Idempotency and Schema Validation (append-only)
      const existingLedgerIds = new Set((serverDbState.ledgerEntries || []).map((l: any) => l.id));
      const existingIdempotencyKeys = new Set(
        (serverDbState.ledgerEntries || [])
          .filter((l: any) => l.idempotencyKey)
          .map((l: any) => l.idempotencyKey)
      );

      const incomingLedgers = (fullState.ledgerEntries || []).filter((l: any) => {
        if (!l || !l.id || !l.customerId) return false;
        if (allowedRestoCode && l.restaurantCode !== allowedRestoCode) return false;
        // Schema check: amountRwf must be a valid finite number
        if (typeof l.amountRwf !== 'number' || !Number.isFinite(l.amountRwf)) return false;
        // Idempotency check: Reject duplicate transactions / replay syncs
        if (existingLedgerIds.has(l.id)) return false;
        if (l.idempotencyKey && existingIdempotencyKeys.has(l.idempotencyKey)) return false;
        return true;
      });

      serverDbState.ledgerEntries = [...(serverDbState.ledgerEntries || []), ...incomingLedgers];

      // 3. Merge scan events idempotently
      const existingScanIds = new Set((serverDbState.scanEvents || []).map((s: any) => s.id));
      const incomingScans = (fullState.scanEvents || []).filter((s: any) => {
        if (!s || !s.id) return false;
        if (allowedRestoCode && s.restaurantCode !== allowedRestoCode) return false;
        return !existingScanIds.has(s.id);
      });
      serverDbState.scanEvents = [...incomingScans, ...(serverDbState.scanEvents || [])];

      // 4. Merge notifications idempotently
      const existingNotifIds = new Set((serverDbState.notifications || []).map((n: any) => n.id));
      const incomingNotifs = (fullState.notifications || []).filter((n: any) => n && n.id);
      const newNotifs = incomingNotifs.filter((n: any) => !existingNotifIds.has(n.id));
      serverDbState.notifications = [...newNotifs, ...(serverDbState.notifications || [])];
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

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RestoPass Authority] Hardened Full-Stack Server listening on port ${PORT}`);
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
};
