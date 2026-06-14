import type { HalLink, ProblemJson } from './types.ts';

export const ROOT_HREF = '/api';

export const expand_template = (template: string, vars: Readonly<Record<string, string>>) => {
  return template.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
    const operator = expr.startsWith('?') || expr.startsWith('&') ? expr[0] : '';
    const names = (operator ? expr.slice(1) : expr).split(',');
    const pairs: string[] = [];
    for (const name of names) {
      const value = vars[name];
      if (value === undefined || value === null) {
        continue;
      }
      pairs.push(operator ? `${name}=${encodeURIComponent(value)}` : encodeURIComponent(value));
    }
    if (!operator) {
      return pairs.join(',');
    }
    if (pairs.length === 0) {
      return '';
    }
    return operator + pairs.join('&');
  });
};

export const resolve_link = (link: HalLink, vars: Readonly<Record<string, string>> = {}) => {
  return link.templated ? expand_template(link.href, vars) : link.href;
};

export type HalResponse<T> = { readonly ok: true; readonly status: number; readonly etag: string | null; readonly body: T } | { readonly ok: false; readonly status: number; readonly problem: ProblemJson };

const DEFAULT_AUTHOR = 'human';

export const hal_fetch = async <T>(link: HalLink, options: {
  readonly vars?: Readonly<Record<string, string>>;
  readonly method?: string;
  readonly body?: unknown;
  readonly if_match?: string;
  readonly idempotency_key?: string;
  readonly author?: string;
} = {}): Promise<HalResponse<T>> => {
  const url = resolve_link(link, options.vars ?? {});
  const headers: Record<string, string> = { Accept: 'application/hal+json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.if_match) {
    headers['If-Match'] = options.if_match;
  }
  if (options.idempotency_key) {
    headers['Idempotency-Key'] = options.idempotency_key;
  }
  const method = options.method ?? 'GET';
  const mutating = method !== 'GET';
  if (mutating) {
    headers['Arch-Author'] = options.author ?? DEFAULT_AUTHOR;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const parsed = text.length === 0 ? null : JSON.parse(text);
  if (!response.ok) {
    const problem = parsed as ProblemJson;
    return { ok: false, status: response.status, problem };
  }
  return { ok: true, status: response.status, etag: response.headers.get('ETag'), body: parsed as T };
};
