import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolve_schema } from '../server/lib/validate-schemas.ts';
import { is_failure } from '../server/lib/failure.ts';
import type { ValidateDeps } from '../server/lib/types.ts';

const sample_schema = { fields: [{ key: 'engine', type: 'enum', enum: ['sqs'], required: true } as const] };

const deps: ValidateDeps = {
  root_doc: { name: 'x', schema_version: 1, notebook: { title: '', version: { major: 0, minor: 0 } }, _links: {} },
  resolve_section_slug: () => false,
  resolve_section_type_slug: () => null,
  resolve_type_schema: (slug) => (slug === 'queue' ? sample_schema : null),
};

describe('schema discovery modes', () => {
  test('mode 1 inline schema returns as-is', () => {
    const result = resolve_schema({ schema: sample_schema }, {}, deps);
    assert.deepEqual(result, sample_schema);
  });

  test('mode 2 static schema_ref resolves the target type schema', () => {
    const result = resolve_schema({ schema_ref: `/api/types/queue#/property_schema` }, {}, deps);
    assert.deepEqual(result, sample_schema);
  });

  test('mode 4 templated schema_ref resolves against request body', () => {
    const result = resolve_schema({ schema_ref: `/api/types/{type}#/property_schema` }, { type: 'queue' }, deps);
    assert.deepEqual(result, sample_schema);
  });

  test('mode 4 with missing body key returns validation failure pointing at the key', () => {
    const result = resolve_schema({ schema_ref: `/api/types/{type}#/property_schema` }, {}, deps);
    assert.deepEqual(
      { failed: is_failure(result), field: is_failure(result) ? result.errors?.[0].field : null },
      { failed: true, field: 'type' },
    );
  });

  test('mode 2 with unknown type returns ref-unresolved hint /api/types', () => {
    const result = resolve_schema({ schema_ref: `/api/types/nope#/property_schema` }, {}, deps);
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.errors?.[0].code : null, hint: is_failure(result) ? result.errors?.[0].hint : null },
      { failed: true, code: 'ref-unresolved', hint: `/api/types` },
    );
  });
});
