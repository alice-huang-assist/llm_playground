import type { DatabaseSync } from "node:sqlite";

/**
 * Migrations are applied in order and tracked with SQLite's own `user_version`,
 * so an empty file and an existing one converge without a separate ledger table.
 */
export interface Migration {
  version: number;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        provider_id TEXT,
        model_id TEXT,
        system_prompt TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        -- Strictly increasing per write, so "newest first" never depends on
        -- clock resolution: two writes in the same millisecond still order.
        sequence INTEGER NOT NULL
      );

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL
      );

      CREATE UNIQUE INDEX messages_session_position
        ON messages (session_id, position);

      CREATE INDEX sessions_sequence ON sessions (sequence DESC);
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    up: `
      CREATE TABLE generations (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT NOT NULL DEFAULT '',
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        steps INTEGER NOT NULL,
        seed INTEGER,
        cfg_scale REAL NOT NULL,
        sampler TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX generations_created_at ON generations (created_at DESC);
    `,
  },
  {
    version: 4,
    up: `
      ALTER TABLE generations ADD COLUMN used_reference INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE generations ADD COLUMN denoising_strength REAL;
    `,
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as
    | { user_version?: number }
    | undefined;
  return row?.user_version ?? 0;
}

/** Bring a database up to the latest schema. Returns the version it lands on. */
export function applyMigrations(db: DatabaseSync): number {
  let version = currentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= version) continue;

    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      // PRAGMA does not accept a bound parameter, and the value is our own.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    version = migration.version;
  }

  return version;
}
