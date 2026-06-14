import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { open_database, run_migrations } from '../server/db.ts';
import { create_idempotency_store } from '../server/idempotency.ts';

const fresh_store = () => {
  const db = open_database(':memory:');
  run_migrations(db);
  return { db, store: create_idempotency_store(db) };
};

describe('idempotency store', () => {
  test('hashes equivalent bodies identically regardless of key order', () => {
    const { store } = fresh_store();
    assert.deepEqual({ same: store.hash_body({ a: 1, b: 2 }) === store.hash_body({ b: 2, a: 1 }) }, { same: true });
  });

  test('lookup returns null on first encounter', () => {
    const { store } = fresh_store();
    assert.deepEqual({ value: store.lookup('k1', store.hash_body({ x: 1 })) }, { value: null });
  });

  test('record then lookup replays the exact response', () => {
    const { store } = fresh_store();
    const hash = store.hash_body({ x: 1 });
    store.record('k1', hash, { status: 201, headers: { ETag: 'W/"a"' }, body: '{"slug":"thing"}' });
    assert.deepEqual(store.lookup('k1', hash), { status: 201, headers: { ETag: 'W/"a"' }, body: '{"slug":"thing"}' });
  });

  test('lookup with same key and different body returns conflict', () => {
    const { store } = fresh_store();
    const hash_a = store.hash_body({ x: 1 });
    store.record('k1', hash_a, { status: 200, headers: {}, body: '' });
    const hash_b = store.hash_body({ x: 2 });
    assert.deepEqual({ conflict: store.lookup('k1', hash_b) }, { conflict: 'conflict' });
  });

  test('record persists row to idempotency_keys table', () => {
    const { db, store } = fresh_store();
    const hash = store.hash_body({ y: 7 });
    store.record('k99', hash, { status: 200, headers: { ETag: 'W/"zz"' }, body: '{}' });
    const row = db.prepare('SELECT body_hash, response_status, response_headers_json FROM idempotency_keys WHERE key = ?').get('k99') as { body_hash: string; response_status: number; response_headers_json: string };
    assert.deepEqual({ body_hash: row.body_hash, response_status: row.response_status, response_headers_json: row.response_headers_json }, { body_hash: hash, response_status: 200, response_headers_json: '{"ETag":"W/\\"zz\\""}' });
  });
});
