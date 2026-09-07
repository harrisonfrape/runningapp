import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

/** Single shared SQLite handle. The file lives in DATA_DIR (default ./data). */
export function getDb(): Database.Database {
  if (db) return db;
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "stride.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      race_name TEXT NOT NULL,
      race_date TEXT NOT NULL,
      goal_seconds INTEGER NOT NULL,
      lthr INTEGER,
      max_hr INTEGER,
      resting_hr INTEGER,
      vo2max REAL,
      plan_start TEXT,
      onboarded INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER,
      scope TEXT,
      external_user_id TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_verifier TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      distance_m REAL NOT NULL,
      moving_time_s INTEGER NOT NULL,
      elapsed_time_s INTEGER NOT NULL,
      average_hr REAL,
      max_hr REAL,
      average_cadence REAL,
      total_elevation_m REAL,
      type TEXT NOT NULL,
      zone_seconds_json TEXT,
      raw TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, provider, external_id)
    );

    CREATE TABLE IF NOT EXISTS recovery (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      sleep_seconds INTEGER,
      sleep_score INTEGER,
      hrv_ms REAL,
      body_battery INTEGER,
      resting_hr INTEGER,
      vo2max REAL,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS plan_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      week INTEGER NOT NULL,
      day_idx INTEGER NOT NULL,
      phase TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      sub TEXT NOT NULL,
      km REAL NOT NULL,
      zone TEXT NOT NULL,
      adapted INTEGER NOT NULL DEFAULT 0,
      adapt_reason TEXT,
      hr_cap INTEGER,
      completed_activity_id INTEGER,
      UNIQUE (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS surveys (
      activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feel TEXT NOT NULL,
      rpe INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS adaptations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary TEXT NOT NULL,
      detail TEXT NOT NULL,
      dismissed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      last_sync TEXT,
      last_error TEXT,
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      payload TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, start_date DESC);
    CREATE INDEX IF NOT EXISTS idx_plan_user_date ON plan_days(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_recovery_user_date ON recovery(user_id, date DESC);
  `);

  // Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
  // EXISTS", so each is checked against the live table first.
  addColumn(d, "adaptations", "announced_activity_id", "INTEGER");
}

function addColumn(d: Database.Database, table: string, column: string, type: string) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
