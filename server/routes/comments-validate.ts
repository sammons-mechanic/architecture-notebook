import { make_failure, type Failure } from '../lib/failure.ts';

export const BODY_MAX_BYTES = 4096;

export const validate_body_field = (value: unknown, required: boolean): string | Failure | undefined => {
  if (value === undefined) {
    if (required) {
      return make_failure('validation', 'body is required', {
        errors: [{ field: 'body', code: 'validation', message: 'body is required' }],
      });
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    return make_failure('validation', 'body must be a string', {
      errors: [{ field: 'body', code: 'validation', message: 'must be a string' }],
    });
  }
  if (value.trim().length === 0) {
    return make_failure('validation', 'body must not be empty', {
      errors: [{ field: 'body', code: 'validation', message: 'must not be empty' }],
    });
  }
  if (Buffer.byteLength(value, 'utf8') > BODY_MAX_BYTES) {
    return make_failure('validation', `body exceeds ${BODY_MAX_BYTES} bytes`, {
      errors: [{ field: 'body', code: 'validation', message: `must be ≤ ${BODY_MAX_BYTES} bytes` }],
    });
  }
  return value;
};

const anchor_pattern = /^section$|^p-\d+$/;

export const is_valid_anchor = (value: string): boolean => anchor_pattern.test(value);

export const validate_anchor_field = (value: unknown): string | Failure => {
  if (value === undefined || value === null) return 'section';
  if (typeof value === 'string' && is_valid_anchor(value)) return value;
  return make_failure('validation', 'anchor must be "section" or "p-N"', {
    errors: [{ field: 'anchor', code: 'anchor-unsupported', message: 'anchor must be "section" or match ^p-\\d+$', hint: '/api/sections' }],
  });
};

export const validate_resolved_field = (value: unknown): boolean | Failure | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    return make_failure('validation', 'resolved must be boolean', {
      errors: [{ field: 'resolved', code: 'validation', message: 'must be a boolean' }],
    });
  }
  return value;
};
