import { make_failure, type Failure } from './failure.ts';
import type { ValidateDeps } from './types.ts';

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'ref'
  | 'multi-ref'
  | 'rich'
  | 'multi-string'
  | 'schema-driven';

export type PropertyField = {
  readonly key: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly enum?: ReadonlyArray<string>;
  readonly refType?: string;
  readonly placeholder?: string;
  readonly schema_ref?: string;
};

export type PropertySchema = {
  readonly fields: ReadonlyArray<PropertyField>;
};

export type ActionDescriptor = {
  readonly schema?: PropertySchema;
  readonly schema_ref?: string;
};

const interpolate_template = (
  template: string,
  body: Record<string, unknown>
): string | Failure => {
  const missing: string[] = [];
  const out = template.replace(/\{([a-z_][a-z0-9_]*)\}/g, (_match, key) => {
    const value = body[key];
    if (typeof value !== 'string') {
      missing.push(key);
      return '';
    }
    return value;
  });
  if (missing.length > 0) {
    return make_failure('validation', 'Missing required field for schema reference', {
      errors: missing.map((key) => ({
        field: key,
        code: 'validation',
        message: `Field ${JSON.stringify(key)} is required to resolve schema_ref`,
      })),
    });
  }
  return out;
};

const fetch_type_schema = (
  ref: string,
  deps: ValidateDeps
): PropertySchema | Failure => {
  const match = ref.match(/^\/api\/types\/([a-z0-9-]+)#\/property_schema$/);
  if (!match) {
    return make_failure('validation', `Unsupported schema_ref ${JSON.stringify(ref)}`);
  }
  const type_slug = match[1];
  const schema = deps.resolve_type_schema(type_slug);
  if (!schema) {
    return make_failure('validation', `Type ${JSON.stringify(type_slug)} not found`, {
      errors: [
        {
          field: 'type',
          code: 'ref-unresolved',
          message: `No type with slug ${JSON.stringify(type_slug)} exists`,
          hint: '/api/types',
        },
      ],
    });
  }
  return schema;
};

export const resolve_schema = (
  action: ActionDescriptor,
  body: Record<string, unknown>,
  deps: ValidateDeps
): PropertySchema | Failure => {
  if (action.schema && !action.schema_ref) {
    return action.schema;
  }
  if (action.schema_ref && !action.schema) {
    if (action.schema_ref.startsWith('$.')) {
      return make_failure('validation', 'Sibling schema_ref must be resolved by caller');
    }
    const target = action.schema_ref.includes('{')
      ? interpolate_template(action.schema_ref, body)
      : action.schema_ref;
    if (typeof target !== 'string') {
      return target;
    }
    return fetch_type_schema(target, deps);
  }
  return make_failure('validation', 'Action must declare exactly one of schema or schema_ref');
};
