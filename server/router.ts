import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteParams = Record<string, string>;

export type RouteContext = {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly params: RouteParams;
  readonly body: unknown;
  readonly raw_body: string;
};

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

export type RouteDef = {
  readonly method: string;
  readonly pattern: string;
  readonly handler: RouteHandler;
};

export type MatchResult =
  | { kind: 'match'; route: RouteDef; params: RouteParams }
  | { kind: 'method-not-allowed'; allowed: string[] }
  | { kind: 'not-found' };

const compile_pattern = (pattern: string): { regex: RegExp; keys: string[] } => {
  const keys: string[] = [];
  const regex_source = pattern.split('/').map((segment) => {
    if (segment.startsWith(':')) {
      keys.push(segment.slice(1));
      return '([^/]+)';
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { regex: new RegExp(`^${regex_source}$`), keys };
};

export type Router = {
  readonly add: (method: string, pattern: string, handler: RouteHandler) => void;
  readonly match: (method: string, pathname: string) => MatchResult;
};

export const create_router = (): Router => {
  const compiled: Array<{ method: string; pattern: string; regex: RegExp; keys: string[]; handler: RouteHandler }> = [];
  return Object.freeze({
    add: (method, pattern, handler) => {
      const { regex, keys } = compile_pattern(pattern);
      compiled.push({ method: method.toUpperCase(), pattern, regex, keys, handler });
    },
    match: (method, pathname) => {
      const upper = method.toUpperCase();
      const allowed = new Set<string>();
      for (const entry of compiled) {
        const match = entry.regex.exec(pathname);
        if (match) {
          allowed.add(entry.method);
          if (entry.method === upper) {
            const params: RouteParams = {};
            entry.keys.forEach((key, index) => {
              params[key] = decodeURIComponent(match[index + 1]);
            });
            return { kind: 'match', route: { method: entry.method, pattern: entry.pattern, handler: entry.handler }, params };
          }
        }
      }
      if (allowed.size > 0) {
        return { kind: 'method-not-allowed', allowed: [...allowed].sort() };
      }
      return { kind: 'not-found' };
    },
  });
};
