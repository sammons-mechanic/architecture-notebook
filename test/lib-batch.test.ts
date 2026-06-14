import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyze_dependencies, transitive_dependents, type BatchOp } from '../server/lib/batch-deps.ts';
import { substitute_tokens, token_dependencies } from '../server/lib/batch-tokens.ts';
import { is_failure } from '../server/lib/failure.ts';

describe('batch dependency analysis', () => {
  test('orders dependent ops after producers', () => {
    const ops: BatchOp[] = [
      { id: 'b', method: 'POST', href: `/api/refs`, body: { to: '$a.slug' } },
      { id: 'a', method: 'POST', href: `/api/sections`, body: { title: 'x' } },
    ];
    const result = analyze_dependencies(ops);
    if (is_failure(result)) {
      throw new Error('unexpected failure');
    }
    assert.deepEqual({ order: result.order, pre_failures_size: result.pre_failures.size }, { order: ['a', 'b'], pre_failures_size: 0 });
  });

  test('flags unknown opid as pre-execution failure', () => {
    const ops: BatchOp[] = [
      { id: 'b', method: 'POST', href: `/api/refs`, body: { to: '$missing.slug' } },
    ];
    const result = analyze_dependencies(ops);
    if (is_failure(result)) {
      throw new Error('unexpected failure');
    }
    assert.deepEqual(
      { has_failure: result.pre_failures.has('b'), code: result.pre_failures.get('b')?.code },
      { has_failure: true, code: 'backref-unresolved' },
    );
  });

  test('detects cycles', () => {
    const ops: BatchOp[] = [
      { id: 'a', method: 'POST', href: `/api/refs`, body: { to: '$b.slug' } },
      { id: 'b', method: 'POST', href: `/api/refs`, body: { to: '$a.slug' } },
    ];
    const result = analyze_dependencies(ops);
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'cycle-illegal' },
    );
  });

  test('token_dependencies finds nested tokens', () => {
    const deps = token_dependencies({ outer: { inner: '$a.slug', list: ['$b.id', 'plain'] } });
    assert.deepEqual([...deps].sort(), ['a', 'b']);
  });

  test('substitute_tokens replaces whole-leaf tokens preserving types', () => {
    const results = new Map([['a', { slug: 'foo-bar', id: 7 }]]);
    const substituted = substitute_tokens({ name: '$a.slug', ref: '$a.id', literal: 'prefix-$a.slug' }, results);
    assert.deepEqual(substituted, { name: 'foo-bar', ref: 7, literal: 'prefix-$a.slug' });
  });

  test('substitute_tokens fails when producer does not expose attribute', () => {
    const results = new Map([['a', { id: 7 }]]);
    const result = substitute_tokens({ value: '$a.slug' }, results);
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'backref-unresolved' },
    );
  });

  test('substitute_tokens preserves non-string types', () => {
    const substituted = substitute_tokens({ count: 5, ok: true, x: null }, new Map());
    assert.deepEqual(substituted, { count: 5, ok: true, x: null });
  });

  test('transitive_dependents finds chained dependents', () => {
    const ops: BatchOp[] = [
      { id: 'a', method: 'POST', href: `/api/sections`, body: {} },
      { id: 'b', method: 'POST', href: `/api/refs`, body: { to: '$a.slug' } },
      { id: 'c', method: 'POST', href: `/api/refs`, body: { from: '$b.id' } },
      { id: 'd', method: 'POST', href: `/api/sections`, body: {} },
    ];
    const aborted = transitive_dependents(ops, 'a');
    assert.deepEqual([...aborted].sort(), ['b', 'c']);
  });
});
