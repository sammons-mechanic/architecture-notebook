import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of, check_if_match } from '../hal.ts';
import { is_failure } from '../lib/failure.ts';
import { find_section_by_slug, update_section } from '../repo-sections.ts';
import { find_type_by_slug, parse_property_schema } from '../repo-types.ts';
import { validate_properties, validate_top_level, merge_properties } from '../lib/validate.ts';
import { allowed_section_patch_keys } from './sections-helpers.ts';
import { build_validate_deps } from '../validate-deps.ts';
import { sync_section_refs, persist_unresolved_refs } from '../refs-sync.ts';
import { stamp_anchors } from '../lib/links.ts';
import { serialize_section } from '../serialize-section.ts';
import { insert_revision } from '../repo-revisions.ts';
import { bump_notebook_minor } from '../repo-notebook-meta.ts';
import { read_author, validate_revision_message } from '../lib/author.ts';

export const patch_section_route = (deps: Deps) => (ctx: RouteContext): void => {
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
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const author = read_author(ctx.req.headers);
  if (is_failure(author)) {
    send_problem(ctx.res, 422, author.code, author.message, ctx.req.url ?? '', { errors: author.errors });
    return;
  }
  const message = validate_revision_message(body.revision_message);
  if (is_failure(message)) {
    send_problem(ctx.res, 422, message.code, message.message, ctx.req.url ?? '', { errors: message.errors });
    return;
  }
  const top_check = validate_top_level(body, allowed_section_patch_keys);
  if (is_failure(top_check)) {
    send_problem(ctx.res, 422, top_check.code, top_check.message, ctx.req.url ?? '', { errors: top_check.errors });
    return;
  }
  const type_row = find_type_by_slug(deps.db, (deps.db.prepare('SELECT slug FROM section_types WHERE id = ?').get(row.type_id) as { slug: string }).slug)!;
  const schema = parse_property_schema(type_row);
  const validate_deps = build_validate_deps(deps.db, deps.root_doc, deps.get_peer_db);
  let next_props = JSON.parse(row.properties_json) as Record<string, unknown>;
  let unresolved_properties: Array<{ slug: string; source: 'property'; field: string; notebook?: string }> = [];
  if (body.properties !== undefined) {
    const validated = validate_properties(schema, body.properties as Record<string, unknown>, validate_deps, 'patch');
    if (is_failure(validated)) {
      send_problem(ctx.res, 422, validated.code, validated.message, ctx.req.url ?? '', { errors: validated.errors });
      return;
    }
    next_props = merge_properties(next_props, validated.values);
    unresolved_properties = validated.unresolved;
  }
  deps.db.exec('BEGIN');
  try {
    const raw_html = typeof body.html === 'string' ? body.html : row.html;
    const next_html = stamp_anchors(raw_html);
    const next_tags = Array.isArray(body.tags) ? (body.tags.filter((entry): entry is string => typeof entry === 'string')) : JSON.parse(row.tags_json);
    update_section(deps.db, row.id, {
      title: typeof body.title === 'string' ? body.title : undefined,
      deck: body.deck === undefined ? undefined : (typeof body.deck === 'string' ? body.deck : null),
      properties: next_props,
      tags: next_tags,
      html: next_html,
    });
    const sync = sync_section_refs(deps.db, row.id, next_html, next_props, schema, deps.get_peer_db);
    if (is_failure(sync)) {
      deps.db.exec('ROLLBACK');
      send_problem(ctx.res, 422, sync.code, sync.message, ctx.req.url ?? '', { errors: sync.errors });
      return;
    }
    const unresolved = [...unresolved_properties, ...sync.unresolved];
    persist_unresolved_refs(deps.db, row.id, unresolved);
    const post_update = find_section_by_slug(deps.db, ctx.params.slug)!;
    insert_revision(deps.db, post_update, author, message);
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
    const fresh = find_section_by_slug(deps.db, ctx.params.slug)!;
    const { body: serialized } = serialize_section(deps.db, fresh, new Set(), unresolved);
    send_response(ctx.res, { status: 200, body: serialized, headers: { ETag: etag_of(fresh) } }, negotiate_accept(ctx.req.headers.accept));
  } catch (error) {
    try {
      deps.db.exec('ROLLBACK');
    } catch (_inner) {
      // already rolled back
    }
    throw error;
  }
};
