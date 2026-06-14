import { make_failure, type Failure } from './failure.ts';
import { token_dependencies } from './batch-tokens.ts';

export type BatchOp = {
  readonly id: string;
  readonly method: string;
  readonly href: string;
  readonly body?: unknown;
  readonly if_match?: string;
};

export type DependencyResult = {
  readonly order: string[];
  readonly pre_failures: Map<string, Failure>;
};

export const analyze_dependencies = (
  ops: ReadonlyArray<BatchOp>
): DependencyResult | Failure => {
  const ids = new Set(ops.map((op) => op.id));
  const pre_failures = new Map<string, Failure>();
  const graph = new Map<string, Set<string>>();
  for (const op of ops) {
    const deps = token_dependencies(op.body);
    if (typeof op.if_match === 'string') {
      for (const dep of token_dependencies(op.if_match)) {
        deps.add(dep);
      }
    }
    const filtered = new Set<string>();
    for (const dep_id of deps) {
      if (!ids.has(dep_id)) {
        pre_failures.set(op.id, make_failure(
          'backref-unresolved',
          `Op references unknown opid ${JSON.stringify(dep_id)}`
        ));
      } else {
        filtered.add(dep_id);
      }
    }
    graph.set(op.id, filtered);
  }
  const indegree = new Map<string, number>();
  for (const op_id of graph.keys()) {
    indegree.set(op_id, 0);
  }
  for (const deps of graph.values()) {
    for (const dep_id of deps) {
      indegree.set(dep_id, (indegree.get(dep_id) ?? 0));
    }
  }
  const reverse = new Map<string, Set<string>>();
  for (const [op_id, deps] of graph.entries()) {
    for (const dep_id of deps) {
      const set = reverse.get(dep_id) ?? new Set<string>();
      set.add(op_id);
      reverse.set(dep_id, set);
      indegree.set(op_id, (indegree.get(op_id) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const op of ops) {
    if ((indegree.get(op.id) ?? 0) === 0) {
      queue.push(op.id);
    }
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const next_id = queue.shift() as string;
    order.push(next_id);
    for (const dependent of reverse.get(next_id) ?? []) {
      const left = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, left);
      if (left === 0) {
        queue.push(dependent);
      }
    }
  }
  if (order.length !== ops.length) {
    const cycle_members = ops.filter((op) => !order.includes(op.id)).map((op) => op.id);
    return make_failure('cycle-illegal', 'Batch contains a dependency cycle', {
      errors: cycle_members.map((id) => ({ field: id, code: 'cycle-illegal', message: 'In cycle' })),
    });
  }
  return { order, pre_failures };
};

export const transitive_dependents = (
  ops: ReadonlyArray<BatchOp>,
  failed_id: string
): Set<string> => {
  const reverse = new Map<string, Set<string>>();
  for (const op of ops) {
    const deps = token_dependencies(op.body);
    if (typeof op.if_match === 'string') {
      for (const dep of token_dependencies(op.if_match)) {
        deps.add(dep);
      }
    }
    for (const dep_id of deps) {
      const set = reverse.get(dep_id) ?? new Set<string>();
      set.add(op.id);
      reverse.set(dep_id, set);
    }
  }
  const aborted = new Set<string>();
  const queue = [failed_id];
  while (queue.length > 0) {
    const next_id = queue.shift() as string;
    for (const dependent of reverse.get(next_id) ?? []) {
      if (!aborted.has(dependent)) {
        aborted.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return aborted;
};
