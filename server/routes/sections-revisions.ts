import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { find_section_by_slug } from '../repo-sections.ts';
import { list_revisions, find_revision } from '../repo-revisions.ts';
import { serialize_revision_summary, serialize_revision_full } from '../serialize-revision.ts';

export const list_section_revisions_route = (deps: Deps) => (ctx: RouteContext): void => {
  const section = find_section_by_slug(deps.db, ctx.params.slug);
  if (!section) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const rows = list_revisions(deps.db, section.id);
  send_response(ctx.res, {
    status: 200,
    body: {
      total: rows.length,
      _embedded: { items: rows.map((row) => serialize_revision_summary(section, row)) },
      _links: {
        self: { href: `/api/sections/${section.slug}/revisions` },
        section: { href: `/api/sections/${section.slug}` },
      },
    },
  }, negotiate_accept(ctx.req.headers.accept));
};

export const get_section_revision_route = (deps: Deps) => (ctx: RouteContext): void => {
  const section = find_section_by_slug(deps.db, ctx.params.slug);
  if (!section) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const number = Number.parseInt(ctx.params.rev, 10);
  if (!Number.isFinite(number) || number < 1) {
    send_problem(ctx.res, 422, 'validation', 'revision must be a positive integer', ctx.req.url ?? '');
    return;
  }
  const row = find_revision(deps.db, section.id, number);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', `Revision ${number} not found`, ctx.req.url ?? '');
    return;
  }
  send_response(ctx.res, { status: 200, body: serialize_revision_full(section, row) }, negotiate_accept(ctx.req.headers.accept));
};
