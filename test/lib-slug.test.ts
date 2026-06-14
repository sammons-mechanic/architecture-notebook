import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalize_slug, slug_from_title, next_unique_slug, is_valid_slug, notebook_ref_pattern, parse_notebook_ref, is_valid_ref_target } from '../server/lib/slug.ts';
import { is_failure } from '../server/lib/failure.ts';

describe('slug', () => {
  test('normalize_slug accepts canonical slug', () => {
    assert.deepEqual({ value: normalize_slug('api-acme-com') }, { value: 'api-acme-com' });
  });

  test('normalize_slug rejects uppercase letters', () => {
    const result = normalize_slug('Api-Acme');
    assert.deepEqual({ failed: is_failure(result), code: is_failure(result) ? result.code : null }, { failed: true, code: 'slug-invalid' });
  });

  test('slug_from_title strips whitespace and punctuation', () => {
    assert.deepEqual({ value: slug_from_title('  Hello, World! Acme  ') }, { value: 'hello-world-acme' });
  });

  test('next_unique_slug appends incremental suffix', () => {
    const taken = new Set(['foo', 'foo-2']);
    const slug = next_unique_slug('foo', (candidate) => taken.has(candidate));
    assert.deepEqual({ slug }, { slug: 'foo-3' });
  });

  test('is_valid_slug rejects empty and whitespace', () => {
    assert.deepEqual({ empty: is_valid_slug(''), space: is_valid_slug('foo bar') }, { empty: false, space: false });
  });
});

describe('notebook ref grammar (revised 2026-05-26 — notebook-as-unit only)', () => {
  test('accepts @notebook with alphanumeric start', () => {
    assert.deepEqual(
      [
        notebook_ref_pattern.test('@todo-app'),
        notebook_ref_pattern.test('@a'),
        notebook_ref_pattern.test('@9-thing'),
      ],
      [true, true, true],
    );
  });

  test('rejects @notebook/slug (section-traversal no longer supported), leading dash, uppercase, trailing slash, multiple @', () => {
    assert.deepEqual(
      [
        notebook_ref_pattern.test('@todo-app/order-service'),
        notebook_ref_pattern.test('@'),
        notebook_ref_pattern.test('@/slug'),
        notebook_ref_pattern.test('@-foo'),
        notebook_ref_pattern.test('@Foo'),
        notebook_ref_pattern.test('@@foo'),
        notebook_ref_pattern.test('@foo/'),
        notebook_ref_pattern.test('foo'),
      ],
      [false, false, false, false, false, false, false, false],
    );
  });

  test('parse_notebook_ref returns the notebook slug for valid input', () => {
    assert.deepEqual(parse_notebook_ref('@todo-app'), { notebook: 'todo-app' });
  });

  test('parse_notebook_ref returns null for invalid input (including the old @nb/slug form)', () => {
    assert.deepEqual(
      [parse_notebook_ref('order-service'), parse_notebook_ref('@todo-app/order-service')],
      [null, null],
    );
  });

  test('is_valid_slug still rejects @-prefixed forms (notebook-local slugs are unqualified)', () => {
    assert.deepEqual(
      { local: is_valid_slug('order-service'), notebook: is_valid_slug('@todo-app') },
      { local: true, notebook: false },
    );
  });

  test('is_valid_ref_target accepts local slug and @notebook; rejects @nb/slug', () => {
    assert.deepEqual(
      {
        local: is_valid_ref_target('order-service'),
        notebook: is_valid_ref_target('@todo-app'),
        section_traversal: is_valid_ref_target('@todo-app/order-service'),
      },
      { local: true, notebook: true, section_traversal: false },
    );
  });
});
