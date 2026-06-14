import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { read_author, validate_revision_message, AUTHOR_MAX_BYTES, MESSAGE_MAX_BYTES } from '../server/lib/author.ts';
import { is_failure } from '../server/lib/failure.ts';

describe('author header', () => {
  test('absent header returns null', () => {
    assert.deepEqual(read_author({}), null);
  });

  test('empty / whitespace header returns null', () => {
    assert.deepEqual({ a: read_author({ 'arch-author': '' }), b: read_author({ 'arch-author': '   ' }) }, { a: null, b: null });
  });

  test('valid header is trimmed and returned', () => {
    assert.deepEqual(read_author({ 'arch-author': '  claude  ' }), 'claude');
  });

  test('header exceeding 128 bytes returns a failure', () => {
    const long = 'x'.repeat(AUTHOR_MAX_BYTES + 1);
    const result = read_author({ 'arch-author': long });
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null, field: is_failure(result) ? result.errors?.[0].field : null },
      { failed: true, code: 'header-invalid', field: 'Arch-Author' },
    );
  });

  test('revision_message absent returns null', () => {
    assert.deepEqual(validate_revision_message(undefined), null);
  });

  test('revision_message exceeding 256 bytes returns a failure', () => {
    const long = 'x'.repeat(MESSAGE_MAX_BYTES + 1);
    const result = validate_revision_message(long);
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'validation' },
    );
  });

  test('revision_message non-string returns a failure', () => {
    const result = validate_revision_message(42);
    assert.deepEqual({ failed: is_failure(result) }, { failed: true });
  });
});
