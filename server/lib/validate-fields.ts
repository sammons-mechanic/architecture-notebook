import { make_failure, type Failure, type FieldError } from './failure.ts';
import { parse_notebook_ref, is_valid_ref_target } from './slug.ts';
import type { PropertyField } from './validate-schemas.ts';
import type { ValidateDeps } from './types.ts';

const type_mismatch = (field: PropertyField, expected: string, value: unknown): Failure => {
  const display = value === null ? 'null' : typeof value;
  return make_failure('validation', `Field ${field.key} must be ${expected}`, {
    errors: [
      {
        field: field.key,
        code: 'validation',
        message: `Expected ${expected}, got ${display}`,
      },
    ],
  });
};

const validate_ref_value = (
  field: PropertyField,
  value: string,
  deps: ValidateDeps
): FieldError | null => {
  if (!is_valid_ref_target(value)) {
    return {
      field: field.key,
      code: 'validation',
      message: `Ref ${JSON.stringify(value)} must be a local slug or @notebook`,
    };
  }
  const notebook = parse_notebook_ref(value);
  if (notebook) {
    if (!deps.resolve_notebook || !deps.resolve_notebook(notebook.notebook)) {
      return {
        field: field.key,
        code: 'ref-unresolved',
        message: `No notebook ${JSON.stringify(value)} exists`,
        hint: `/n/${notebook.notebook}/api`,
      };
    }
    // refType is a section type and only meaningful for local refs.
    // Notebook-unit refs skip the refType check by design (the contract
    // is "depend on this notebook as a unit"; the unit has no single type).
    return null;
  }
  if (!deps.resolve_section_slug(value)) {
    return {
      field: field.key,
      code: 'ref-unresolved',
      message: `No section with slug ${JSON.stringify(value)} exists`,
      hint: `/api/search?q=${encodeURIComponent(value)}`,
    };
  }
  if (field.refType) {
    const actual_type = deps.resolve_section_type_slug(value);
    if (actual_type !== field.refType) {
      return {
        field: field.key,
        code: 'validation',
        message: `Ref ${JSON.stringify(value)} must be of type ${field.refType}, got ${actual_type ?? 'unknown'}`,
      };
    }
  }
  return null;
};

export const validate_field = (
  field: PropertyField,
  value: unknown,
  deps: ValidateDeps
): unknown | Failure => {
  if (field.type === 'string' || field.type === 'rich') {
    if (typeof value !== 'string') {
      return type_mismatch(field, 'string', value);
    }
    return value;
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return type_mismatch(field, 'number', value);
    }
    return value;
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return type_mismatch(field, 'boolean', value);
    }
    return value;
  }
  if (field.type === 'enum') {
    if (typeof value !== 'string' || !field.enum?.includes(value)) {
      return make_failure('validation', `Field ${field.key} must be one of ${field.enum?.join(', ')}`, {
        errors: [
          {
            field: field.key,
            code: 'validation',
            message: `Expected one of [${field.enum?.join(', ')}], got ${JSON.stringify(value)}`,
          },
        ],
      });
    }
    return value;
  }
  if (field.type === 'multi-string') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      return type_mismatch(field, 'string[]', value);
    }
    return value;
  }
  if (field.type === 'ref') {
    if (typeof value !== 'string') {
      return type_mismatch(field, 'slug string', value);
    }
    const error = validate_ref_value(field, value, deps);
    return error ? make_failure('validation', error.message, { errors: [error] }) : value;
  }
  if (field.type === 'multi-ref') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      return type_mismatch(field, 'slug string[]', value);
    }
    const errors: FieldError[] = [];
    for (const entry of value as string[]) {
      const error = validate_ref_value(field, entry, deps);
      if (error) {
        errors.push(error);
      }
    }
    return errors.length === 0 ? value : make_failure('validation', 'Some refs failed validation', { errors });
  }
  return value;
};
