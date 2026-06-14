import type { FieldError } from './lib/failure.ts';

export type ProblemBody = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance: string;
  readonly hint?: string;
  readonly errors?: ReadonlyArray<FieldError>;
  readonly [extra: string]: unknown;
};

const code_titles: Record<string, string> = {
  validation: 'Validation failed',
  'etag-mismatch': 'ETag mismatch',
  'precondition-required': 'Precondition required',
  'idempotency-conflict': 'Idempotency conflict',
  'idempotency-misplaced': 'Idempotency-Key misplaced',
  'ref-unresolved': 'Reference unresolved',
  'ref-derived': 'Reference is derived',
  'slug-conflict': 'Slug conflict',
  'slug-invalid': 'Slug invalid',
  'arch-ref-malformed': 'arch-ref malformed',
  'type-in-use': 'Type in use',
  'cycle-illegal': 'Cycle illegal',
  'backref-unresolved': 'Back-reference unresolved',
  'dependency-aborted': 'Dependency aborted',
  'payload-too-large': 'Payload too large',
  'method-not-allowed': 'Method not allowed',
  'not-acceptable': 'Not acceptable',
  'not-found': 'Not found',
  internal: 'Internal server error',
};

export const build_problem = (
  code: string,
  status: number,
  detail: string,
  instance: string,
  extras?: { hint?: string; errors?: ReadonlyArray<FieldError>; [key: string]: unknown }
): ProblemBody => {
  const body: Record<string, unknown> = {
    type: `/errors/${code}`,
    title: code_titles[code] ?? code,
    status,
    detail,
    instance,
  };
  if (extras?.hint) {
    body.hint = extras.hint;
  }
  if (extras?.errors && extras.errors.length > 0) {
    body.errors = extras.errors;
  }
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (key !== 'hint' && key !== 'errors' && value !== undefined) {
        body[key] = value;
      }
    }
  }
  return body as ProblemBody;
};
