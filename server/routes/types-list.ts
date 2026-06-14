import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { find_type_by_slug, list_types } from '../repo-types.ts';
import { serialize_type } from '../serialize-type.ts';
import { collection_type_create_action } from '../serialize-actions.ts';

export const list_types_route = (deps: Deps) => (ctx: RouteContext): void => {
  const rows = list_types(deps.db);
  const body = {
    total: rows.length,
    _links: { self: { href: '/api/types' }, first: { href: '/api/types' } },
    _embedded: { items: rows.map(serialize_type) },
    _actions: collection_type_create_action,
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};

export const list_type_sections_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_type_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Type not found', ctx.req.url ?? '');
    return;
  }
  const sections = deps.db.prepare('SELECT * FROM sections WHERE type_id = ? ORDER BY id ASC').all(row.id) as Array<{ slug: string; title: string }>;
  const body = {
    total: sections.length,
    _links: { self: { href: `/api/types/${row.slug}/sections` }, first: { href: `/api/types/${row.slug}/sections` } },
    _embedded: { items: sections.map((section) => ({ slug: section.slug, title: section.title, _links: { self: { href: `/api/sections/${section.slug}` } } })) },
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};
