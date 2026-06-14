import type { Database } from './db.ts';
import type { RevisionRow } from './repo-revisions.ts';

export type GlobalRevisionsFilter = {
  readonly author: string | null;
  readonly since: number | null;
  readonly limit: number;
};

// Notebook-wide revision feed: every section's revisions in one reverse-chron
// list, newest first. Mirrors list_comments_global. `created_at DESC, id DESC`
// keeps same-second writes in a stable, insertion-reverse order.
export const list_revisions_global = (db: Database, filter: GlobalRevisionsFilter): RevisionRow[] => {
  const clauses: string[] = [];
  const params: Array<number | string> = [];
  if (filter.author !== null) {
    clauses.push('author = ?');
    params.push(filter.author);
  }
  if (filter.since !== null) {
    clauses.push('created_at > ?');
    params.push(filter.since);
  }
  const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
  const sql = `SELECT * FROM revisions ${where} ORDER BY created_at DESC, id DESC LIMIT ?`;
  return db.prepare(sql).all(...params, filter.limit) as RevisionRow[];
};
