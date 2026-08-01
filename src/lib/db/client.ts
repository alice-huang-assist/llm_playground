import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applyMigrations } from "./schema";

/**
 * Where the database lives. Overridable so tests can point at a throwaway file
 * instead of the real one.
 */
export const DATABASE_PATH =
  process.env.PLAYGROUND_DB ?? path.join(process.cwd(), "data", "playground.db");

/** Open a database at an explicit location, creating and migrating it. */
export function openDatabase(location: string): DatabaseSync {
  if (location !== ":memory:") {
    mkdirSync(path.dirname(location), { recursive: true });
  }

  const db = new DatabaseSync(location);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  applyMigrations(db);

  return db;
}

let instance: DatabaseSync | null = null;

/** The app's database, created on first use and migrated before it is handed out. */
export function getDatabase(): DatabaseSync {
  instance ??= openDatabase(DATABASE_PATH);
  return instance;
}
