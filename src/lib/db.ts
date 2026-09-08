import { createClient, type Client, type InArgs, type InValue } from "@libsql/client";

/**
 * libSQL/Turso. The same SQLite dialect the schema was written against, reached
 * over HTTP so it survives a serverless filesystem — Netlify functions get a
 * read-only disk and an ephemeral /tmp, so a local database file would be lost
 * between invocations.
 *
 * Locally, TURSO_DATABASE_URL can be a `file:` URL and everything behaves the
 * same way.
 */

export type Arg = InValue;

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

/** A prepared statement, kept in better-sqlite3's shape so call sites read the same. */
export interface Statement {
  // Deliberately loose: call sites carry their own `as Row` casts, exactly as
  // they did against better-sqlite3, so the port needs no retyping.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  get(...args: Arg[]): Promise<any>;
  all(...args: Arg[]): Promise<any>;
  run(...args: Arg[]): Promise<RunResult>;
}

export interface Db {
  prepare(sql: string): Statement;
  /** Runs the statements as one atomic transaction. */
  batch(statements: Array<{ sql: string; args?: Arg[] }>): Promise<void>;
  client: Client;
}

let client: Client | null = null;
let migrated: Promise<void> | null = null;

function connect(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set — point it at a Turso database (libsql://…) or a local file: URL",
    );
  }
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

function wrap(c: Client): Db {
  // Every query waits on the one-time migration before it runs, which is what
  // lets getDb() stay synchronous: `await db.prepare(sql).get(x)` binds the
  // await to the whole chain, so call sites need nothing more than that.
  const execute = async (sql: string, args: Arg[]) => {
    await ensureMigrated();
    return c.execute({ sql, args: args as InArgs });
  };
  // libSQL hands back Row objects that carry a custom prototype. React refuses
  // to pass those from a server component to a client one, so every row is
  // copied into a plain object on the way out.
  const plain = (row: unknown) => ({ ...(row as object) });
  const statement = (sql: string): Statement => ({
    async get(...args: Arg[]) {
      const res = await execute(sql, args);
      return res.rows[0] === undefined ? undefined : plain(res.rows[0]);
    },
    async all(...args: Arg[]) {
      const res = await execute(sql, args);
      return res.rows.map(plain);
    },
    async run(...args: Arg[]): Promise<RunResult> {
      const res = await execute(sql, args);
      return {
        lastInsertRowid: res.lastInsertRowid === undefined ? 0 : Number(res.lastInsertRowid),
        changes: res.rowsAffected,
      };
    },
  });
  return {
    prepare: statement,
    batch: async (statements) => {
      await ensureMigrated();
      await c.batch(
        statements.map((st) => ({ sql: st.sql, args: (st.args ?? []) as InArgs })),
        "write",
      );
    },
    client: c,
  };
}

/** The shared handle. Synchronous by design — see `wrap`. */
export function getDb(): Db {
  return wrap(connect());
}

function ensureMigrated(): Promise<void> {
  if (!migrated) {
    migrated = migrate().catch((err) => {
      migrated = null; // let the next request retry rather than wedging the process
      throw err;
    });
  }
  return migrated;
}

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS profiles (
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
   )`,
  `CREATE TABLE IF NOT EXISTS oauth_tokens (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     provider TEXT NOT NULL,
     access_token TEXT NOT NULL,
     refresh_token TEXT,
     expires_at INTEGER,
     scope TEXT,
     external_user_id TEXT,
     connected_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, provider)
   )`,
  `CREATE TABLE IF NOT EXISTS oauth_states (
     state TEXT PRIMARY KEY,
     provider TEXT NOT NULL,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     code_verifier TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS activities (
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
   )`,
  `CREATE TABLE IF NOT EXISTS recovery (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     sleep_seconds INTEGER,
     sleep_score INTEGER,
     hrv_ms REAL,
     body_battery INTEGER,
     resting_hr INTEGER,
     vo2max REAL,
     PRIMARY KEY (user_id, date)
   )`,
  `CREATE TABLE IF NOT EXISTS plan_days (
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
   )`,
  `CREATE TABLE IF NOT EXISTS surveys (
     activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     feel TEXT NOT NULL,
     rpe INTEGER NOT NULL,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     text TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS adaptations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     summary TEXT NOT NULL,
     detail TEXT NOT NULL,
     dismissed INTEGER NOT NULL DEFAULT 0,
     announced_activity_id INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     provider TEXT NOT NULL,
     last_sync TEXT,
     last_error TEXT,
     PRIMARY KEY (user_id, provider)
   )`,
  `CREATE TABLE IF NOT EXISTS webhook_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     provider TEXT NOT NULL,
     payload TEXT NOT NULL,
     received_at TEXT NOT NULL DEFAULT (datetime('now')),
     processed INTEGER NOT NULL DEFAULT 0,
     error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS tune_up_races (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     date TEXT NOT NULL,
     distance_km REAL NOT NULL,
     goal_seconds INTEGER,
     UNIQUE(user_id, date)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, start_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_plan_user_date ON plan_days(user_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_recovery_user_date ON recovery(user_id, date DESC)`,
];

async function migrate() {
  const c = connect();
  for (const sql of SCHEMA) await c.execute(sql);
  // Columns added to an already-deployed schema. SQLite has no
  // "ADD COLUMN IF NOT EXISTS", so each is checked against the live table.
  await addColumn(c, "adaptations", "announced_activity_id", "INTEGER");
}

async function addColumn(c: Client, table: string, column: string, type: string) {
  const cols = await c.execute(`PRAGMA table_info(${table})`);
  if (cols.rows.some((r) => (r as unknown as { name: string }).name === column)) return;
  await c.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
