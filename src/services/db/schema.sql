-- RestoPass Production Database DDL Schema (PostgreSQL 14+)
-- Multi-Tenant Campus & Cafeteria Meal Pass Authority

-- 1. Restaurants & Tenant Configurations
CREATE TABLE IF NOT EXISTS restaurants (
    code VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Commercial Licenses & Cryptographic Quotas
CREATE TABLE IF NOT EXISTS licenses (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE CASCADE,
    plan_id VARCHAR(64) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Patrons / Customers & Cryptographic Credential Metadata
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE CASCADE,
    member_no VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    card_status VARCHAR(32) NOT NULL DEFAULT 'active',
    card_version INT NOT NULL DEFAULT 1,
    key_version INT NOT NULL DEFAULT 1,
    is_student BOOLEAN NOT NULL DEFAULT FALSE,
    pin_hash VARCHAR(255),
    photo_url TEXT,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_resto_member UNIQUE (restaurant_code, member_no)
);


-- Database-enforced identity uniqueness within each restaurant.
-- The application performs friendly pre-checks; these indexes close the concurrent
-- registration race and make PostgreSQL the final authority.
DO $identity_preflight$
DECLARE duplicate_groups BIGINT;
BEGIN
  IF to_regclass('uq_customers_restaurant_phone_normalized') IS NULL THEN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
      SELECT restaurant_code,
        CASE
          WHEN LEFT(digits, 3) = '250' AND LENGTH(digits) = 12 THEN SUBSTRING(digits FROM 4)
          WHEN LEFT(digits, 1) = '0' AND LENGTH(digits) = 10 THEN SUBSTRING(digits FROM 2)
          ELSE digits
        END AS normalized_phone
      FROM (
        SELECT restaurant_code, REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') AS digits
        FROM customers
        WHERE phone IS NOT NULL
      ) phones
      WHERE LENGTH(digits) >= 7
      GROUP BY restaurant_code,
        CASE
          WHEN LEFT(digits, 3) = '250' AND LENGTH(digits) = 12 THEN SUBSTRING(digits FROM 4)
          WHEN LEFT(digits, 1) = '0' AND LENGTH(digits) = 10 THEN SUBSTRING(digits FROM 2)
          ELSE digits
        END
      HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_groups > 0 THEN
      RAISE EXCEPTION 'RestoPass identity migration blocked: % duplicate normalized phone group(s) exist within a restaurant.', duplicate_groups
        USING HINT = 'Resolve duplicate customer phone numbers per restaurant before restarting. No customer records were changed.';
    END IF;
  END IF;

  IF to_regclass('uq_customers_restaurant_identity_hash') IS NULL THEN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
      SELECT restaurant_code, data->>'idHash' AS identity_hash
      FROM customers
      WHERE NULLIF(data->>'idHash', '') IS NOT NULL
      GROUP BY restaurant_code, data->>'idHash'
      HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_groups > 0 THEN
      RAISE EXCEPTION 'RestoPass identity migration blocked: % duplicate identity-document hash group(s) exist within a restaurant.', duplicate_groups
        USING HINT = 'Resolve duplicate identity documents per restaurant before restarting. No customer records were changed.';
    END IF;
  END IF;

  IF to_regclass('uq_customers_restaurant_student_number') IS NULL THEN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
      SELECT restaurant_code, LOWER(BTRIM(data #>> '{studentProfile,registrationNumber}')) AS student_number
      FROM customers
      WHERE is_student = TRUE
        AND LENGTH(BTRIM(COALESCE(data #>> '{studentProfile,registrationNumber}', ''))) >= 3
      GROUP BY restaurant_code, LOWER(BTRIM(data #>> '{studentProfile,registrationNumber}'))
      HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_groups > 0 THEN
      RAISE EXCEPTION 'RestoPass identity migration blocked: % duplicate student registration number group(s) exist within a restaurant.', duplicate_groups
        USING HINT = 'Resolve duplicate student registration numbers per restaurant before restarting. No customer records were changed.';
    END IF;
  END IF;
END $identity_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_restaurant_phone_normalized
ON customers (
  restaurant_code,
  (CASE
    WHEN LEFT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 3) = '250'
      AND LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) = 12
      THEN SUBSTRING(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') FROM 4)
    WHEN LEFT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 1) = '0'
      AND LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) = 10
      THEN SUBSTRING(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') FROM 2)
    ELSE REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')
  END)
)
WHERE phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) >= 7;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_restaurant_identity_hash
ON customers (restaurant_code, (data->>'idHash'))
WHERE NULLIF(data->>'idHash', '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_restaurant_student_number
ON customers (restaurant_code, (LOWER(BTRIM(data #>> '{studentProfile,registrationNumber}'))))
WHERE is_student = TRUE
  AND LENGTH(BTRIM(COALESCE(data #>> '{studentProfile,registrationNumber}', ''))) >= 3;

-- 4. Immutable Append-Only Ledger Entries (CRITICAL 50,000 DAU Invariance)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL,
    plates_delta INT NOT NULL,
    amount_rwf INT,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Customer Subscription States
CREATE TABLE IF NOT EXISTS customer_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    restaurant_code VARCHAR(32) NOT NULL,
    plan VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'inactive',
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Balance Checkpoints for Fast O(1) Balance Calculation
CREATE TABLE IF NOT EXISTS balance_checkpoints (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    balance INT NOT NULL,
    cutoff_timestamp TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Payment Transactions (Top-ups, Mobile Money & Cash)
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    customer_id VARCHAR(64),
    amount_rwf INT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Scan Events & Spot-Check Audits
CREATE TABLE IF NOT EXISTS scan_events (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    station_id VARCHAR(64),
    status VARCHAR(32) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Student Self-Registrations & Boss Approvals Room
CREATE TABLE IF NOT EXISTS pending_approvals (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Dining Hall Branches & Scanner Stations
CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Station Users & Cashier Credentials
CREATE TABLE IF NOT EXISTS station_users (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_resto_username UNIQUE (restaurant_code, username)
);

-- 11a. Individually provisioned tenant administrators (no shared boss password).
CREATE TABLE IF NOT EXISTS restaurant_admins (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    session_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_admin_username UNIQUE (restaurant_code, username)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_admins_status ON restaurant_admins (restaurant_code, status);
ALTER TABLE restaurant_admins ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1;

-- 12. Notifications & System Dispatch
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    recipient_id VARCHAR(64),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Cafeteria Operating Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    amount_rwf INT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. P2P Plate Transfers Between Students
CREATE TABLE IF NOT EXISTS transfers (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    sender_customer_id VARCHAR(64) NOT NULL,
    recipient_customer_id VARCHAR(64) NOT NULL,
    plates INT NOT NULL CHECK (plates > 0),
    idempotency_key VARCHAR(128),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_transfer_distinct_customers CHECK (sender_customer_id <> recipient_customer_id)
);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_idempotency
    ON transfers (restaurant_code,idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Idempotency for server-authoritative transfers; safe for existing installations.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_idempotency
    ON transfers (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 15. Immutable Security & Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    user_id VARCHAR(64),
    action VARCHAR(128) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Dynamic System Settings (Translations, Subscription Configs, Plans)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Multi-Instance Token Replay Guard Table (Fallback if Redis is unreachable)
CREATE TABLE IF NOT EXISTS used_tokens (
    token_key VARCHAR(128) PRIMARY KEY,
    used_at BIGINT NOT NULL,
    station_id VARCHAR(64),
    member_no VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 18. Atomic scan request idempotency: stores the committed response for safe retries.
CREATE TABLE IF NOT EXISTS scan_requests (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    restaurant_code VARCHAR(32) NOT NULL,
    response JSONB NOT NULL,
    request_hash VARCHAR(64),
    actor_user_id VARCHAR(128),
    station_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE scan_requests ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);
ALTER TABLE scan_requests ADD COLUMN IF NOT EXISTS actor_user_id VARCHAR(128);
ALTER TABLE scan_requests ADD COLUMN IF NOT EXISTS station_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_scan_requests_created ON scan_requests (created_at);

-- Production Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_customer_time ON ledger_entries (customer_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_resto ON ledger_entries (restaurant_code);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON ledger_entries (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_resto ON customers (restaurant_code);
CREATE INDEX IF NOT EXISTS idx_scan_events_resto_time ON scan_events (restaurant_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_customer ON scan_events (customer_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_resto ON pending_approvals (restaurant_code, status);
CREATE INDEX IF NOT EXISTS idx_used_tokens_expires ON used_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_resto ON licenses (restaurant_code);
CREATE INDEX IF NOT EXISTS idx_checkpoints_customer_cutoff ON balance_checkpoints (customer_id, cutoff_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_payments_resto_customer ON payments (restaurant_code, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_resto_customer ON customer_subscriptions (restaurant_code, customer_id);
CREATE INDEX IF NOT EXISTS idx_branches_resto ON branches (restaurant_code);
CREATE INDEX IF NOT EXISTS idx_expenses_resto ON expenses (restaurant_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_resto_recipient ON notifications (restaurant_code, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resto_time ON audit_logs (restaurant_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_resto_time ON transfers (restaurant_code, created_at DESC);

-- 19. Two-person financial exception workflow. Requests are immutable snapshots;
-- approvals are committed with compensating ledger entries in one transaction.
CREATE TABLE IF NOT EXISTS financial_exception_requests (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    exception_type VARCHAR(32) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64),
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    idempotency_key VARCHAR(128) NOT NULL,
    requested_by_user_id VARCHAR(128) NOT NULL,
    approved_by_user_id VARCHAR(128),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_financial_exception_idempotency UNIQUE (restaurant_code, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_financial_exceptions_queue
    ON financial_exception_requests (restaurant_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_exceptions_source
    ON financial_exception_requests (restaurant_code, exception_type, source_id);

-- A source transaction may have at most one active or completed exception.
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_exception_source_active
    ON financial_exception_requests (restaurant_code, exception_type, source_id)
    WHERE status IN ('pending', 'approved');

-- 20. Provider-neutral mobile-money attempts. A pending attempt never grants entitlement.
CREATE TABLE IF NOT EXISTS mobile_money_payment_attempts (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('subscription', 'plate_topup')),
    provider VARCHAR(24) NOT NULL CHECK (provider IN ('mtn_momo', 'airtel_money')),
    provider_environment VARCHAR(16) NOT NULL CHECK (provider_environment IN ('sandbox', 'production')),
    internal_reference VARCHAR(64) NOT NULL UNIQUE,
    provider_transaction_id VARCHAR(128),
    amount_rwf INT NOT NULL CHECK (amount_rwf > 0),
    currency CHAR(3) NOT NULL CHECK (currency = 'RWF'),
    status VARCHAR(24) NOT NULL DEFAULT 'created'
      CHECK (status IN ('created', 'provider_pending', 'successful', 'failed', 'cancelled', 'expired')),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    request_fingerprint VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    verified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_money_provider_transaction
    ON mobile_money_payment_attempts (provider, provider_environment, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mobile_money_customer_history
    ON mobile_money_payment_attempts (restaurant_code, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_money_reconciliation
    ON mobile_money_payment_attempts (provider, status, created_at);

-- Store only webhook event digests and processing metadata, not raw provider payloads.
CREATE TABLE IF NOT EXISTS mobile_money_webhook_events (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(24) NOT NULL CHECK (provider IN ('mtn_momo', 'airtel_money')),
    provider_environment VARCHAR(16) NOT NULL CHECK (provider_environment IN ('sandbox', 'production')),
    provider_event_key VARCHAR(160) NOT NULL,
    internal_reference VARCHAR(64),
    body_sha256 VARCHAR(64) NOT NULL,
    processing_status VARCHAR(24) NOT NULL DEFAULT 'received'
      CHECK (processing_status IN ('received', 'verified', 'rejected', 'reconciled')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_mobile_money_webhook_event UNIQUE (provider, provider_environment, provider_event_key)
);
CREATE INDEX IF NOT EXISTS idx_mobile_money_webhook_status
    ON mobile_money_webhook_events (processing_status, received_at);

-- Two-person, one-time overrides for serving-window limits.
CREATE TABLE IF NOT EXISTS scan_supervisor_overrides (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_code VARCHAR(32) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  station_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('pending','approved','consumed','rejected','expired')),
  requested_by_user_id VARCHAR(64) NOT NULL,
  approved_by_user_id VARCHAR(64),
  idempotency_key VARCHAR(128) NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_scan_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_scan_supervisor_override_key UNIQUE (restaurant_code,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_scan_supervisor_override_queue
  ON scan_supervisor_overrides (restaurant_code,status,created_at DESC);


-- 21. RestoPass own-merchant SaaS subscriptions. This is deliberately separate
-- from customer meal subscriptions and restaurant meal-payment records.
CREATE TABLE IF NOT EXISTS restaurant_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL UNIQUE REFERENCES restaurants(code) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL DEFAULT 'pending_payment'
      CHECK (status IN ('pending_payment','active','grace_period','restricted','cancelled')),
    price_rwf INT NOT NULL CHECK (price_rwf > 0),
    currency CHAR(3) NOT NULL DEFAULT 'RWF' CHECK (currency = 'RWF'),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    grace_period_end TIMESTAMPTZ,
    last_payment_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (status = 'pending_payment' AND current_period_start IS NULL AND current_period_end IS NULL)
      OR status <> 'pending_payment'
    )
);
CREATE INDEX IF NOT EXISTS idx_restaurant_subscriptions_status
  ON restaurant_subscriptions (status, current_period_end);

-- SaaS payment attempts represent Bestie's own software-access fee only.
-- No customer_id and no reuse of meal top-up/customer subscription tables.
CREATE TABLE IF NOT EXISTS restaurant_subscription_payments (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE RESTRICT,
    provider VARCHAR(24) NOT NULL CHECK (provider = 'mtn_momo'),
    provider_environment VARCHAR(16) NOT NULL CHECK (provider_environment IN ('sandbox','production')),
    internal_reference VARCHAR(64) NOT NULL UNIQUE,
    provider_transaction_id VARCHAR(128),
    payer_msisdn VARCHAR(24) NOT NULL,
    amount_rwf INT NOT NULL CHECK (amount_rwf > 0),
    currency CHAR(3) NOT NULL DEFAULT 'RWF' CHECK (currency = 'RWF'),
    status VARCHAR(24) NOT NULL DEFAULT 'created'
      CHECK (status IN ('created','provider_pending','successful','failed','cancelled','expired','review_required')),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    request_fingerprint VARCHAR(64) NOT NULL,
    provider_status VARCHAR(64),
    verified_at TIMESTAMPTZ,
    entitlement_applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Existing deployments must accept a final provider-success that fails a strict match.
ALTER TABLE restaurant_subscription_payments
  DROP CONSTRAINT IF EXISTS restaurant_subscription_payments_status_check;
ALTER TABLE restaurant_subscription_payments
  ADD CONSTRAINT restaurant_subscription_payments_status_check
  CHECK (status IN ('created','provider_pending','successful','failed','cancelled','expired','review_required'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_saas_provider_transaction
  ON restaurant_subscription_payments (provider, provider_environment, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_saas_payment_history
  ON restaurant_subscription_payments (restaurant_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_saas_payment_reconciliation
  ON restaurant_subscription_payments (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_saas_one_unresolved_payment
  ON restaurant_subscription_payments (restaurant_code)
  WHERE status IN ('created','provider_pending','review_required');
-- Versioned replacement index upgrades deployments that already created the earlier predicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_saas_unresolved_payment_v2
  ON restaurant_subscription_payments (restaurant_code)
  WHERE status IN ('created','provider_pending','review_required');

-- Minimal callback/reconciliation metadata. Never persist raw webhook bodies,
-- access tokens, API keys, or payer credentials.
CREATE TABLE IF NOT EXISTS restaurant_subscription_webhook_events (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(24) NOT NULL CHECK (provider = 'mtn_momo'),
    provider_environment VARCHAR(16) NOT NULL CHECK (provider_environment IN ('sandbox','production')),
    provider_event_key VARCHAR(160) NOT NULL,
    internal_reference VARCHAR(64),
    body_sha256 VARCHAR(64) NOT NULL,
    processing_status VARCHAR(24) NOT NULL DEFAULT 'received'
      CHECK (processing_status IN ('received','verified','rejected','reconciled')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_restaurant_saas_webhook UNIQUE (provider, provider_environment, provider_event_key)
);

CREATE TABLE IF NOT EXISTS restaurant_subscription_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_code VARCHAR(32) NOT NULL REFERENCES restaurants(code) ON DELETE RESTRICT,
    actor_type VARCHAR(24) NOT NULL CHECK (actor_type IN ('system','super_admin','restaurant_admin','mtn_momo')),
    actor_id VARCHAR(128),
    action VARCHAR(64) NOT NULL,
    payment_id VARCHAR(64),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_saas_audit
  ON restaurant_subscription_audit_logs (restaurant_code, created_at DESC);
