CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  auth_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;

CREATE TABLE sync_documents (
  account_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  algorithm TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  server_revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX sync_documents_updated_at_idx
  ON sync_documents(updated_at);

CREATE TABLE cloud_usage (
  usage_key TEXT NOT NULL,
  usage_day TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  character_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usage_key, usage_day)
) WITHOUT ROWID;

CREATE INDEX cloud_usage_updated_at_idx
  ON cloud_usage(updated_at);

CREATE TABLE cloud_rate_limits (
  usage_key TEXT NOT NULL,
  minute_window TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usage_key, minute_window)
) WITHOUT ROWID;
