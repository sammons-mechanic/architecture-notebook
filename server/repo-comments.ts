import type { Database } from './db.ts';
import { fresh_etag } from './hal.ts';

export type CommentRow = {
  id: number;
  section_id: number;
  anchor: string;
  body: string;
  author: string | null;
  resolved: number;
  created_at: number;
  updated_at: number;
  etag: string;
};

export const find_comment_by_id = (db: Database, id: number): CommentRow | null =>
  (db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow | undefined) ?? null;

export const list_comments_for_section = (
  db: Database,
  section_id: number,
  resolved_filter: boolean | null,
  anchor_filter: string | null = null,
): CommentRow[] => {
  const clauses: string[] = ['section_id = ?'];
  const params: Array<number | string> = [section_id];
  if (resolved_filter !== null) {
    clauses.push('resolved = ?');
    params.push(resolved_filter ? 1 : 0);
  }
  if (anchor_filter !== null) {
    clauses.push('anchor = ?');
    params.push(anchor_filter);
  }
  const sql = `SELECT * FROM comments WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all(...params) as CommentRow[];
};

export const count_open_comments_for_section = (db: Database, section_id: number): number => {
  const row = db.prepare('SELECT COUNT(*) AS n FROM comments WHERE section_id = ? AND resolved = 0').get(section_id) as { n: number };
  return row.n;
};

export const insert_comment = (
  db: Database,
  data: { section_id: number; anchor: string; body: string; author: string | null },
): CommentRow => {
  const etag = fresh_etag();
  const info = db.prepare(
    'INSERT INTO comments(section_id, anchor, body, author, etag) VALUES (?, ?, ?, ?, ?)'
  ).run(data.section_id, data.anchor, data.body, data.author, etag);
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(info.lastInsertRowid)) as CommentRow;
};

export const update_comment = (
  db: Database,
  id: number,
  patch: { body?: string; resolved?: boolean },
): CommentRow => {
  const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
  const etag = fresh_etag();
  const next_body = patch.body === undefined ? existing.body : patch.body;
  const next_resolved = patch.resolved === undefined ? existing.resolved : (patch.resolved ? 1 : 0);
  db.prepare(
    'UPDATE comments SET body = ?, resolved = ?, etag = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(next_body, next_resolved, etag, id);
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
};

export const delete_comment = (db: Database, id: number): void => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
};
