import type { DatabaseSync } from "node:sqlite";

/**
 * A small key/value store for things the app needs but the user should not
 * have to re-enter. Values are stored as-is: this is a localhost single-user
 * tool, protected by filesystem permissions rather than encryption.
 */
export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value,
                                     updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

export function clearSetting(db: DatabaseSync, key: string): boolean {
  const result = db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  return Number(result.changes) > 0;
}
