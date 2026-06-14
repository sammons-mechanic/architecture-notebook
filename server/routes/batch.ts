import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { execute_batch } from '../batch-exec.ts';
import type { BatchOp } from '../lib/batch-deps.ts';
import { build_problem } from '../problem.ts';
import { read_author } from '../lib/author.ts';
import { is_failure } from '../lib/failure.ts';

const validate_ops = (ops: unknown): { ok: true; ops: BatchOp[] } | { ok: false; reason: string; field?: string } => {
  if (!Array.isArray(ops)) {
    return { ok: false, reason: 'ops must be an array' };
  }
  const seen_ids = new Set<string>();
  const out: BatchOp[] = [];
  for (const raw of ops) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'each op must be an object' };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id !== 'string' || obj.id.length === 0) {
      return { ok: false, reason: 'op id is required' };
    }
    if (seen_ids.has(obj.id)) {
      return { ok: false, reason: `duplicate op id ${obj.id}` };
    }
    seen_ids.add(obj.id);
    if (typeof obj.method !== 'string' || typeof obj.href !== 'string') {
      return { ok: false, reason: 'op method and href are required' };
    }
    if (obj.idempotency_key !== undefined || obj['Idempotency-Key'] !== undefined) {
      return { ok: false, reason: 'per-op Idempotency-Key not allowed', field: obj.id };
    }
    out.push({
      id: obj.id,
      method: obj.method,
      href: obj.href,
      body: obj.body,
      ...(typeof obj.if_match === 'string' ? { if_match: obj.if_match } : {}),
    });
  }
  return { ok: true, ops: out };
};

export const batch_route = (deps: Deps) => (ctx: RouteContext): void => {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const atomic = body.atomic !== false;
  const validated = validate_ops(body.ops);
  if (!validated.ok) {
    send_problem(ctx.res, 422, 'validation', validated.reason, ctx.req.url ?? '', { errors: [{ field: validated.field ?? 'ops', code: 'validation', message: validated.reason }] });
    return;
  }
  const author = read_author(ctx.req.headers);
  if (is_failure(author)) {
    send_problem(ctx.res, 422, author.code, author.message, ctx.req.url ?? '', { errors: author.errors });
    return;
  }
  const envelope = execute_batch({ ...deps, req_path: ctx.req.url ?? '/' }, validated.ops, atomic, { author });
  if (envelope.status !== 200) {
    ctx.res.writeHead(envelope.status, { 'Content-Type': 'application/problem+json' });
    ctx.res.end(JSON.stringify(envelope.body));
    return;
  }
  send_response(ctx.res, { status: 200, body: envelope.body }, negotiate_accept(ctx.req.headers.accept));
};
