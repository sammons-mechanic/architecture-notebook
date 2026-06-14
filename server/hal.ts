import { randomBytes } from 'node:crypto';

export const fresh_etag = (): string => randomBytes(8).toString('hex');

export const etag_of = (row: { etag: string }): string => `W/"${row.etag}"`;

export type IfMatchResult =
  | { kind: 'ok' }
  | { kind: 'missing' }
  | { kind: 'mismatch'; current_etag: string };

export const check_if_match = (
  header_value: string | undefined,
  current_etag: string
): IfMatchResult => {
  if (!header_value) {
    return { kind: 'missing' };
  }
  const normalized_current = `W/"${current_etag}"`;
  if (header_value === normalized_current || header_value === `"${current_etag}"`) {
    return { kind: 'ok' };
  }
  return { kind: 'mismatch', current_etag };
};

type AcceptEntry = { type: string; q: number };

const parse_accept = (header: string): AcceptEntry[] => {
  return header
    .split(',')
    .map((entry) => {
      const [type, ...params] = entry.trim().split(';');
      let q = 1;
      for (const param of params) {
        const [name, value] = param.trim().split('=');
        if (name === 'q') {
          q = Number(value);
        }
      }
      return { type: type.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.type.length > 0);
};

const matches = (entry: string, target: string): boolean => {
  if (entry === target || entry === '*/*') {
    return true;
  }
  const [main] = target.split('/');
  return entry === `${main}/*`;
};

export type NegotiationResult =
  | { kind: 'hal' }
  | { kind: 'json' }
  | { kind: 'unacceptable' };

export const negotiate_accept = (header: string | undefined): NegotiationResult => {
  if (!header || header.trim().length === 0) {
    return { kind: 'hal' };
  }
  const entries = parse_accept(header);
  let hal_q = -1;
  let json_q = -1;
  let problem_q = -1;
  for (const entry of entries) {
    if (matches(entry.type, 'application/hal+json') && entry.q > hal_q) {
      hal_q = entry.q;
    }
    if (matches(entry.type, 'application/json') && entry.q > json_q) {
      json_q = entry.q;
    }
    if (matches(entry.type, 'application/problem+json') && entry.q > problem_q) {
      problem_q = entry.q;
    }
  }
  if (hal_q < 0 && json_q < 0 && problem_q < 0) {
    return { kind: 'unacceptable' };
  }
  if (json_q > hal_q) {
    return { kind: 'json' };
  }
  return { kind: 'hal' };
};

export const strip_hypermedia = (body: unknown): unknown => {
  if (Array.isArray(body)) {
    return body.map((entry) => strip_hypermedia(entry));
  }
  if (body && typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === '_links' || key === '_actions' || key === '_embedded') {
        continue;
      }
      out[key] = strip_hypermedia(value);
    }
    return out;
  }
  return body;
};
