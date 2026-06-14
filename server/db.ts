import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Database = DatabaseSync;

const here = dirname(fileURLToPath(import.meta.url));
const migrations_dir = join(here, 'migrations');

export const open_database = (db_path: string): Database => {
  if (db_path !== ':memory:') {
    mkdirSync(dirname(db_path), { recursive: true });
  }
  const db = new DatabaseSync(db_path);
  db.exec('PRAGMA foreign_keys = ON');
  if (db_path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  return db;
};

const read_current_version = (db: Database): number => {
  const meta_exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'")
    .get();
  if (!meta_exists) {
    return 0;
  }
  const row = db
    .prepare("SELECT value FROM meta WHERE key='schema_version'")
    .get() as { value?: string } | undefined;
  if (!row || row.value === undefined) {
    return 0;
  }
  return Number(row.value);
};

const list_migration_files = (): Array<{ version: number; name: string; sql: string }> => {
  const files = readdirSync(migrations_dir).filter((file_name) => file_name.endsWith('.sql'));
  return files
    .map((file_name) => {
      const match = file_name.match(/^(\d+)_/);
      if (!match) {
        throw new Error(`migration filename must start with NNN_: ${file_name}`);
      }
      const version = Number(match[1]);
      const sql = readFileSync(join(migrations_dir, file_name), 'utf8');
      return { version, name: file_name, sql };
    })
    .sort((left, right) => left.version - right.version);
};

export const run_migrations = (db: Database): number => {
  const current = read_current_version(db);
  const files = list_migration_files();
  const pending = files.filter((file) => file.version > current);
  for (const migration of pending) {
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      const new_etag = '0';
      void new_etag;
      db.prepare(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).run(String(migration.version));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return files.length === 0 ? current : files[files.length - 1].version;
};

export const schema_version = (db: Database): number => read_current_version(db);
