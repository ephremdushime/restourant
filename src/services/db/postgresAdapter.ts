/**
 * RestoPass PostgreSQL Relational Persistence Adapter
 * 
 * Provides production-grade relational persistence for single-instance pilot multi-tenant campus workloads.
 * When DATABASE_URL is configured, all authoritative state is persisted to PostgreSQL
 * with strict constraints (including UNIQUE idempotency_key on ledger_entries).
 * When DATABASE_URL is omitted, the application falls back automatically to local atomic JSON persistence
 * to allow offline on-premises reception laptops to operate seamlessly.
 */

import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

let pool: Pool | null = null;
let isInitialized = false;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export async function checkPostgresReady(): Promise<boolean> {
  const p = getPostgresPool();
  if (!p || !isInitialized) return false;
  try {
    await p.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[PostgreSQL Adapter] Readiness check failed:', err);
    return false;
  }
}

export function getPostgresPool(): Pool | null {
  if (!isPostgresConfigured()) return null;
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const isLocalhost = connectionString?.includes('localhost') || connectionString?.includes('127.0.0.1');
    const sslMode = process.env.PGSSLMODE;

    const poolConfig: PoolConfig = {
      connectionString,
      max: Number(process.env.PGMAX_CONNECTIONS || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    // Never disable certificate verification implicitly for remote databases.
    // Local development may explicitly opt out; production should use provider CA trust.
    if (sslMode === 'disable') {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_DB_TLS !== 'true') {
        throw new Error('PGSSLMODE=disable is forbidden in production.');
      }
      poolConfig.ssl = false;
    } else if (sslMode === 'verify-full' || sslMode === 'verify-ca' || (!isLocalhost && process.env.NODE_ENV === 'production')) {
      poolConfig.ssl = { rejectUnauthorized: true };
    } else if (sslMode === 'require') {
      // "require" encrypts the connection but does not validate the server identity.
      // Prefer verify-full with the database provider's CA certificate in production.
      poolConfig.ssl = { rejectUnauthorized: false };
    } else {
      poolConfig.ssl = false;
    }

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('[PostgreSQL Adapter] Unexpected error on idle client:', err);
    });
  }
  return pool;
}

/**
 * Initializes the database schema using schema.sql and optionally migrates initial data
 */
export async function initPostgres(initialStateToMigrate?: any): Promise<boolean> {
  const p = getPostgresPool();
  if (!p) {
    console.log('[PostgreSQL Adapter] DATABASE_URL not set. Running in local filesystem mode (Offline Reception Laptop compatible).');
    return false;
  }

  try {
    const candidateModulePath = path.resolve(moduleDirectory, 'schema.sql');
    const schemaPath = fs.existsSync(candidateModulePath)
      ? candidateModulePath
      : path.resolve(process.cwd(), 'src/services/db/schema.sql');
    let ddl = '';
    if (fs.existsSync(schemaPath)) {
      ddl = fs.readFileSync(schemaPath, 'utf-8');
    }

    if (!ddl.trim()) {
      throw new Error('PostgreSQL schema.sql was not found; refusing to start with an uninitialized database.');
    }
    await p.query(ddl);
    console.log('[PostgreSQL Adapter] Relational schema and indexes verified successfully.');

    isInitialized = true;

    // Check if tables are empty and initial state is provided for auto-migration
    if (initialStateToMigrate && typeof initialStateToMigrate === 'object') {
      const { rows } = await p.query('SELECT COUNT(*) as count FROM restaurants');
      if (Number(rows[0]?.count || 0) === 0) {
        console.log('[PostgreSQL Adapter] Database is empty. Auto-migrating flat-file state to PostgreSQL...');
        const migrated = await saveStateToPostgres(initialStateToMigrate);
        if (!migrated) throw new Error('Initial state migration failed; refusing to continue with an empty PostgreSQL authority.');
        console.log('[PostgreSQL Adapter] Auto-migration to PostgreSQL complete.');
      }
    }

    return true;
  } catch (err) {
    console.error('[PostgreSQL Adapter] Initialization failed:', err);
    return false;
  }
}

/**
 * Loads and reconstructs the full authoritative state from PostgreSQL tables
 */
export async function loadStateFromPostgres(): Promise<any | null> {
  const p = getPostgresPool();
  if (!p || !isInitialized) return null;

  try {
    const client = await p.connect();
    try {
      const [
        restoRes,
        licenseRes,
        customerRes,
        ledgerRes,
        subRes,
        customerSubPaymentRes,
        checkpointRes,
        paymentRes,
        scanRes,
        approvalRes,
        branchRes,
        userRes,
        notifRes,
        expenseRes,
        transferRes,
        auditRes,
        settingsRes,
      ] = await Promise.all([
        client.query('SELECT data FROM restaurants ORDER BY code ASC'),
        client.query('SELECT data FROM licenses ORDER BY id ASC'),
        client.query('SELECT data FROM customers ORDER BY created_at ASC'),
        client.query('SELECT data FROM ledger_entries ORDER BY timestamp ASC'),
        client.query('SELECT data FROM customer_subscriptions ORDER BY created_at ASC'),
        client.query('SELECT data FROM customer_subscription_payments ORDER BY created_at ASC'),
        client.query('SELECT data FROM balance_checkpoints ORDER BY created_at ASC'),
        client.query('SELECT data FROM payments ORDER BY created_at ASC'),
        client.query('SELECT data FROM scan_events ORDER BY created_at DESC LIMIT 5000'),
        client.query('SELECT data FROM pending_approvals ORDER BY created_at DESC'),
        client.query('SELECT data FROM branches ORDER BY code ASC'),
        client.query('SELECT data FROM station_users ORDER BY username ASC'),
        client.query('SELECT data FROM notifications ORDER BY created_at DESC LIMIT 2000'),
        client.query('SELECT data FROM expenses ORDER BY created_at DESC'),
        client.query('SELECT data FROM transfers ORDER BY created_at DESC'),
        client.query('SELECT data FROM audit_logs ORDER BY created_at DESC LIMIT 5000'),
        client.query('SELECT key, value FROM system_settings'),
      ]);

      const settingsMap = new Map<string, any>(
        settingsRes.rows.map((r: { key: string; value: any }) => [r.key, r.value])
      );

      const state: any = {
        restaurants: restoRes.rows.map((r: { data: any }) => r.data),
        licenses: licenseRes.rows.map((r: { data: any }) => r.data),
        customers: customerRes.rows.map((r: { data: any }) => r.data),
        ledgerEntries: ledgerRes.rows.map((r: { data: any }) => r.data),
        customerSubscriptions: subRes.rows.map((r: { data: any }) => r.data),
        balanceCheckpoints: checkpointRes.rows.map((r: { data: any }) => r.data),
        payments: paymentRes.rows.map((r: { data: any }) => r.data),
        scanEvents: scanRes.rows.map((r: { data: any }) => r.data),
        pendingApprovals: approvalRes.rows.map((r: { data: any }) => r.data),
        branches: branchRes.rows.map((r: { data: any }) => r.data),
        stationUsers: userRes.rows.map((r: { data: any }) => r.data),
        notifications: notifRes.rows.map((r: { data: any }) => r.data),
        expenses: expenseRes.rows.map((r: { data: any }) => r.data),
        transfers: transferRes.rows.map((r: { data: any }) => r.data),
        auditLogs: auditRes.rows.map((r: { data: any }) => r.data),
        studentSubscriptionSettings: settingsMap.get('studentSubscriptionSettings') || {
          enabled: false,
          priceRwf: 500,
          currency: 'RWF',
          period: 'monthly',
          graceDays: 3,
          requireForTransfers: true,
          requireForDashboard: true,
          updatedAt: new Date().toISOString(),
        },
        customTranslations: settingsMap.get('customTranslations') || {},
        plans: settingsMap.get('plans') || [],
        scanPoints: settingsMap.get('scanPoints') || [],
        packages: settingsMap.get('packages') || [],
        menuItems: settingsMap.get('menuItems') || [],
        cashierSessions: settingsMap.get('cashierSessions') || [],
        shifts: settingsMap.get('shifts') || [],
        activationRequests: settingsMap.get('activationRequests') || [],
        pinRecoveryRequests: settingsMap.get('pinRecoveryRequests') || [],
        studentSubscriptionPayments: customerSubPaymentRes.rows.map((r: { data: any }) => r.data),
        restaurantSubscriptions: settingsMap.get('restaurantSubscriptions') || [],
        restaurantSubscriptionPayments: settingsMap.get('restaurantSubscriptionPayments') || [],
        subscriptionPayments: settingsMap.get('subscriptionPayments') || [],
        activationCodes: settingsMap.get('activationCodes') || [],
        deletionTombstones: settingsMap.get('deletionTombstones') || [],
        usedTokens: [],
      };

      // Tombstones hide deleted operational records without erasing financial
      // history. Reapply them on every database hydration so old rows cannot
      // silently resurrect after a restart or restore.
      const tombstoneCollections: Record<string, string> = {
        customers: 'customers',
        stationUsers: 'stationUsers',
        branches: 'branches',
        packages: 'packages',
        menuItems: 'menuItems',
        scanPoints: 'scanPoints',
        cashierSessions: 'cashierSessions',
      };
      const deletedKeys = new Set(
        (state.deletionTombstones as any[])
          .filter((item) => item && tombstoneCollections[item.collection] && item.recordId && item.restaurantCode)
          .map((item) => `${item.collection}:${item.restaurantCode}:${item.recordId}`)
      );
      for (const [collection, stateKey] of Object.entries(tombstoneCollections)) {
        if (Array.isArray(state[stateKey])) {
          state[stateKey] = state[stateKey].filter(
            (item: any) => !deletedKeys.has(`${collection}:${item.restaurantCode}:${item.id}`)
          );
        }
      }

      console.log(`[PostgreSQL Adapter] Hydrated state: ${state.restaurants.length} restaurants, ${state.customers.length} patrons, ${state.ledgerEntries.length} ledger entries.`);
      return state;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[PostgreSQL Adapter] Error loading state from PostgreSQL:', err);
    return null;
  }
}

/**
 * Persists application state to PostgreSQL within a single atomic transaction
 */
export async function saveStateToPostgres(state: any): Promise<boolean> {
  const p = getPostgresPool();
  if (!p || !isInitialized) return false;

  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // 1. Restaurants
    if (Array.isArray(state.restaurants)) {
      for (const r of state.restaurants) {
        if (!r?.code) continue;
        await client.query(
          `INSERT INTO restaurants (code, name, status, data, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name, status = EXCLUDED.status, data = EXCLUDED.data, updated_at = NOW()`,
          [r.code, r.name || 'Unnamed Restaurant', r.status || 'active', JSON.stringify(r)]
        );
      }
    }

    // 2. Customers
    if (Array.isArray(state.customers)) {
      for (const c of state.customers) {
        if (!c?.id || !c?.restaurantCode) continue;
        await client.query(
          `INSERT INTO customers (id, restaurant_code, member_no, name, phone, card_status, card_version, key_version, is_student, pin_hash, photo_url, data, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (id) DO UPDATE
           SET restaurant_code = EXCLUDED.restaurant_code,
               member_no = EXCLUDED.member_no,
               name = EXCLUDED.name,
               phone = EXCLUDED.phone,
               card_status = EXCLUDED.card_status,
               card_version = EXCLUDED.card_version,
               key_version = EXCLUDED.key_version,
               is_student = EXCLUDED.is_student,
               pin_hash = EXCLUDED.pin_hash,
               photo_url = EXCLUDED.photo_url,
               data = EXCLUDED.data,
               updated_at = NOW()`,
          [
            c.id,
            c.restaurantCode,
            c.memberNo || '',
            c.name || 'Unknown Patron',
            c.phone || null,
            c.cardStatus || 'active',
            c.cardVersion || 1,
            c.keyVersion || 1,
            Boolean(c.isStudent),
            c.pinHash || null,
            c.photoUrl || null,
            JSON.stringify(c),
          ]
        );
      }
    }

    // 3. Ledger Entries (CRITICAL: Append-only with native UNIQUE idempotency_key constraint)
    if (Array.isArray(state.ledgerEntries)) {
      for (const l of state.ledgerEntries) {
        if (!l?.id || !l?.customerId || !l?.restaurantCode) continue;
        const idempotencyKey = l.idempotencyKey || l.id;
        const timestamp = l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString();
        await client.query(
          `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, amount_rwf, idempotency_key, timestamp, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            l.id,
            l.restaurantCode,
            l.customerId,
            l.type || 'scan',
            l.platesDelta || 0,
            l.amountRwf ?? null,
            idempotencyKey,
            timestamp,
            JSON.stringify(l),
          ]
        );
      }
    }

    // 3a. Commercial licenses
    if (Array.isArray(state.licenses)) {
      for (const item of state.licenses) {
        if (!item?.id || !item?.restaurantCode) continue;
        await client.query(
          `INSERT INTO licenses (id, restaurant_code, plan_id, valid_until, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET restaurant_code = EXCLUDED.restaurant_code, plan_id = EXCLUDED.plan_id, valid_until = EXCLUDED.valid_until, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.planId || item.plan || 'default', item.validUntil || item.expiresAt || new Date(0).toISOString(), JSON.stringify(item)]
        );
      }
    }

    // 3b. Existing payment records (meal top-ups and other restaurant-side payments)
    if (Array.isArray(state.payments)) {
      for (const item of state.payments) {
        if (!item?.id || !item?.restaurantCode || !Number.isSafeInteger(Number(item.amountRwf ?? item.amount ?? 0))) continue;
        await client.query(
          `INSERT INTO payments (id, restaurant_code, customer_id, amount_rwf, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id, amount_rwf = EXCLUDED.amount_rwf, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.customerId || null, Number(item.amountRwf ?? item.amount ?? 0), JSON.stringify(item)]
        );
      }
    }

    // 3c. Scan events
    if (Array.isArray(state.scanEvents)) {
      for (const item of state.scanEvents) {
        if (!item?.id || !item?.restaurantCode || !item?.customerId) continue;
        await client.query(
          `INSERT INTO scan_events (id, restaurant_code, customer_id, station_id, status, data)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET station_id = EXCLUDED.station_id, status = EXCLUDED.status, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.customerId, item.stationId || null, item.status || 'recorded', JSON.stringify(item)]
        );
      }
    }

    // 3d. Branches and station users
    if (Array.isArray(state.branches)) {
      for (const item of state.branches) {
        if (!item?.id || !item?.restaurantCode) continue;
        await client.query(
          `INSERT INTO branches (id, restaurant_code, code, name, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET restaurant_code = EXCLUDED.restaurant_code, code = EXCLUDED.code, name = EXCLUDED.name, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.code || item.id, item.name || 'Branch', JSON.stringify(item)]
        );
      }
    }
    if (Array.isArray(state.stationUsers)) {
      for (const item of state.stationUsers) {
        if (!item?.id || !item?.restaurantCode || !item?.username) continue;
        await client.query(
          `INSERT INTO station_users (id, restaurant_code, username, role, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET restaurant_code = EXCLUDED.restaurant_code, username = EXCLUDED.username, role = EXCLUDED.role, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.username, item.role || 'stand_staff', JSON.stringify(item)]
        );
      }
    }

    // 3e. Notifications, expenses, transfers and audit records
    if (Array.isArray(state.notifications)) {
      for (const item of state.notifications) {
        if (!item?.id || !item?.restaurantCode) continue;
        await client.query(
          `INSERT INTO notifications (id, restaurant_code, recipient_id, data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET recipient_id = EXCLUDED.recipient_id, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.target === 'all' ? null : (item.target || item.recipientId || item.customerId || null), JSON.stringify(item)]
        );
      }
    }
    if (Array.isArray(state.expenses)) {
      for (const item of state.expenses) {
        if (!item?.id || !item?.restaurantCode) continue;
        await client.query(
          `INSERT INTO expenses (id, restaurant_code, amount_rwf, data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET amount_rwf = EXCLUDED.amount_rwf, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, Number(item.amountRwf ?? item.amount ?? 0), JSON.stringify(item)]
        );
      }
    }
    if (Array.isArray(state.transfers)) {
      for (const item of state.transfers) {
        if (!item?.id || !item?.restaurantCode || !item?.senderCustomerId || !item?.recipientCustomerId) continue;
        await client.query(
          `INSERT INTO transfers (id, restaurant_code, sender_customer_id, recipient_customer_id, plates, data, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET plates = EXCLUDED.plates, data = EXCLUDED.data`,
          [item.id, item.restaurantCode, item.senderCustomerId, item.recipientCustomerId, Number(item.plates || 0), JSON.stringify(item), item.idempotencyKey || item.id]
        );
      }
    }
    if (Array.isArray(state.auditLogs)) {
      for (const item of state.auditLogs) {
        if (!item?.id || !item?.action) continue;
        await client.query(
          `INSERT INTO audit_logs (id, restaurant_code, user_id, action, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [item.id, item.restaurantCode || 'GLOBAL', item.userId || item.actorId || item.actorName || null, item.action, JSON.stringify(item)]
        );
      }
    }

    // 4. Pending Approvals (Boss Approvals Manager)
    if (Array.isArray(state.pendingApprovals)) {
      for (const a of state.pendingApprovals) {
        if (!a?.id || !a?.restaurantCode) continue;
        await client.query(
          `INSERT INTO pending_approvals (id, restaurant_code, customer_id, type, status, data, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO UPDATE
           SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = NOW()`,
          [a.id, a.restaurantCode, a.customerId || '', a.type || 'new_customer', a.status || 'pending', JSON.stringify(a)]
        );
      }
    }

    // 5. Customer Subscriptions
    if (Array.isArray(state.customerSubscriptions)) {
      for (const s of state.customerSubscriptions) {
        if (!s?.id || !s?.customerId) continue;
        await client.query(
          `INSERT INTO customer_subscriptions (id, customer_id, restaurant_code, plan, status, data, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO UPDATE
           SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = NOW()`,
          [s.id, s.customerId, s.restaurantCode || '', s.plan || 'monthly', s.status || 'inactive', JSON.stringify(s)]
        );
      }
    }

    // 5a. Dedicated RestoPass customer-dashboard subscription payment ledger.
    // The payment history is no longer authoritative in generic system_settings.
    if (Array.isArray(state.studentSubscriptionPayments)) {
      for (const item of state.studentSubscriptionPayments) {
        if (!item?.id || !item?.customerId || !item?.restaurantCode) continue;
        const amountRwf = Number(item.amountRwf);
        const monthsPurchased = Number(item.monthsPurchased || 1);
        if (!Number.isSafeInteger(amountRwf) || amountRwf <= 0 ||
            !Number.isSafeInteger(monthsPurchased) || monthsPurchased < 1 || monthsPurchased > 24) {
          throw new Error('Invalid customer subscription payment amount or purchased month count.');
        }
        const provider = ['mtn_momo', 'airtel_money', 'cash', 'bank_transfer'].includes(item.provider)
          ? item.provider : 'cash';
        const internalReference = String(item.internalReference || ('LEGACY-' + item.id)).slice(0, 64);
        const idempotencyKey = String(item.idempotencyKey || item.id).slice(0, 128);
        const requestFingerprint = String(item.requestFingerprint ||
          crypto.createHash('sha256').update(JSON.stringify({
            id: item.id, customerId: item.customerId, restaurantCode: item.restaurantCode,
            amountRwf, monthsPurchased, internalReference,
          })).digest('hex')).slice(0, 64);
        const status = ['created','provider_pending','pending','verified','successful','failed','cancelled','expired','review_required'].includes(item.status)
          ? item.status : 'pending';
        await client.query(
          `INSERT INTO customer_subscription_payments
           (id,customer_id,restaurant_code,provider,provider_environment,internal_reference,provider_transaction_id,
            payer_msisdn,amount_rwf,months_purchased,currency,status,idempotency_key,request_fingerprint,data,verified_at,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RWF',$11,$12,$13,$14,$15,NOW())
           ON CONFLICT (id) DO UPDATE SET
             provider_transaction_id=EXCLUDED.provider_transaction_id,
             payer_msisdn=EXCLUDED.payer_msisdn,
             status=EXCLUDED.status,data=EXCLUDED.data,verified_at=EXCLUDED.verified_at,updated_at=NOW()`,
          [
            item.id, item.customerId, item.restaurantCode, provider,
            item.providerEnvironment || null, internalReference,
            item.providerTransactionId || null,
            item.payerMsisdn || item.phoneNumber || item.phone || null,
            amountRwf, monthsPurchased, status, idempotencyKey, requestFingerprint,
            JSON.stringify(item), item.verifiedAt || null,
          ]
        );
      }
    }

    // 6. Balance Checkpoints
    if (Array.isArray(state.balanceCheckpoints)) {
      for (const cp of state.balanceCheckpoints) {
        if (!cp?.id || !cp?.customerId) continue;
        await client.query(
          `INSERT INTO balance_checkpoints (id, customer_id, balance, cutoff_timestamp, data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE
           SET balance = EXCLUDED.balance, cutoff_timestamp = EXCLUDED.cutoff_timestamp, data = EXCLUDED.data`,
          [cp.id, cp.customerId, cp.balance || 0, cp.cutoffTimestamp || new Date().toISOString(), JSON.stringify(cp)]
        );
      }
    }

    // 7. System Settings & Collections
    const settingsToSave: Array<[string, any]> = [
      ['studentSubscriptionSettings', state.studentSubscriptionSettings],
      ['customTranslations', state.customTranslations],
      ['plans', state.plans],
      ['scanPoints', state.scanPoints],
      ['packages', state.packages],
      ['menuItems', state.menuItems],
      ['cashierSessions', state.cashierSessions],
      ['shifts', state.shifts],
      ['activationRequests', state.activationRequests],
      ['pinRecoveryRequests', state.pinRecoveryRequests],
      ['restaurantSubscriptions', state.restaurantSubscriptions],
      ['restaurantSubscriptionPayments', state.restaurantSubscriptionPayments],
      ['subscriptionPayments', state.subscriptionPayments],
      ['activationCodes', state.activationCodes],
      // Durable soft-deletion markers prevent deleted operational records from
      // being reintroduced by stale offline clients or database hydration.
      ['deletionTombstones', state.deletionTombstones || []],
    ];

    for (const [key, val] of settingsToSave) {
      if (val !== undefined) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(val)]
        );
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PostgreSQL Adapter] Error saving state to PostgreSQL transaction:', err);
    return false;
  } finally {
    client.release();
  }
}

export type PlateTransferCommitErrorCode =
  | 'NOT_READY'
  | 'CUSTOMER_NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PERSISTENCE_ERROR';

export interface PlateTransferCommitResult {
  ok: boolean;
  idempotent?: boolean;
  transfer?: any;
  senderBalance?: number;
  recipientBalance?: number;
  code?: PlateTransferCommitErrorCode;
  message?: string;
}

/**
 * Atomically commits a plate transfer under PostgreSQL row locks.
 * This is the authoritative path for cloud mode; balance validation and both
 * ledger entries, transfer, notifications and audit record share one transaction.
 */
export async function commitPlateTransferPostgres(input: {
  transfer: any;
  ledgerOut: any;
  ledgerIn: any;
  auditLog: any;
  notifications: any[];
}): Promise<PlateTransferCommitResult> {
  const p = getPostgresPool();
  if (!p || !isInitialized) return { ok: false, code: 'NOT_READY', message: 'PostgreSQL is not ready.' };

  const { transfer, ledgerOut, ledgerIn, auditLog, notifications } = input;
  const client = await p.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;

    // Lock both customer rows in deterministic order to serialize concurrent transfers
    // and avoid deadlocks when two customers transfer to one another simultaneously.
    const locked = await client.query(
      'SELECT id FROM customers WHERE id = ANY($1::varchar[]) AND restaurant_code = $2 ORDER BY id FOR UPDATE',
      [[transfer.senderCustomerId, transfer.recipientCustomerId], transfer.restaurantCode]
    );
    if (locked.rowCount !== 2) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return { ok: false, code: 'CUSTOMER_NOT_FOUND', message: 'Sender or recipient no longer exists in this restaurant.' };
    }

    const prior = await client.query(
      'SELECT data FROM transfers WHERE idempotency_key = $1 OR id = $2 LIMIT 1',
      [transfer.idempotencyKey, transfer.id]
    );
    if (prior.rows.length) {
      const existing = prior.rows[0].data;
      // An idempotency key may only replay the exact same transfer. Reusing it
      // with altered parties, tenant, or amount is a conflict, never success.
      const sameRequest =
        existing?.id === transfer.id &&
        existing?.idempotencyKey === transfer.idempotencyKey &&
        existing?.restaurantCode === transfer.restaurantCode &&
        existing?.senderCustomerId === transfer.senderCustomerId &&
        existing?.recipientCustomerId === transfer.recipientCustomerId &&
        Number(existing?.plates) === Number(transfer.plates);
      if (!sameRequest) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return { ok: false, code: 'IDEMPOTENCY_CONFLICT', message: 'This idempotency key was already used for a different transfer.' };
      }
      const balances = await client.query(
        'SELECT customer_id, COALESCE(SUM(plates_delta), 0)::int AS balance FROM ledger_entries WHERE restaurant_code = $1 AND customer_id = ANY($2::varchar[]) GROUP BY customer_id',
        [transfer.restaurantCode, [transfer.senderCustomerId, transfer.recipientCustomerId]]
      );
      const byCustomer = new Map(balances.rows.map((row: any) => [row.customer_id, Number(row.balance)]));
      await client.query('COMMIT');
      transactionOpen = false;
      return {
        ok: true,
        idempotent: true,
        transfer: existing,
        senderBalance: byCustomer.get(transfer.senderCustomerId) || 0,
        recipientBalance: byCustomer.get(transfer.recipientCustomerId) || 0,
      };
    }

    const balanceResult = await client.query(
      'SELECT COALESCE(SUM(plates_delta), 0)::int AS balance FROM ledger_entries WHERE restaurant_code = $1 AND customer_id = $2',
      [transfer.restaurantCode, transfer.senderCustomerId]
    );
    const senderBalance = Number(balanceResult.rows[0]?.balance || 0);
    if (senderBalance < transfer.plates) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient plates. Available balance: ${senderBalance}.`,
      };
    }

    await client.query(
      `INSERT INTO transfers (id, restaurant_code, sender_customer_id, recipient_customer_id, plates, data, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [transfer.id, transfer.restaurantCode, transfer.senderCustomerId, transfer.recipientCustomerId, transfer.plates, JSON.stringify(transfer), transfer.idempotencyKey]
    );

    for (const entry of [ledgerOut, ledgerIn]) {
      await client.query(
        `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, amount_rwf, idempotency_key, timestamp, data)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)`,
        [entry.id, entry.restaurantCode, entry.customerId, entry.type, entry.platesDelta, entry.idempotencyKey, new Date(entry.timestamp).toISOString(), JSON.stringify(entry)]
      );
    }

    await client.query(
      'INSERT INTO audit_logs (id, restaurant_code, user_id, action, data) VALUES ($1, $2, $3, $4, $5)',
      [auditLog.id, auditLog.restaurantCode, auditLog.userId || transfer.senderCustomerId, auditLog.action, JSON.stringify(auditLog)]
    );

    for (const notification of notifications) {
      await client.query(
        'INSERT INTO notifications (id, restaurant_code, recipient_id, data) VALUES ($1, $2, $3, $4)',
        [notification.id, notification.restaurantCode, notification.target === 'all' ? null : notification.target || null, JSON.stringify(notification)]
      );
    }

    const finalBalances = await client.query(
      'SELECT customer_id, COALESCE(SUM(plates_delta), 0)::int AS balance FROM ledger_entries WHERE restaurant_code = $1 AND customer_id = ANY($2::varchar[]) GROUP BY customer_id',
      [transfer.restaurantCode, [transfer.senderCustomerId, transfer.recipientCustomerId]]
    );
    const byCustomer = new Map(finalBalances.rows.map((row: any) => [row.customer_id, Number(row.balance)]));
    await client.query('COMMIT');
    transactionOpen = false;
    return {
      ok: true,
      idempotent: false,
      transfer,
      senderBalance: byCustomer.get(transfer.senderCustomerId) || 0,
      recipientBalance: byCustomer.get(transfer.recipientCustomerId) || 0,
    };
  } catch (err: any) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    if (err?.code === '23505') {
      return { ok: false, code: 'IDEMPOTENCY_CONFLICT', message: 'This transfer request has already been processed. Refresh your balance before retrying.' };
    }
    console.error('[PostgreSQL Adapter] Atomic plate transfer failed:', err);
    return { ok: false, code: 'PERSISTENCE_ERROR', message: 'Transfer could not be committed. No transfer was confirmed.' };
  } finally {
    client.release();
  }
}

/**
 * Direct atomic single ledger entry insertion with database-level idempotency
 */
export async function insertLedgerEntryPostgres(entry: any): Promise<{ inserted: boolean; error?: string }> {
  const p = getPostgresPool();
  if (!p || !isInitialized) return { inserted: true }; // File fallback handled by caller

  try {
    const idempotencyKey = entry.idempotencyKey || entry.id;
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();

    const res = await p.query(
      `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, amount_rwf, idempotency_key, timestamp, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        entry.id,
        entry.restaurantCode,
        entry.customerId,
        entry.type || 'scan',
        entry.platesDelta || 0,
        entry.amountRwf ?? null,
        idempotencyKey,
        timestamp,
        JSON.stringify(entry),
      ]
    );

    return { inserted: (res.rowCount || 0) > 0 };
  } catch (err: any) {
    console.error('[PostgreSQL Adapter] Insert ledger entry error:', err);
    return { inserted: false, error: err.message };
  }
}

/**
 * Persists and checks used tokens in PostgreSQL if Redis is not deployed
 */
export async function recordUsedTokenPostgres(
  tokenKey: string,
  stationId: string,
  memberNo: string,
  ttlSeconds = 60
): Promise<{ allowed: boolean }> {
  const p = getPostgresPool();
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 600) {
    return { allowed: false };
  }
  if (!p) {
    return { allowed: process.env.NODE_ENV !== 'production' };
  }
  if (!isInitialized) {
    return { allowed: false };
  }

  try {
    const res = await p.query(
      `INSERT INTO used_tokens (token_key, used_at, station_id, member_no, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::INTERVAL)
       ON CONFLICT (token_key) DO NOTHING
       RETURNING token_key`,
      [tokenKey, Date.now(), stationId || 'stand_pos', memberNo || '', ttlSeconds]
    );

    const allowed = (res.rowCount || 0) > 0;
    return { allowed };
  } catch (err) {
    console.error('[PostgreSQL Adapter] Used token insert error:', err);
    return { allowed: false };
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isInitialized = false;
  }
}

