import type { Deps } from './lib/types.ts';
import type { BatchOp } from './lib/batch-deps.ts';
import { substitute_tokens } from './lib/batch-tokens.ts';
import { is_failure } from './lib/failure.ts';
import { build_problem } from './problem.ts';
import { run_op_types, run_op_sections, run_op_refs } from './batch-op-dispatch.ts';
import { run_patch_section, run_patch_comment, run_patch_type } from './batch-op-patch.ts';

export type OpResult = {
  status: number;
  body: unknown;
  tokens: { slug?: string; id?: number } | null;
};

export type EnvelopeCtx = { readonly author: string | null };

const PATCH_SECTION = /^\/api\/sections\/([a-z0-9-]+)$/;
const PATCH_COMMENT = /^\/api\/comments\/(\d+)$/;
const PATCH_TYPE = /^\/api\/types\/([a-z0-9-]+)$/;

export const execute_one_op = (
  deps: Deps,
  op: BatchOp,
  prior_results: ReadonlyMap<string, OpResult>,
  env: EnvelopeCtx,
): OpResult => {
  const token_map = new Map<string, { slug?: string; id?: number }>();
  for (const [id, result] of prior_results.entries()) {
    if (result.tokens) token_map.set(id, result.tokens);
  }
  const substituted_body = substitute_tokens(op.body ?? {}, token_map);
  if (is_failure(substituted_body)) {
    return { status: 422, body: build_problem(substituted_body.code, 422, substituted_body.message, deps.req_path), tokens: null };
  }
  const sub_body = substituted_body as Record<string, unknown>;
  const inner_href = op.href.replace(/^\/n\/[a-z0-9-]+/, '');
  const method = op.method.toUpperCase();
  if (inner_href === '/api/batch') {
    return { status: 400, body: build_problem('validation', 400, 'Cannot nest batches', deps.req_path), tokens: null };
  }
  if (method === 'POST' && inner_href === '/api/types') return run_op_types(deps, sub_body);
  if (method === 'POST' && inner_href === '/api/sections') return run_op_sections(deps, sub_body);
  if (method === 'POST' && inner_href === '/api/refs') return run_op_refs(deps, sub_body);
  if (method === 'PATCH') {
    let m = PATCH_SECTION.exec(inner_href);
    if (m) return run_patch_section(deps, op, sub_body, m[1], env.author);
    m = PATCH_COMMENT.exec(inner_href);
    if (m) return run_patch_comment(deps, op, sub_body, Number(m[1]));
    m = PATCH_TYPE.exec(inner_href);
    if (m) return run_patch_type(deps, op, sub_body, m[1]);
  }
  return { status: 400, body: build_problem('validation', 400, `Unsupported batch op ${op.method} ${op.href}`, deps.req_path), tokens: null };
};
