import type { IncomingMessage, ServerResponse } from 'node:http';
import { negotiate_accept } from './hal.ts';
import { send_problem } from './response.ts';
import type { Router, RouteContext } from './router.ts';
import { spa_route } from './routes/spa.ts';
import type { IdempotencyStore } from './idempotency.ts';
import { create_logger, type Logger } from './lib/log.ts';
import type { NotebookManager } from './notebook-manager.ts';
import { rewrite_paths_in_json, rewrite_location } from './rewrite-prefix.ts';
import { mcp_sse_handler, mcp_message_handler, type McpDeps } from './routes/mcp.ts';

const BATCH_TAIL = '/api/batch';
const default_cap = 1024 * 1024;
const batch_cap = 8 * 1024 * 1024;
const N_PREFIX_RE = /^\/n\/([a-z0-9-]+)(\/.*)?$/;

const read_body = async (req: IncomingMessage, cap: number): Promise<{ kind: 'ok'; text: string } | { kind: 'too-large' }> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > cap) return { kind: 'too-large' };
    chunks.push(buffer);
  }
  return { kind: 'ok', text: Buffer.concat(chunks).toString('utf8') };
};

const replay_cached = (res: ServerResponse, cached: { status: number; headers: Record<string, string>; body: string }): void => {
  res.writeHead(cached.status, cached.headers);
  res.end(cached.body);
};

const install_prefix_rewriter = (res: ServerResponse, prefix: string) => {
  const original_write_head = res.writeHead.bind(res);
  const original_end = res.end.bind(res);
  const chunks: Buffer[] = [];
  res.writeHead = ((status_code: number, headers?: any) => {
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      if (typeof (headers as Record<string, string>).Location === 'string') {
        (headers as Record<string, string>).Location = rewrite_location((headers as Record<string, string>).Location, prefix) ?? '';
      }
    } else {
      const current = res.getHeader('Location');
      if (typeof current === 'string') {
        res.setHeader('Location', rewrite_location(current, prefix) ?? '');
      }
    }
    return original_write_head(status_code, headers);
  }) as typeof res.writeHead;
  res.end = ((data?: any, encoding?: any) => {
    if (data) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : '', encoding);
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const rewritten = rewrite_paths_in_json(body, prefix);
    return original_end(rewritten === '' ? undefined : rewritten, encoding);
  }) as typeof res.end;
};

const install_idempotency_capture = (
  res: ServerResponse,
  idempotency_store: IdempotencyStore,
  key: string,
  body_hash: string,
) => {
  const original_write_head = res.writeHead.bind(res);
  const original_end = res.end.bind(res);
  const chunks: Buffer[] = [];
  let status = 200;
  let captured_headers: Record<string, string> = {};
  res.writeHead = ((status_code: number, headers?: any) => {
    status = status_code;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      captured_headers = { ...headers } as Record<string, string>;
    }
    return original_write_head(status_code, headers);
  }) as typeof res.writeHead;
  res.end = ((data?: any, encoding?: any) => {
    if (data) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : '', encoding);
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const headers_to_persist: Record<string, string> = {};
    for (const name of ['ETag', 'Location', 'Content-Type']) {
      const value = captured_headers[name] ?? res.getHeader(name);
      if (typeof value === 'string') headers_to_persist[name] = value;
    }
    idempotency_store.record(key, body_hash, { status, headers: status === 204 ? {} : headers_to_persist, body: status === 204 ? '' : body });
    return original_end(data, encoding);
  }) as typeof res.end;
};

export type ServerContext = {
  readonly catalog_router: Router;
  readonly catalog_idempotency: IdempotencyStore;
  readonly manager: NotebookManager;
  readonly logger: Logger;
  readonly mcp: McpDeps;
};

const route_for = (pathname: string, server: ServerContext): { router: Router; inner_path: string; idempotency: IdempotencyStore; prefix: string } | { kind: 'unknown-notebook'; slug: string } => {
  const m = N_PREFIX_RE.exec(pathname);
  if (!m) return { router: server.catalog_router, inner_path: pathname, idempotency: server.catalog_idempotency, prefix: '' };
  const slug = m[1];
  const inner_path = m[2] ?? '/';
  const entry = server.manager.get(slug);
  if (!entry) return { kind: 'unknown-notebook', slug };
  return { router: entry.router, inner_path, idempotency: entry.idempotency, prefix: `/n/${slug}` };
};

export const handle_request = async (req: IncomingMessage, res: ServerResponse, server: ServerContext): Promise<void> => {
  const start = Date.now();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

  // MCP transport (SSE) bypasses HAL Accept negotiation, body rewriting, and
  // idempotency capture. SSE responses stream over an open connection — the
  // HAL pipeline would buffer + rewrite them and corrupt the stream.
  if (url.pathname === '/mcp/sse' && (req.method ?? 'GET') === 'GET') {
    mcp_sse_handler(req, res);
    server.logger.access(req.method ?? '?', url.pathname, 200, Date.now() - start);
    return;
  }
  if (url.pathname === '/mcp/message' && (req.method ?? 'POST') === 'POST') {
    const body_result = await read_body(req, default_cap);
    if (body_result.kind === 'too-large') {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload too large' }));
      server.logger.access(req.method ?? '?', url.pathname, 413, Date.now() - start);
      return;
    }
    let parsed: unknown = null;
    if (body_result.text.length > 0) {
      try { parsed = JSON.parse(body_result.text); }
      catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'body must be valid JSON' }));
        server.logger.access(req.method ?? '?', url.pathname, 400, Date.now() - start);
        return;
      }
    }
    await mcp_message_handler(server.mcp)(req, res, url, parsed);
    server.logger.access(req.method ?? '?', url.pathname, res.statusCode, Date.now() - start);
    return;
  }

  // The /skill and /llms.txt discovery endpoints serve their own media types
  // (text/markdown, text/plain) and do their own negotiation, so they are exempt
  // from the API-wide hal/json Accept gate — a client following a link hint must
  // not be turned away with a 406. `/` is also exempt: a browser's text/html (or
  // an agent's json/hal) is handled by root_or_spa, not this gate.
  const accept_result = negotiate_accept(req.headers.accept);
  const accept_exempt = url.pathname === '/skill' || url.pathname === '/llms.txt' || url.pathname === '/';
  if (accept_result.kind === 'unacceptable' && !accept_exempt) {
    send_problem(res, 406, 'not-acceptable', 'Accept header cannot be satisfied', req.url ?? '');
    server.logger.access(req.method ?? '?', url.pathname, 406, Date.now() - start);
    return;
  }
  const routed = route_for(url.pathname, server);
  if ('kind' in routed) {
    send_problem(res, 404, 'not-found', `No notebook ${routed.slug}`, req.url ?? '');
    server.logger.access(req.method ?? '?', url.pathname, 404, Date.now() - start);
    return;
  }
  const match = routed.router.match(req.method ?? 'GET', routed.inner_path);
  if (match.kind === 'not-found') {
    spa_route()({ req, res, url, params: {}, body: null, raw_body: '' });
    server.logger.access(req.method ?? '?', url.pathname, res.statusCode, Date.now() - start);
    return;
  }
  if (match.kind === 'method-not-allowed') {
    send_problem(res, 405, 'method-not-allowed', 'Method not allowed', req.url ?? '', { headers: { Allow: match.allowed.join(', ') } });
    server.logger.access(req.method ?? '?', url.pathname, 405, Date.now() - start);
    return;
  }
  await run_route(req, res, url, match.params, match.route.handler, routed.idempotency, server.logger, routed.inner_path, routed.prefix, start);
};

const run_route = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  params: Record<string, string>,
  handler: (ctx: RouteContext) => void | Promise<void>,
  idempotency: IdempotencyStore,
  logger: Logger,
  inner_path: string,
  prefix: string,
  start: number,
): Promise<void> => {
  const cap = inner_path === BATCH_TAIL ? batch_cap : default_cap;
  const method = (req.method ?? 'GET').toUpperCase();
  const has_body = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  let raw_body = '';
  let parsed_body: unknown = null;
  if (has_body) {
    const result = await read_body(req, cap);
    if (result.kind === 'too-large') {
      send_problem(res, 413, 'payload-too-large', `Body exceeds ${cap} bytes`, req.url ?? '');
      logger.access(method, url.pathname, 413, Date.now() - start);
      return;
    }
    raw_body = result.text;
    if (raw_body.length > 0) {
      try { parsed_body = JSON.parse(raw_body); }
      catch (_error) {
        send_problem(res, 422, 'validation', 'Body must be valid JSON', req.url ?? '');
        logger.access(method, url.pathname, 422, Date.now() - start);
        return;
      }
    }
  }
  const idem_key = req.headers['idempotency-key'];
  if (typeof idem_key === 'string') {
    if (method === 'GET') {
      send_problem(res, 400, 'idempotency-misplaced', 'Idempotency-Key not allowed on GET', req.url ?? '');
      logger.access(method, url.pathname, 400, Date.now() - start);
      return;
    }
    const body_hash = idempotency.hash_body(parsed_body);
    const cached = idempotency.lookup(idem_key, body_hash);
    if (cached === 'conflict') {
      send_problem(res, 409, 'idempotency-conflict', 'Idempotency-Key reused with different body', req.url ?? '');
      logger.access(method, url.pathname, 409, Date.now() - start);
      return;
    }
    if (cached) {
      replay_cached(res, cached);
      logger.access(method, url.pathname, cached.status, Date.now() - start);
      return;
    }
    install_idempotency_capture(res, idempotency, idem_key, body_hash);
  }
  if (prefix !== '') install_prefix_rewriter(res, prefix);
  await handler({ req, res, url, params, body: parsed_body, raw_body });
  logger.access(method, url.pathname, res.statusCode, Date.now() - start);
};

export { create_logger };
