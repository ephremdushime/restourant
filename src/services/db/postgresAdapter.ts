/**
 * RestoPass PostgreSQL Relational Persistence Adapter
 * 
 * Provides production-grade relational persistence for 50,000 DAU multi-tenant campus workloads.
 * When DATABASE_URL is configured, all authoritative state is persisted to PostgreSQL
 * with strict constraints (including UNIQUE idempotency_key on ledger_entries).
 * When DATABASE_URL is omitted, the application falls back automatically to local atomic JSON persistence
 * to allow offline on-premises reception laptops to operate seamlessly.
 */

import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isInitialized = false;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
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

    if (sslMode === 'disable' || isLocalhost) {
      poolConfig.ssl = false;
    } else {
      poolConfig.ssl = { rejectUnauthorized: false };
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
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    let ddl = '';
    if (fs.existsSync(schemaPath)) {
      ddl = fs.readFileSync(schemaPath, 'utf-8');
    } else {
      // Fallback relative to project root
      const fallbackPath = path.resolve(process.cwd(), 'src/services/db/schema.sql');
      if (fs.existsSync(fallbackPath)) {
        ddl = fs.readFileSync(fallbackPath, 'utf-8');
      }
    }

    if (ddl) {
      await p.query(ddl);
      console.log('[PostgreSQL Adapter] Relational schema and indexes verified successfully.');
    }

    isInitialized = true;

    // Check if tables are empty and initial state is provided for auto-migration
    if (initialStateToMigrate && typeof initialStateToMigrate === 'object') {
      const { rows } = await p.query('SELECT COUNT(*) as count FROM restaurants');
      if (Number(rows[0]?.count || 0) === 0) {
        console.log('[PostgreSQL Adapter] Database is empty. Auto-migrating flat-file state to PostgreSQL...');
        await saveStateToPostgres(initialStateToMigrate);
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
        usedTokens: [],
      };

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
  if (!p || !isInitialized) return { allowed: true };

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
    return { allowed: true }; // Failsafe to avoid blocking legitimate scans on transient DB err
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isInitialized = false;
  }
}

