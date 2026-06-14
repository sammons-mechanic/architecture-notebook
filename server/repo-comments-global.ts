import type { Database } from './db.ts';
import type { CommentRow } from './repo-comments.ts';

export type GlobalCommentsFilter = {
  readonly resolved: boolean | null;
  readonly author: string | null;
  readonly anchor: string | null;
  readonly since: number | null;
  readonly limit: number;
};

export const list_comments_global = (db: Database, filter: GlobalCommentsFilter): CommentRow[] => {
  const clauses: string[] = [];
  const params: Array<number | string> = [];
  if (filter.resolved !== null) {
    clauses.push('resolved = ?');
    params.push(filter.resolved ? 1 : 0);
  }
  if (filter.author !== null) {
    clauses.push('author = ?');
    params.push(filter.author);
  }
  if (filter.anchor !== null) {
    clauses.push('anchor = ?');
    params.push(filter.anchor);
  }
  if (filter.since !== null) {
    clauses.push('created_at > ?');
    params.push(filter.since);
  }
  const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
  const sql = `SELECT * FROM comments ${where} ORDER BY created_at DESC, id DESC LIMIT ?`;
  return db.prepare(sql).all(...params, filter.limit) as CommentRow[];
};
