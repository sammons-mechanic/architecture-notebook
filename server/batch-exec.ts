import type { Deps } from './lib/types.ts';
import { analyze_dependencies, transitive_dependents, type BatchOp } from './lib/batch-deps.ts';
import { substitute_tokens } from './lib/batch-tokens.ts';
import { is_failure, make_failure, type Failure } from './lib/failure.ts';
import { execute_one_op, type OpResult, type EnvelopeCtx } from './batch-op-runner.ts';
import { build_problem } from './problem.ts';
import { bump_notebook_minor } from './repo-notebook-meta.ts';

export type EnvelopeResult = {
  status: number;
  body: Record<string, unknown>;
};

const dependency_aborted_body = (instance: string) => build_problem('dependency-aborted', 424, 'Upstream op failed', instance);

// Comment ops (PATCH /api/comments/:id) are the one batch op that doesn't count
// as a content change — the direct comment routes don't bump the version either.
// A batch bumps minor once iff it committed at least one non-comment op.
const COMMENT_OP = /^\/api\/comments\/\d+$/;
const is_content_op = (op: BatchOp): boolean => !COMMENT_OP.test(op.href.replace(/^\/n\/[a-z0-9-]+/, ''));

export const execute_batch = (
  deps: Deps,
  ops: ReadonlyArray<BatchOp>,
  atomic: boolean,
  env: EnvelopeCtx,
): EnvelopeResult => {
  const analysis = analyze_dependencies(ops);
  if (is_failure(analysis)) {
    if (analysis.code === 'cycle-illegal') {
      return {
        status: 422,
        body: build_problem(analysis.code, 422, analysis.message, deps.req_path, { errors: analysis.errors }),
      };
    }
    return { status: 422, body: build_problem(analysis.code, 422, analysis.message, deps.req_path) };
  }
  const pre_failures = analysis.pre_failures;
  if (atomic && pre_failures.size > 0) {
    return atomic_short_circuit(ops, pre_failures, deps.req_path);
  }
  return atomic ? run_atomic(deps, ops, analysis.order, pre_failures, env) : run_non_atomic(deps, ops, analysis.order, pre_failures, env);
};

const atomic_short_circuit = (
  ops: ReadonlyArray<BatchOp>,
  pre_failures: Map<string, Failure>,
  instance: string
): EnvelopeResult => {
  const results: Array<{ id: string; status: number; body: unknown }> = [];
  for (const op of ops) {
    const failure = pre_failures.get(op.id);
    if (failure) {
      results.push({ id: op.id, status: 422, body: build_problem(failure.code, 422, failure.message, instance) });
    } else {
      results.push({ id: op.id, status: 424, body: dependency_aborted_body(instance) });
    }
  }
  return { status: 200, body: { atomic: true, rolled_back: false, results } };
};

const run_atomic = (
  deps: Deps,
  ops: ReadonlyArray<BatchOp>,
  order: ReadonlyArray<string>,
  pre_failures: Map<string, Failure>,
  env: EnvelopeCtx,
): EnvelopeResult => {
  const results = new Map<string, OpResult>();
  const op_by_id = new Map(ops.map((op) => [op.id, op] as const));
  deps.db.exec('BEGIN');
  let failure_id: string | null = null;
  for (const op_id of order) {
    const op = op_by_id.get(op_id)!;
    if (pre_failures.has(op_id)) {
      const fail = pre_failures.get(op_id)!;
      results.set(op_id, { status: 422, body: build_problem(fail.code, 422, fail.message, deps.req_path), tokens: null });
      failure_id = op_id;
      break;
    }
    const result = execute_one_op(deps, op, results, env);
    results.set(op_id, result);
    if (result.status >= 400) {
      failure_id = op_id;
      break;
    }
  }
  if (failure_id !== null) {
    deps.db.exec('ROLLBACK');
    const result_list = ops.map((op) => {
      const stored = results.get(op.id);
      if (stored) {
        return { id: op.id, status: stored.status, body: stored.body };
      }
      return { id: op.id, status: 424, body: dependency_aborted_body(deps.req_path) };
    });
    return { status: 200, body: { atomic: true, rolled_back: true, results: result_list } };
  }
  // Reaching here means every op committed — one minor bump for the batch,
  // unless every op was a comment (which never counts as a content change).
  if (ops.some(is_content_op)) bump_notebook_minor(deps.db);
  deps.db.exec('COMMIT');
  return { status: 200, body: { atomic: true, results: ops.map((op) => ({ id: op.id, status: results.get(op.id)!.status, body: results.get(op.id)!.body })) } };
};

const run_non_atomic = (
  deps: Deps,
  ops: ReadonlyArray<BatchOp>,
  order: ReadonlyArray<string>,
  pre_failures: Map<string, Failure>,
  env: EnvelopeCtx,
): EnvelopeResult => {
  const results = new Map<string, OpResult>();
  const op_by_id = new Map(ops.map((op) => [op.id, op] as const));
  const aborted = new Set<string>();
  for (const op_id of order) {
    if (aborted.has(op_id)) {
      results.set(op_id, { status: 424, body: dependency_aborted_body(deps.req_path), tokens: null });
      continue;
    }
    if (pre_failures.has(op_id)) {
      const fail = pre_failures.get(op_id)!;
      results.set(op_id, { status: 422, body: build_problem(fail.code, 422, fail.message, deps.req_path), tokens: null });
      for (const dependent of transitive_dependents(ops, op_id)) {
        aborted.add(dependent);
      }
      continue;
    }
    const op = op_by_id.get(op_id)!;
    const result = execute_one_op(deps, op, results, env);
    results.set(op_id, result);
    if (result.status >= 400) {
      for (const dependent of transitive_dependents(ops, op_id)) {
        aborted.add(dependent);
      }
    }
  }
  // Non-atomic ops auto-commit individually; bump once if a non-comment op
  // committed (comments never count as a content change).
  const any_content_committed = ops.some((op) => is_content_op(op) && (results.get(op.id)?.status ?? 500) < 400);
  if (any_content_committed) bump_notebook_minor(deps.db);
  return { status: 200, body: { atomic: false, results: ops.map((op) => ({ id: op.id, status: results.get(op.id)!.status, body: results.get(op.id)!.body })) } };
};
