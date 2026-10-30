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
    plates INT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
