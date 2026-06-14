import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compute_numbering, ancestors_of, check_move_cycle, type TreeNode } from '../server/lib/numbering.ts';
import { is_failure } from '../server/lib/failure.ts';

const tree: TreeNode[] = [
  { id: 1, slug: 'root-a', parent_id: null, position: 0 },
  { id: 2, slug: 'root-b', parent_id: null, position: 1 },
  { id: 3, slug: 'child-a-1', parent_id: 1, position: 0 },
  { id: 4, slug: 'child-a-2', parent_id: 1, position: 1 },
  { id: 5, slug: 'grandchild', parent_id: 3, position: 0 },
];

describe('numbering', () => {
  test('compute_numbering produces dotted numbers for a small tree', () => {
    const numbers = compute_numbering(tree);
    assert.deepEqual(Object.fromEntries(numbers), { 1: '1', 2: '2', 3: '1.1', 4: '1.2', 5: '1.1.1' });
  });

  test('compute_numbering sorts siblings by position then id', () => {
    const out_of_order = [
      { id: 10, slug: 'b', parent_id: null, position: 1 },
      { id: 11, slug: 'a', parent_id: null, position: 0 },
    ];
    const numbers = compute_numbering(out_of_order);
    assert.deepEqual(Object.fromEntries(numbers), { 11: '1', 10: '2' });
  });

  test('compute_numbering breaks position ties by id', () => {
    const tied = [
      { id: 7, slug: 'late', parent_id: null, position: 0 },
      { id: 5, slug: 'early', parent_id: null, position: 0 },
    ];
    const numbers = compute_numbering(tied);
    assert.deepEqual(Object.fromEntries(numbers), { 5: '1', 7: '2' });
  });

  test('ancestors_of returns the chain to root', () => {
    const ancestors = ancestors_of(tree, 5);
    assert.deepEqual(ancestors.map((node) => node.slug), ['root-a', 'child-a-1']);
  });

  test('check_move_cycle rejects making a node its own ancestor', () => {
    const result = check_move_cycle(tree, 1, 5);
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'cycle-illegal' },
    );
  });

  test('check_move_cycle permits valid moves', () => {
    const result = check_move_cycle(tree, 4, 2);
    assert.deepEqual({ ok: result === true }, { ok: true });
  });

  test('check_move_cycle accepts move-to-root with null parent', () => {
    const result = check_move_cycle(tree, 5, null);
    assert.deepEqual({ ok: result === true }, { ok: true });
  });
});
