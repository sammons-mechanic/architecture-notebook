import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of, check_if_match } from '../hal.ts';
import { list_all_refs, find_ref, insert_ref, delete_ref, find_existing_ref } from '../repo-refs.ts';
import { find_section_by_slug } from '../repo-sections.ts';
import { serialize_ref } from '../serialize-ref.ts';
import { bump_notebook_minor } from '../repo-notebook-meta.ts';

export const list_refs_route = (deps: Deps) => (ctx: RouteContext): void => {
  const rows = list_all_refs(deps.db);
  const body = {
    total: rows.length,
    _links: { self: { href: '/api/refs' }, first: { href: '/api/refs' } },
    _embedded: { items: rows.map((row) => serialize_ref(deps.db, row)) },
    _actions: {
      create: {
        method: 'POST',
        href: '/api/refs',
        title: 'Create a manual ref',
        schema: {
          fields: [
            { key: 'from', type: 'ref', required: true },
            { key: 'to', type: 'ref', required: true },
            { key: 'role', type: 'string', required: false },
          ],
        },
      },
    },
  };
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};

export const create_ref_route = (deps: Deps) => (ctx: RouteContext): void => {
  const body = (ctx.body ?? {}) as { from?: string; to?: string; role?: string | null };
  if (typeof body.from !== 'string') {
    send_problem(ctx.res, 422, 'validation', 'from is required', ctx.req.url ?? '', { errors: [{ field: 'from', code: 'validation', message: 'from is required' }] });
    return;
  }
  if (typeof body.to !== 'string') {
    send_problem(ctx.res, 422, 'validation', 'to is required', ctx.req.url ?? '', { errors: [{ field: 'to', code: 'validation', message: 'to is required' }] });
    return;
  }
  const from_row = find_section_by_slug(deps.db, body.from);
  if (!from_row) {
    send_problem(ctx.res, 422, 'validation', 'from section not found', ctx.req.url ?? '', { errors: [{ field: 'from', code: 'ref-unresolved', message: `No section with slug ${JSON.stringify(body.from)} exists`, hint: `/api/search?q=${encodeURIComponent(body.from)}` }] });
    return;
  }
  const to_row = find_section_by_slug(deps.db, body.to);
  if (!to_row) {
    send_problem(ctx.res, 422, 'validation', 'to section not found', ctx.req.url ?? '', { errors: [{ field: 'to', code: 'ref-unresolved', message: `No section with slug ${JSON.stringify(body.to)} exists`, hint: `/api/search?q=${encodeURIComponent(body.to)}` }] });
    return;
  }
  const role = typeof body.role === 'string' ? body.role : null;
  const existing = find_existing_ref(deps.db, from_row.id, to_row.id, role, 'manual');
  if (existing) {
    send_response(ctx.res, { status: 200, body: serialize_ref(deps.db, existing), headers: { ETag: etag_of(existing) } }, negotiate_accept(ctx.req.headers.accept));
    return;
  }
  deps.db.exec('BEGIN');
  let row;
  try {
    row = insert_ref(deps.db, { from_id: from_row.id, to_id: to_row.id, role, source: 'manual' });
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  send_response(ctx.res, {
    status: 201,
    body: serialize_ref(deps.db, row),
    headers: { Location: `/api/refs/${row.id}`, ETag: etag_of(row) },
  }, negotiate_accept(ctx.req.headers.accept));
};

export const get_ref_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_ref(deps.db, Number(ctx.params.id));
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Ref not found', ctx.req.url ?? '');
    return;
  }
  send_response(ctx.res, { status: 200, body: serialize_ref(deps.db, row), headers: { ETag: etag_of(row) } }, negotiate_accept(ctx.req.headers.accept));
};

export const delete_ref_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_ref(deps.db, Number(ctx.params.id));
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Ref not found', ctx.req.url ?? '');
    return;
  }
  const match = check_if_match(ctx.req.headers['if-match'] as string | undefined, row.etag);
  if (match.kind === 'missing') {
    send_problem(ctx.res, 428, 'precondition-required', 'If-Match required', ctx.req.url ?? '');
    return;
  }
  if (match.kind === 'mismatch') {
    send_problem(ctx.res, 412, 'etag-mismatch', 'ETag mismatch', ctx.req.url ?? '', { current_etag: etag_of(row) });
    return;
  }
  if (row.source !== 'manual') {
    const from = find_section_by_slug(deps.db, (deps.db.prepare('SELECT slug FROM sections WHERE id = ?').get(row.from_id) as { slug: string }).slug);
    const hint = from ? `/api/sections/${from.slug}` : '/api/sections';
    send_problem(ctx.res, 422, 'ref-derived', 'Edit the referencing section to remove this reference', ctx.req.url ?? '', { hint });
    return;
  }
  deps.db.exec('BEGIN');
  try {
    delete_ref(deps.db, row.id);
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  ctx.res.writeHead(204);
  ctx.res.end();
};
