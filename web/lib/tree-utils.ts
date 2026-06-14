import type { GraphNode } from './types.ts';

export type TreeNode = {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly number: string;
  readonly parent: string | null;
  readonly children: ReadonlyArray<TreeNode>;
};

export const build_tree = (nodes: ReadonlyArray<GraphNode>): ReadonlyArray<TreeNode> => {
  const by_parent = new Map<string | null, GraphNode[]>();
  for (const node of nodes) {
    const list = by_parent.get(node.parent) ?? [];
    list.push(node);
    by_parent.set(node.parent, list);
  }
  for (const list of by_parent.values()) {
    list.sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }
      return left.id - right.id;
    });
  }
  const build = (parent: string | null): TreeNode[] => {
    const list = by_parent.get(parent) ?? [];
    return list.map((node) => ({
      slug: node.slug,
      title: node.title,
      type: node.type,
      number: node.number,
      parent: node.parent,
      children: build(node.slug),
    }));
  };
  return build(null);
};

export const ancestors_of = (nodes: ReadonlyArray<GraphNode>, slug: string): ReadonlyArray<string> => {
  const by_slug = new Map<string, GraphNode>();
  for (const node of nodes) {
    by_slug.set(node.slug, node);
  }
  const out: string[] = [];
  let current = by_slug.get(slug);
  while (current && current.parent) {
    out.unshift(current.parent);
    current = by_slug.get(current.parent);
  }
  return out;
};
