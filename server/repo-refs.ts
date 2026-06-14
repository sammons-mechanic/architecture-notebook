import type { Database } from './db.ts';
import { fresh_etag } from './hal.ts';

export type RefRow = {
  id: number;
  from_id: number;
  to_id: number | null;
  to_notebook: string | null;
  role: string | null;
  source: string;
  payload_json: string | null;
  etag: string;
  created_at: number;
};

export const find_ref = (db: Database, id: number): RefRow | null =>
  (db.prepare('SELECT * FROM refs WHERE id = ?').get(id) as RefRow | undefined) ?? null;

export const find_existing_ref = (
  db: Database,
  from_id: number,
  to_id: number,
  role: string | null,
  source: string
): RefRow | null => {
  if (role === null) {
    return (db.prepare('SELECT * FROM refs WHERE from_id = ? AND to_id = ? AND role IS NULL AND source = ?').get(from_id, to_id, source) as RefRow | undefined) ?? null;
  }
  return (db.prepare('SELECT * FROM refs WHERE from_id = ? AND to_id = ? AND role = ? AND source = ?').get(from_id, to_id, role, source) as RefRow | undefined) ?? null;
};

// Notebook-unit cross-ref lookup (revised 2026-05-26). Edge points at a
// peer notebook as a whole; no section slug is stored.
export const find_existing_notebook_ref = (
  db: Database,
  from_id: number,
  to_notebook: string,
  role: string | null,
  source: string
): RefRow | null => {
  if (role === null) {
    return (db.prepare('SELECT * FROM refs WHERE from_id = ? AND to_notebook = ? AND role IS NULL AND source = ?').get(from_id, to_notebook, source) as RefRow | undefined) ?? null;
  }
  return (db.prepare('SELECT * FROM refs WHERE from_id = ? AND to_notebook = ? AND role = ? AND source = ?').get(from_id, to_notebook, role, source) as RefRow | undefined) ?? null;
};

export const list_refs_for = (db: Database, section_id: number): { out: RefRow[]; inbound: RefRow[] } => {
  const out = db.prepare('SELECT * FROM refs WHERE from_id = ? ORDER BY id ASC').all(section_id) as RefRow[];
  const inbound = db.prepare('SELECT * FROM refs WHERE to_id = ? ORDER BY id ASC').all(section_id) as RefRow[];
  return { out, inbound };
};

export const list_all_refs = (db: Database): RefRow[] =>
  db.prepare('SELECT * FROM refs ORDER BY id ASC').all() as RefRow[];

export const insert_ref = (
  db: Database,
  data: { from_id: number; to_id: number; role: string | null; source: string }
): RefRow => {
  const etag = fresh_etag();
  const info = db.prepare(
    'INSERT INTO refs(from_id, to_id, role, source, etag) VALUES (?, ?, ?, ?, ?)'
  ).run(data.from_id, data.to_id, data.role, data.source, etag);
  return db.prepare('SELECT * FROM refs WHERE id = ?').get(Number(info.lastInsertRowid)) as RefRow;
};

export const insert_notebook_ref = (
  db: Database,
  data: { from_id: number; to_notebook: string; role: string | null; source: string }
): RefRow => {
  const etag = fresh_etag();
  const info = db.prepare(
    'INSERT INTO refs(from_id, to_notebook, role, source, etag) VALUES (?, ?, ?, ?, ?)'
  ).run(data.from_id, data.to_notebook, data.role, data.source, etag);
  return db.prepare('SELECT * FROM refs WHERE id = ?').get(Number(info.lastInsertRowid)) as RefRow;
};

export const delete_ref = (db: Database, id: number): void => {
  db.prepare('DELETE FROM refs WHERE id = ?').run(id);
};

export const delete_scanned_refs = (db: Database, from_id: number): void => {
  db.prepare("DELETE FROM refs WHERE from_id = ? AND source IN ('html','property')").run(from_id);
};
