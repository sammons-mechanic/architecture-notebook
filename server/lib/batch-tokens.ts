import { make_failure, type Failure } from './failure.ts';
import type { OpResults } from './types.ts';

const token_pattern = /^\$([a-z0-9_-]+)\.(slug|id)$/;

export const token_dependencies = (body: unknown): Set<string> => {
  const deps = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      const match = value.match(token_pattern);
      if (match) {
        deps.add(match[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry);
      }
      return;
    }
    if (value && typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        walk(entry);
      }
    }
  };
  walk(body);
  return deps;
};

export const substitute_tokens = (
  body: unknown,
  results: OpResults
): unknown | Failure => {
  const walk = (value: unknown): unknown | Failure => {
    if (typeof value === 'string') {
      const match = value.match(token_pattern);
      if (!match) {
        return value;
      }
      const producer = results.get(match[1]);
      if (!producer) {
        return make_failure('backref-unresolved', `Producer op ${JSON.stringify(match[1])} did not run`);
      }
      const attr = match[2] as 'slug' | 'id';
      const exposed = producer[attr];
      if (exposed === undefined) {
        return make_failure('backref-unresolved', `Producer op ${JSON.stringify(match[1])} does not expose ${attr}`);
      }
      return exposed;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const entry of value) {
        const next_entry = walk(entry);
        if (is_failure_value(next_entry)) {
          return next_entry;
        }
        out.push(next_entry);
      }
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        const next_inner = walk(inner);
        if (is_failure_value(next_inner)) {
          return next_inner;
        }
        out[key] = next_inner;
      }
      return out;
    }
    return value;
  };
  return walk(body);
};

const is_failure_value = (value: unknown): value is Failure =>
  typeof value === 'object'
  && value !== null
  && (value as Failure).error === true;
