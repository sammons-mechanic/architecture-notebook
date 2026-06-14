import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of, check_if_match } from '../hal.ts';
import { find_type_by_slug, insert_type, update_type, delete_type, count_sections_of_type } from '../repo-types.ts';
import { serialize_type } from '../serialize-type.ts';
import { is_valid_slug } from '../lib/slug.ts';
import { bump_notebook_minor } from '../repo-notebook-meta.ts';

export const create_type_route = (deps: Deps) => (ctx: RouteContext): void => {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (typeof body.slug !== 'string' || !is_valid_slug(body.slug)) {
    send_problem(ctx.res, 422, 'slug-invalid', 'Type slug must match ^[a-z0-9-]+$', ctx.req.url ?? '', { errors: [{ field: 'slug', code: 'slug-invalid', message: 'slug must match ^[a-z0-9-]+$' }] });
    return;
  }
  if (typeof body.name !== 'string' || body.name.length === 0) {
    send_problem(ctx.res, 422, 'validation', 'name is required', ctx.req.url ?? '', { errors: [{ field: 'name', code: 'validation', message: 'name is required' }] });
    return;
  }
  if (find_type_by_slug(deps.db, body.slug)) {
    send_problem(ctx.res, 409, 'slug-conflict', `Type ${JSON.stringify(body.slug)} already exists`, ctx.req.url ?? '', { suggested: `${body.slug}-2` });
    return;
  }
  const schema = (body.property_schema as { fields?: unknown }) ?? { fields: [] };
  if (!schema.fields || !Array.isArray(schema.fields)) {
    send_problem(ctx.res, 422, 'validation', 'property_schema.fields must be an array', ctx.req.url ?? '', { errors: [{ field: 'property_schema', code: 'validation', message: 'fields must be an array' }] });
    return;
  }
  deps.db.exec('BEGIN');
  try {
    insert_type(deps.db, {
      slug: body.slug,
      name: body.name,
      description: typeof body.description === 'string' ? body.description : null,
      color: typeof body.color === 'string' ? body.color : null,
      property_schema: schema as { fields: [] },
    });
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  const row = find_type_by_slug(deps.db, body.slug);
  send_response(ctx.res, { status: 201, body: serialize_type(row as any), headers: { Location: `/api/types/${(row as any).slug}`, ETag: etag_of(row as any) } }, negotiate_accept(ctx.req.headers.accept));
};

export const patch_type_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_type_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Type not found', ctx.req.url ?? '');
    return;
  }
  const match = check_if_match(ctx.req.headers['if-match'] as string | undefined, row.etag);
  if (match.kind === 'missing') {
    send_problem(ctx.res, 428, 'precondition-required', 'If-Match header is required', ctx.req.url ?? '');
    return;
  }
  if (match.kind === 'mismatch') {
    send_problem(ctx.res, 412, 'etag-mismatch', 'ETag mismatch', ctx.req.url ?? '', { current_etag: etag_of(row) });
    return;
  }
  const patch = (ctx.body ?? {}) as Record<string, unknown>;
  deps.db.exec('BEGIN');
  try {
    update_type(deps.db, row.id, {
      name: typeof patch.name === 'string' ? patch.name : undefined,
      description: patch.description === undefined ? undefined : (patch.description as string | null),
      color: patch.color === undefined ? undefined : (patch.color as string | null),
      property_schema: patch.property_schema ? (patch.property_schema as { fields: [] }) : undefined,
    });
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  const updated = find_type_by_slug(deps.db, ctx.params.slug);
  send_response(ctx.res, { status: 200, body: serialize_type(updated as any), headers: { ETag: etag_of(updated as any) } }, negotiate_accept(ctx.req.headers.accept));
};

export const delete_type_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_type_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Type not found', ctx.req.url ?? '');
    return;
  }
  const match = check_if_match(ctx.req.headers['if-match'] as string | undefined, row.etag);
  if (match.kind === 'missing') {
    send_problem(ctx.res, 428, 'precondition-required', 'If-Match header is required', ctx.req.url ?? '');
    return;
  }
  if (match.kind === 'mismatch') {
    send_problem(ctx.res, 412, 'etag-mismatch', 'ETag mismatch', ctx.req.url ?? '', { current_etag: etag_of(row) });
    return;
  }
  const dependent_count = count_sections_of_type(deps.db, row.id);
  if (dependent_count > 0) {
    send_problem(ctx.res, 409, 'type-in-use', 'Type has sections referencing it', ctx.req.url ?? '', { dependent_count });
    return;
  }
  deps.db.exec('BEGIN');
  try {
    delete_type(deps.db, row.id);
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  ctx.res.writeHead(204);
  ctx.res.end();
};
