-- 問仙壇 wenxiantan-db（八張表）
-- 套用：wrangler d1 execute wenxiantan-db --file=functions/lib/db/schema.sql --remote

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL DEFAULT '',
  email            TEXT,
  provider         TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       INTEGER NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS credits (
  user_id   TEXT NOT NULL,
  theme_id  TEXT NOT NULL,
  balance   INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  PRIMARY KEY (user_id, theme_id)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  theme_id         TEXT NOT NULL,
  delta            INTEGER NOT NULL,
  reason           TEXT NOT NULL,
  order_id         TEXT,
  reading_id       TEXT,
  idempotency_key  TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger (user_id, theme_id, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  amount             INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'TWD',
  status             TEXT NOT NULL DEFAULT 'PENDING',
  provider           TEXT NOT NULL DEFAULT 'ecpay',
  merchant_trade_no  TEXT NOT NULL UNIQUE,
  themes_json        TEXT NOT NULL,
  terms_version      TEXT NOT NULL DEFAULT '',
  created_at         INTEGER NOT NULL,
  paid_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id, created_at);

CREATE TABLE IF NOT EXISTS payment_events (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  order_id     TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS readings (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  theme_id        TEXT NOT NULL,
  input_json      TEXT NOT NULL,
  content_json    TEXT NOT NULL,
  model           TEXT NOT NULL,
  tokens          INTEGER NOT NULL DEFAULT 0,
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  nonce           TEXT NOT NULL UNIQUE,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_readings_user ON readings (user_id, theme_id, created_at);

CREATE TABLE IF NOT EXISTS verify_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used_at     INTEGER
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  redirect   TEXT NOT NULL DEFAULT '/'
);
