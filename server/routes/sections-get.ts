import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of } from '../hal.ts';
import { find_section_by_slug, list_children_of } from '../repo-sections.ts';
import { list_all_sections } from '../repo-sections.ts';
import { compute_numbering, ancestors_of } from '../lib/numbering.ts';
import { lean_summary, serialize_section } from '../serialize-section.ts';
import { list_refs_for } from '../repo-refs.ts';
import { serialize_ref } from '../serialize-ref.ts';
import { load_unresolved_refs } from '../refs-sync.ts';

const parse_embed = (raw: string | null): Set<string> => {
  if (!raw) {
    return new Set();
  }
  const allowed = new Set(['type', 'parent', 'children', 'refs', 'ancestors', 'from', 'to', 'sections']);
  return new Set(raw.split(',').map((entry) => entry.trim()).filter((entry) => allowed.has(entry)));
};

export const get_section_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_section_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const embed = parse_embed(ctx.url.searchParams.get('embed'));
  const { body } = serialize_section(deps.db, row, embed, load_unresolved_refs(deps.db, row.id));
  send_response(ctx.res, { status: 200, body, headers: { ETag: etag_of(row) } }, negotiate_accept(ctx.req.headers.accept));
};

export const list_children_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_section_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const children = list_children_of(deps.db, row.id);
  const numbers = compute_numbering(list_all_sections(deps.db).map((entry) => ({ id: entry.id, slug: entry.slug, parent_id: entry.parent_id, position: entry.position })));
  const body = {
    total: children.length,
    _links: { self: { href: `/api/sections/${row.slug}/children` }, first: { href: `/api/sections/${row.slug}/children` } },
    _embedded: { items: children.map((child) => lean_summary(deps.db, child, numbers)) },
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};

export const list_ancestors_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_section_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const all_sections = list_all_sections(deps.db);
  const tree_nodes = all_sections.map((entry) => ({ id: entry.id, slug: entry.slug, parent_id: entry.parent_id, position: entry.position }));
  const numbers = compute_numbering(tree_nodes);
  const ancestors = ancestors_of(tree_nodes, row.id);
  const body = {
    total: ancestors.length,
    _links: { self: { href: `/api/sections/${row.slug}/ancestors` }, first: { href: `/api/sections/${row.slug}/ancestors` }, section: { href: `/api/sections/${row.slug}` } },
    _embedded: { items: ancestors.map((entry) => lean_summary(deps.db, all_sections.find((row_match) => row_match.id === entry.id)!, numbers)) },
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};

export const list_section_refs_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_section_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const { out, inbound } = list_refs_for(deps.db, row.id);
  const all = [...out, ...inbound];
  const body = {
    total: all.length,
    _links: { self: { href: `/api/sections/${row.slug}/refs` }, first: { href: `/api/sections/${row.slug}/refs` }, section: { href: `/api/sections/${row.slug}` } },
    _embedded: { items: all.map((entry) => serialize_ref(deps.db, entry)) },
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};
