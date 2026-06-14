export type FieldError = {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly hint?: string;
};

export type Failure = {
  readonly error: true;
  readonly code: string;
  readonly message: string;
  readonly errors?: ReadonlyArray<FieldError>;
  readonly hint?: string;
};

export const is_failure = (value: unknown): value is Failure => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Failure;
  return candidate.error === true
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string';
};

export const make_failure = (
  code: string,
  message: string,
  extras?: { errors?: ReadonlyArray<FieldError>; hint?: string }
): Failure => ({
  error: true,
  code,
  message,
  ...(extras?.errors ? { errors: extras.errors } : {}),
  ...(extras?.hint ? { hint: extras.hint } : {}),
});
