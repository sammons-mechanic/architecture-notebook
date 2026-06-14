import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { list_root_sections, list_children_of, find_section_by_slug } from '../repo-sections.ts';
import { compute_numbering } from '../lib/numbering.ts';
import { list_all_sections } from '../repo-sections.ts';
import { lean_summary } from '../serialize-section.ts';
import { collection_section_create_action } from '../serialize-actions.ts';

export const list_sections_route = (deps: Deps) => (ctx: RouteContext): void => {
  const parent_param = ctx.url.searchParams.get('parent');
  if (parent_param === '') {
    send_problem(ctx.res, 422, 'validation', 'Empty parent= is not supported', ctx.req.url ?? '', { errors: [{ field: 'parent', code: 'validation', message: 'parent must be a non-empty slug or omitted' }] });
    return;
  }
  let rows;
  let self_href = '/api/sections';
  if (parent_param) {
    const parent_row = find_section_by_slug(deps.db, parent_param);
    if (!parent_row) {
      send_problem(ctx.res, 404, 'not-found', 'Parent section not found', ctx.req.url ?? '');
      return;
    }
    rows = list_children_of(deps.db, parent_row.id);
    self_href = `/api/sections?parent=${parent_param}`;
  } else {
    rows = list_root_sections(deps.db);
  }
  const all_sections = list_all_sections(deps.db);
  const numbers = compute_numbering(all_sections.map((row) => ({ id: row.id, slug: row.slug, parent_id: row.parent_id, position: row.position })));
  const body = {
    total: rows.length,
    _links: { self: { href: self_href }, first: { href: self_href } },
    _embedded: { items: rows.map((row) => lean_summary(deps.db, row, numbers)) },
    _actions: collection_section_create_action,
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};
