import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validate_properties, validate_top_level, merge_properties } from '../server/lib/validate.ts';
import { is_failure } from '../server/lib/failure.ts';
import type { ValidateDeps } from '../server/lib/types.ts';
import type { PropertySchema } from '../server/lib/validate-schemas.ts';

const make_deps = (overrides: Partial<ValidateDeps> = {}): ValidateDeps => ({
  root_doc: { name: 'x', schema_version: 1, notebook: { title: '', version: { major: 0, minor: 0 } }, _links: {} },
  resolve_section_slug: () => true,
  resolve_section_type_slug: () => null,
  resolve_type_schema: () => null,
  ...overrides,
});

describe('validate_properties', () => {
  test('coerces a basic string field', () => {
    const schema: PropertySchema = { fields: [{ key: 'name', type: 'string', required: true }] };
    const result = validate_properties(schema, { name: 'hello' }, make_deps(), 'create');
    assert.deepEqual(result, { values: { name: 'hello' }, unresolved: [] });
  });

  test('rejects a missing required field on create', () => {
    const schema: PropertySchema = { fields: [{ key: 'name', type: 'string', required: true }] };
    const result = validate_properties(schema, {}, make_deps(), 'create');
    assert.deepEqual(
      { failed: is_failure(result), error_count: is_failure(result) ? result.errors?.length ?? 0 : 0 },
      { failed: true, error_count: 1 },
    );
  });

  test('strips unknown keys silently', () => {
    const schema: PropertySchema = { fields: [{ key: 'name', type: 'string' }] };
    const result = validate_properties(schema, { name: 'hi', other: 'x' }, make_deps(), 'create');
    assert.deepEqual(result, { values: { name: 'hi' }, unresolved: [] });
  });

  test('validates enum values', () => {
    const schema: PropertySchema = { fields: [{ key: 'mode', type: 'enum', enum: ['a', 'b'] }] };
    const result = validate_properties(schema, { mode: 'a' }, make_deps(), 'create');
    assert.deepEqual(result, { values: { mode: 'a' }, unresolved: [] });
  });

  test('rejects enum value not in list', () => {
    const schema: PropertySchema = { fields: [{ key: 'mode', type: 'enum', enum: ['a', 'b'] }] };
    const result = validate_properties(schema, { mode: 'c' }, make_deps(), 'create');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.errors?.[0].code : null },
      { failed: true, code: 'validation' },
    );
  });

  test('validates required ref against resolver', () => {
    const schema: PropertySchema = { fields: [{ key: 'parent', type: 'ref', required: true }] };
    const deps = make_deps({ resolve_section_slug: () => false });
    const result = validate_properties(schema, { parent: 'missing' }, deps, 'create');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.errors?.[0].code : null },
      { failed: true, code: 'ref-unresolved' },
    );
  });

  test('optional unresolved ref surfaces as unresolved entry', () => {
    const schema: PropertySchema = { fields: [{ key: 'sister', type: 'ref' }] };
    const deps = make_deps({ resolve_section_slug: () => false });
    const result = validate_properties(schema, { sister: 'nope' }, deps, 'create');
    if (is_failure(result)) {
      throw new Error('expected success');
    }
    assert.deepEqual(result, { values: {}, unresolved: [{ slug: 'nope', source: 'property', field: 'sister' }] });
  });

  test('enforces refType when present', () => {
    const schema: PropertySchema = { fields: [{ key: 'domain', type: 'ref', refType: 'domain' }] };
    const deps = make_deps({ resolve_section_slug: () => true, resolve_section_type_slug: () => 'service' });
    const result = validate_properties(schema, { domain: 'thing' }, deps, 'create');
    assert.deepEqual(
      { failed: is_failure(result) },
      { failed: true },
    );
  });

  test('coerces number field', () => {
    const schema: PropertySchema = { fields: [{ key: 'count', type: 'number' }] };
    const result = validate_properties(schema, { count: 42 }, make_deps(), 'create');
    assert.deepEqual(result, { values: { count: 42 }, unresolved: [] });
  });

  test('rejects non-number for number field', () => {
    const schema: PropertySchema = { fields: [{ key: 'count', type: 'number' }] };
    const result = validate_properties(schema, { count: 'oops' }, make_deps(), 'create');
    assert.deepEqual({ failed: is_failure(result) }, { failed: true });
  });

  test('patch mode skips absent fields', () => {
    const schema: PropertySchema = { fields: [{ key: 'name', type: 'string', required: true }] };
    const result = validate_properties(schema, {}, make_deps(), 'patch');
    assert.deepEqual(result, { values: {}, unresolved: [] });
  });

  test('patch mode treats explicit null as delete', () => {
    const schema: PropertySchema = { fields: [{ key: 'name', type: 'string' }] };
    const result = validate_properties(schema, { name: null }, make_deps(), 'patch');
    assert.deepEqual(result, { values: { name: null }, unresolved: [] });
  });

  test('merge_properties shallow-merges and deletes nulls', () => {
    const merged = merge_properties({ a: 1, b: 2 }, { a: null, c: 3 });
    assert.deepEqual(merged, { b: 2, c: 3 });
  });

  test('validate_top_level rejects unknown top-level fields', () => {
    const result = validate_top_level({ allowed: 1, unknown: 'x' } as Record<string, unknown>, ['allowed']);
    assert.deepEqual(
      { failed: is_failure(result), field: is_failure(result) ? result.errors?.[0].field : null },
      { failed: true, field: 'unknown' },
    );
  });
});
