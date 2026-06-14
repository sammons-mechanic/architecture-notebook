import { make_failure, is_failure, type Failure, type FieldError } from './failure.ts';
import { validate_field } from './validate-fields.ts';
import { parse_notebook_ref } from './slug.ts';
import type { PropertyField, PropertySchema } from './validate-schemas.ts';
import type { ValidateDeps, ValidatedBody } from './types.ts';

export type ValidateMode = 'create' | 'patch';

export type UnresolvedRefEntry = {
  // Local entries carry slug. Notebook-unit cross-refs carry notebook
  // and no slug — the target is the notebook itself.
  readonly slug?: string;
  readonly source: 'property';
  readonly field: string;
  readonly notebook?: string;
};

export const validate_properties = (
  schema: PropertySchema,
  properties: Record<string, unknown>,
  deps: ValidateDeps,
  mode: ValidateMode
): { values: Record<string, unknown>; unresolved: UnresolvedRefEntry[] } | Failure => {
  const errors: FieldError[] = [];
  const unresolved: UnresolvedRefEntry[] = [];
  const values: Record<string, unknown> = {};
  const declared = new Set(schema.fields.map((field) => field.key));
  for (const field of schema.fields) {
    const present = Object.prototype.hasOwnProperty.call(properties, field.key);
    const raw = properties[field.key];
    if (mode === 'patch' && !present) {
      continue;
    }
    if (raw === null && mode === 'patch') {
      values[field.key] = null;
      continue;
    }
    if (raw === undefined || raw === null) {
      if (field.required) {
        errors.push({
          field: `properties.${field.key}`,
          code: 'validation',
          message: `Field ${field.key} is required`,
        });
      }
      continue;
    }
    const result = validate_field(field, raw, deps);
    if (is_failure(result)) {
      const inner_errors = result.errors ?? [];
      const ref_unresolved_only = inner_errors.length > 0 && inner_errors.every((entry) => entry.code === 'ref-unresolved');
      if (ref_unresolved_only && !field.required) {
        for (const slug of collect_ref_slugs(field, raw)) {
          const notebook = parse_notebook_ref(slug);
          if (notebook) {
            unresolved.push({
              notebook: notebook.notebook,
              source: 'property',
              field: field.key,
            });
          } else {
            unresolved.push({ slug, source: 'property', field: field.key });
          }
        }
        continue;
      }
      for (const inner of inner_errors) {
        errors.push({
          field: `properties.${inner.field}`,
          code: inner.code,
          message: inner.message,
          ...(inner.hint ? { hint: inner.hint } : {}),
        });
      }
      continue;
    }
    values[field.key] = result;
    void declared;
  }
  if (errors.length > 0) {
    return make_failure('validation', `${errors.length} field${errors.length === 1 ? '' : 's'} failed validation`, {
      errors,
    });
  }
  return { values, unresolved };
};

const collect_ref_slugs = (field: PropertyField, raw: unknown): string[] => {
  if (field.type === 'ref' && typeof raw === 'string') {
    return [raw];
  }
  if (field.type === 'multi-ref' && Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
};

export const validate_top_level = (
  body: Record<string, unknown>,
  allowed: ReadonlyArray<string>
): ValidatedBody | Failure => {
  const errors: FieldError[] = [];
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      errors.push({
        field: key,
        code: 'validation',
        message: `Unknown field ${JSON.stringify(key)}`,
      });
    }
  }
  if (errors.length > 0) {
    return make_failure('validation', `${errors.length} unknown field${errors.length === 1 ? '' : 's'}`, {
      errors,
    });
  }
  return body;
};

export const merge_properties = (
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete out[key];
    } else {
      out[key] = value;
    }
  }
  return out;
};
