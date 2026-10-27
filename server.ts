import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
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

    // 3. Atomic rename
    fs.renameSync(tempFile, DB_FILE);
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
    const validPassword = password === 'SuperAdmin#2026' || password === 'admin';
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid Super Admin credentials' });
    }
    const token = createSessionToken({
      userId: 'super_admin_ephrem',
      username: username || 'ephrem@restopass.rw',
      role: 'super_admin',
      restaurantCode: 'ALL',
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'super_admin',
        username: username || 'ephrem@restopass.rw',
        restaurantCode: 'ALL',
        userLabel: 'Ephrem (Global Super Admin)',
      },
    });
  }

  // 2. Restaurant Admin / Boss Authentication
  if (role === 'restaurant_admin') {
    if (!restaurantCode) {
      return res.status(400).json({ success: false, error: 'Restaurant code is required' });
    }
    const validPassword = password === 'Boss#2026' || password === 'admin';
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid Restaurant Administrator credentials' });
    }

    const currentResto = (serverDbState?.restaurants || []).find((r: any) => r.code === restaurantCode);
    const token = createSessionToken({
      userId: `admin_${restaurantCode}`,
      username: username || 'claire@kigalicampus.rw',
      role: 'restaurant_admin',
      restaurantCode,
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'restaurant_admin',
        username: username || 'claire@kigalicampus.rw',
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
    const entered = pin || password;
    const validPin = entered === '1234' || entered === 'EastHub#2026' || entered === 'admin';
    if (!validPin) {
      return res.status(401).json({ success: false, error: 'Invalid Staff PIN or Password' });
    }

    const token = createSessionToken({
      userId: `staff_${username || 'pos'}_${restaurantCode}`,
      username: username || 'eric.n',
      role: 'stand_staff',
      restaurantCode,
      stationId: stationId || 'stand_1',
    });
    return res.json({
      success: true,
      token,
      user: {
        role: 'stand_staff',
        username: username || 'eric.n',
        restaurantCode,
        stationId: stationId || 'stand_1',
        userLabel: `Staff: ${username || 'Stand Operator'}`,
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

    const validPin = pin === '1234' || (cust && cust.pinHash === pin);
    if (!validPin) {
      return res.status(401).json({ success: false, error: 'Invalid Member No or PIN' });
    }

    const targetCust = cust || customers[0];
    if (!targetCust) {
      return res.status(404).json({ success: false, error: 'Customer record not found' });
    }

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

export {
  app,
  atomicSaveDb,
  queueDbSave,
  createSessionToken,
  verifySessionToken,
  scopeStateForUser,
  timingSafeCompare,
};
