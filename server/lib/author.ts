import type { IncomingHttpHeaders } from 'node:http';
import { make_failure, type Failure } from './failure.ts';

export const AUTHOR_MAX_BYTES = 128;
export const MESSAGE_MAX_BYTES = 256;
export const AUTHOR_HEADER = 'arch-author';

export const read_author = (headers: IncomingHttpHeaders): string | Failure | null => {
  const raw = headers[AUTHOR_HEADER];
  if (raw === undefined) return null;
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (Buffer.byteLength(trimmed, 'utf8') > AUTHOR_MAX_BYTES) {
    return make_failure('header-invalid', `Arch-Author header exceeds ${AUTHOR_MAX_BYTES} bytes`, {
      errors: [{ field: 'Arch-Author', code: 'header-invalid', message: `must be ≤ ${AUTHOR_MAX_BYTES} bytes` }],
    });
  }
  return trimmed;
};

export const validate_revision_message = (value: unknown): string | Failure | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    return make_failure('validation', 'revision_message must be a string', {
      errors: [{ field: 'revision_message', code: 'validation', message: 'must be a string' }],
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (Buffer.byteLength(trimmed, 'utf8') > MESSAGE_MAX_BYTES) {
    return make_failure('validation', `revision_message exceeds ${MESSAGE_MAX_BYTES} bytes`, {
      errors: [{ field: 'revision_message', code: 'validation', message: `must be ≤ ${MESSAGE_MAX_BYTES} bytes` }],
    });
  }
  return trimmed;
};
