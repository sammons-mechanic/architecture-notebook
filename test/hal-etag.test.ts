import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fresh_etag, etag_of, check_if_match, negotiate_accept, strip_hypermedia } from '../server/hal.ts';

describe('hal helpers', () => {
  test('fresh_etag returns 16 hex chars', () => {
    const etag = fresh_etag();
    assert.deepEqual({ length: etag.length, valid_hex: /^[0-9a-f]{16}$/.test(etag) }, { length: 16, valid_hex: true });
  });

  test('etag_of wraps as weak ETag', () => {
    assert.deepEqual({ value: etag_of({ etag: 'abcd1234' }) }, { value: 'W/"abcd1234"' });
  });

  test('check_if_match returns kind=ok for matching weak header', () => {
    assert.deepEqual(check_if_match('W/"abc"', 'abc'), { kind: 'ok' });
  });

  test('check_if_match returns kind=missing when header absent', () => {
    assert.deepEqual(check_if_match(undefined, 'abc'), { kind: 'missing' });
  });

  test('check_if_match returns kind=mismatch when value differs', () => {
    assert.deepEqual(check_if_match('W/"stale"', 'fresh'), { kind: 'mismatch', current_etag: 'fresh' });
  });

  test('negotiate_accept prefers hal when both equally weighted', () => {
    assert.deepEqual(negotiate_accept('application/json, application/hal+json'), { kind: 'hal' });
  });

  test('negotiate_accept returns json when json strictly outranks hal', () => {
    assert.deepEqual(negotiate_accept('application/json;q=0.9, application/hal+json;q=0.5'), { kind: 'json' });
  });

  test('negotiate_accept returns unacceptable when neither type is accepted', () => {
    assert.deepEqual(negotiate_accept('text/plain'), { kind: 'unacceptable' });
  });

  test('strip_hypermedia removes _links _actions _embedded recursively', () => {
    const input = { a: 1, _links: { self: { href: '/x' } }, nested: { _actions: { x: 'y' }, value: 2 } };
    assert.deepEqual(strip_hypermedia(input), { a: 1, nested: { value: 2 } });
  });
});
