import type { GraphNode } from './types.ts';

export type ProjectStat = {
  readonly section_count: number;
  readonly max_depth: number;
};

export const project_stats = (nodes: ReadonlyArray<GraphNode>, root_slug: string): ProjectStat => {
  const children_of = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (node.parent === null) continue;
    const list = children_of.get(node.parent) ?? [];
    list.push(node);
    children_of.set(node.parent, list);
  }
  let section_count = 1;
  let max_depth = 0;
  const walk = (slug: string, depth: number) => {
    if (depth > max_depth) max_depth = depth;
    const kids = children_of.get(slug) ?? [];
    for (const kid of kids) {
      section_count += 1;
      walk(kid.slug, depth + 1);
    }
  };
  walk(root_slug, 0);
  return { section_count, max_depth };
};
