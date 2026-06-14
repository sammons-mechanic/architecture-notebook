import { createHash } from 'node:crypto';
import type { Database } from './db.ts';

export type CachedResponse = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
};

export type IdempotencyStore = {
  readonly hash_body: (body: unknown) => string;
  readonly lookup: (key: string, body_hash: string) => CachedResponse | 'conflict' | null;
  readonly record: (key: string, body_hash: string, response: CachedResponse) => void;
  readonly sweep: () => void;
};

const ttl_ms = 24 * 60 * 60 * 1000;

const canonical_json = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical_json(entry)).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonical_json((value as Record<string, unknown>)[key])}`);
  return `{${parts.join(',')}}`;
};

export const create_idempotency_store = (db: Database): IdempotencyStore => {
  const cache = new Map<string, { body_hash: string; response: CachedResponse; expires_at: number }>();
  let writes_since_sweep = 0;
  const warm_from_db = () => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare('DELETE FROM idempotency_keys WHERE expires_at <= ?').run(now);
    const rows = db.prepare('SELECT key, body_hash, response_status, response_headers_json, response_body, expires_at FROM idempotency_keys').all() as Array<{
      key: string;
      body_hash: string;
      response_status: number;
      response_headers_json: string;
      response_body: string;
      expires_at: number;
    }>;
    for (const row of rows) {
      cache.set(row.key, {
        body_hash: row.body_hash,
        response: {
          status: row.response_status,
          headers: JSON.parse(row.response_headers_json) as Record<string, string>,
          body: row.response_body,
        },
        expires_at: row.expires_at * 1000,
      });
    }
  };
  const sweep = () => {
    const now = Date.now();
    const now_s = Math.floor(now / 1000);
    for (const [key, entry] of cache.entries()) {
      if (entry.expires_at <= now) {
        cache.delete(key);
      }
    }
    db.prepare('DELETE FROM idempotency_keys WHERE expires_at <= ?').run(now_s);
  };
  warm_from_db();
  return Object.freeze({
    hash_body: (body) => createHash('sha256').update(canonical_json(body ?? null)).digest('hex'),
    lookup: (key, body_hash) => {
      const entry = cache.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expires_at <= Date.now()) {
        cache.delete(key);
        return null;
      }
      if (entry.body_hash !== body_hash) {
        return 'conflict';
      }
      return entry.response;
    },
    record: (key, body_hash, response) => {
      const expires_at_ms = Date.now() + ttl_ms;
      cache.set(key, { body_hash, response, expires_at: expires_at_ms });
      db.prepare(
        'INSERT OR REPLACE INTO idempotency_keys(key, body_hash, response_status, response_headers_json, response_body, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(key, body_hash, response.status, JSON.stringify(response.headers ?? {}), response.body, Math.floor(expires_at_ms / 1000));
      writes_since_sweep += 1;
      if (writes_since_sweep >= 100) {
        writes_since_sweep = 0;
        sweep();
      }
    },
    sweep,
  });
};
