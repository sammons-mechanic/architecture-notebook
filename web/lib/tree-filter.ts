import type { GraphNode } from './types.ts';

const matches = (node: GraphNode, needle: string) => {
  const lower = needle.toLowerCase();
  return node.title.toLowerCase().includes(lower) || node.slug.toLowerCase().includes(lower);
};

export const visible_slugs = (nodes: ReadonlyArray<GraphNode>, query: string): Set<string> => {
  const out = new Set<string>();
  if (query.trim().length === 0) {
    for (const node of nodes) {
      out.add(node.slug);
    }
    return out;
  }
  const by_slug = new Map(nodes.map((node) => [node.slug, node] as const));
  for (const node of nodes) {
    if (!matches(node, query)) {
      continue;
    }
    out.add(node.slug);
    let current = node;
    while (current.parent) {
      const parent = by_slug.get(current.parent);
      if (!parent) {
        break;
      }
      out.add(parent.slug);
      current = parent;
    }
  }
  return out;
};
