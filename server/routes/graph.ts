import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { list_all_sections } from '../repo-sections.ts';
import { list_all_refs } from '../repo-refs.ts';
import { compute_numbering } from '../lib/numbering.ts';

export const graph_route = (deps: Deps) => (ctx: RouteContext): void => {
  const sections = list_all_sections(deps.db);
  const numbers = compute_numbering(sections.map((entry) => ({ id: entry.id, slug: entry.slug, parent_id: entry.parent_id, position: entry.position })));
  const id_to_slug = new Map<number, string>();
  const id_to_type = new Map<number, string>();
  for (const row of sections) {
    id_to_slug.set(row.id, row.slug);
  }
  const types = deps.db.prepare('SELECT id, slug FROM section_types').all() as Array<{ id: number; slug: string }>;
  for (const t of types) {
    id_to_type.set(t.id, t.slug);
  }
  const nodes = sections.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: id_to_type.get(row.type_id) ?? null,
    parent: row.parent_id !== null ? id_to_slug.get(row.parent_id) ?? null : null,
    position: row.position,
    number: numbers.get(row.id) ?? '',
  }));
  const refs = list_all_refs(deps.db);
  const edges = refs.map((row) => {
    const base = {
      id: row.id,
      from: id_to_slug.get(row.from_id) ?? null,
      role: row.role,
      source: row.source,
    };
    if (row.to_notebook !== null) {
      return {
        ...base,
        to: `@${row.to_notebook}`,
        to_notebook: row.to_notebook,
      };
    }
    return { ...base, to: row.to_id !== null ? id_to_slug.get(row.to_id) ?? null : null };
  });
  const body = { nodes, edges, _links: { self: { href: '/api/graph' } } };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};
