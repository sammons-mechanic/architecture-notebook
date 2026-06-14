import { make_failure, type Failure } from './failure.ts';

export type TreeNode = {
  readonly id: number;
  readonly slug: string;
  readonly parent_id: number | null;
  readonly position: number;
};

export const compute_numbering = (nodes: ReadonlyArray<TreeNode>): Map<number, string> => {
  const by_parent = new Map<number | null, TreeNode[]>();
  for (const node of nodes) {
    const list = by_parent.get(node.parent_id) ?? [];
    list.push(node);
    by_parent.set(node.parent_id, list);
  }
  for (const list of by_parent.values()) {
    list.sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }
      return left.id - right.id;
    });
  }
  const numbers = new Map<number, string>();
  const walk = (parent_id: number | null, prefix: string): void => {
    const children = by_parent.get(parent_id) ?? [];
    let index = 1;
    for (const child of children) {
      const number = prefix === '' ? String(index) : `${prefix}.${index}`;
      numbers.set(child.id, number);
      walk(child.id, number);
      index += 1;
    }
  };
  walk(null, '');
  return numbers;
};

export const ancestors_of = (
  nodes: ReadonlyArray<TreeNode>,
  target_id: number
): TreeNode[] => {
  const by_id = new Map<number, TreeNode>();
  for (const node of nodes) {
    by_id.set(node.id, node);
  }
  const path: TreeNode[] = [];
  let cursor = by_id.get(target_id)?.parent_id ?? null;
  while (cursor !== null) {
    const current = by_id.get(cursor);
    if (!current) {
      break;
    }
    path.unshift(current);
    cursor = current.parent_id;
  }
  return path;
};

export const check_move_cycle = (
  nodes: ReadonlyArray<TreeNode>,
  moving_id: number,
  new_parent_id: number | null
): true | Failure => {
  if (new_parent_id === null) {
    return true;
  }
  if (new_parent_id === moving_id) {
    return make_failure('cycle-illegal', 'Cannot move a section to be its own parent');
  }
  const by_id = new Map<number, TreeNode>();
  for (const node of nodes) {
    by_id.set(node.id, node);
  }
  let cursor: number | null = new_parent_id;
  const seen = new Set<number>();
  while (cursor !== null) {
    if (seen.has(cursor)) {
      return make_failure('cycle-illegal', 'Existing tree already contains a cycle');
    }
    seen.add(cursor);
    if (cursor === moving_id) {
      return make_failure('cycle-illegal', 'Move would create a tree cycle');
    }
    cursor = by_id.get(cursor)?.parent_id ?? null;
  }
  return true;
};
