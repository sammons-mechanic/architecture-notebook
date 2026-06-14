import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of, check_if_match } from '../hal.ts';
import { find_section_by_slug, list_all_sections, update_section, delete_section } from '../repo-sections.ts';
import { check_move_cycle } from '../lib/numbering.ts';
import { is_failure } from '../lib/failure.ts';
import { serialize_section } from '../serialize-section.ts';
import { load_unresolved_refs, surface_unresolved_on_delete } from '../refs-sync.ts';
import { bump_notebook_minor } from '../repo-notebook-meta.ts';

const collect_subtree_ids = (db: import('../db.ts').Database, root_id: number): number[] => {
  const ids: number[] = [root_id];
  const queue: number[] = [root_id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = db.prepare('SELECT id FROM sections WHERE parent_id = ?').all(id) as Array<{ id: number }>;
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
};

export const move_section_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_section_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
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
  const body = (ctx.body ?? {}) as { parent?: string | null; position?: number };
  let new_parent_id: number | null | undefined = undefined;
  if (body.parent !== undefined) {
    if (body.parent === null) {
      new_parent_id = null;
    } else if (typeof body.parent === 'string') {
      const parent_row = find_section_by_slug(deps.db, body.parent);
      if (!parent_row) {
        send_problem(ctx.res, 422, 'validation', 'parent not found', ctx.req.url ?? '', { errors: [{ field: 'parent', code: 'ref-unresolved', message: `No section with slug ${JSON.stringify(body.parent)} exists`, hint: `/api/search?q=${encodeURIComponent(body.parent)}` }] });
        return;
      }
      new_parent_id = parent_row.id;
    } else {
      send_problem(ctx.res, 422, 'validation', 'parent must be slug or null', ctx.req.url ?? '', { errors: [{ field: 'parent', code: 'validation', message: 'parent must be a string slug or null' }] });
      return;
    }
  }
  const tree_nodes = list_all_sections(deps.db).map((entry) => ({ id: entry.id, slug: entry.slug, parent_id: entry.parent_id, position: entry.position }));
  if (new_parent_id !== undefined) {
    const cycle = check_move_cycle(tree_nodes, row.id, new_parent_id);
    if (is_failure(cycle)) {
      send_problem(ctx.res, 422, cycle.code, cycle.message, ctx.req.url ?? '', { errors: [{ field: 'parent', code: cycle.code, message: cycle.message }] });
      return;
    }
  }
  deps.db.exec('BEGIN');
  try {
    update_section(deps.db, row.id, {
      parent_id: new_parent_id === undefined ? undefined : new_parent_id,
      position: typeof body.position === 'number' ? body.position : undefined,
    });
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  const fresh = find_section_by_slug(deps.db, ctx.params.slug)!;
  const { body: serialized } = serialize_section(deps.db, fresh, new Set(), load_unresolved_refs(deps.db, fresh.id));
  send_response(ctx.res, { status: 200, body: serialized, headers: { ETag: etag_of(fresh) } }, negotiate_accept(ctx.req.headers.accept));
};

export const delete_section_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_section_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
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
  deps.db.exec('BEGIN');
  try {
    const doomed = collect_subtree_ids(deps.db, row.id);
    surface_unresolved_on_delete(deps.db, doomed);
    delete_section(deps.db, row.id);
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  ctx.res.writeHead(204);
  ctx.res.end();
};
