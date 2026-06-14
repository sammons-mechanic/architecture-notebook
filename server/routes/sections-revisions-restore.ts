import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of, check_if_match } from '../hal.ts';
import { is_failure } from '../lib/failure.ts';
import { find_section_by_slug, update_section } from '../repo-sections.ts';
import { find_type_by_slug, parse_property_schema } from '../repo-types.ts';
import { find_revision, insert_revision } from '../repo-revisions.ts';
import { bump_notebook_minor } from '../repo-notebook-meta.ts';
import { sync_section_refs, persist_unresolved_refs } from '../refs-sync.ts';
import { stamp_anchors } from '../lib/links.ts';
import { serialize_section } from '../serialize-section.ts';
import { read_author, validate_revision_message } from '../lib/author.ts';

export const restore_section_revision_route = (deps: Deps) => (ctx: RouteContext): void => {
  const section = find_section_by_slug(deps.db, ctx.params.slug);
  if (!section) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const match = check_if_match(ctx.req.headers['if-match'] as string | undefined, section.etag);
  if (match.kind === 'missing') {
    send_problem(ctx.res, 428, 'precondition-required', 'If-Match required', ctx.req.url ?? '');
    return;
  }
  if (match.kind === 'mismatch') {
    send_problem(ctx.res, 412, 'etag-mismatch', 'ETag mismatch', ctx.req.url ?? '', { current_etag: etag_of(section) });
    return;
  }
  const number = Number.parseInt(ctx.params.rev, 10);
  if (!Number.isFinite(number) || number < 1 || String(number) !== ctx.params.rev) {
    send_problem(ctx.res, 422, 'validation', 'revision must be a positive integer', ctx.req.url ?? '', { errors: [{ field: 'revision', code: 'validation', message: 'revision must be a positive integer' }] });
    return;
  }
  const snapshot = find_revision(deps.db, section.id, number);
  if (!snapshot) {
    send_problem(ctx.res, 404, 'not-found', `Revision ${number} not found`, ctx.req.url ?? '');
    return;
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const author = read_author(ctx.req.headers);
  if (is_failure(author)) {
    send_problem(ctx.res, 422, author.code, author.message, ctx.req.url ?? '', { errors: author.errors });
    return;
  }
  const supplied = validate_revision_message(body.revision_message);
  if (is_failure(supplied)) {
    send_problem(ctx.res, 422, supplied.code, supplied.message, ctx.req.url ?? '', { errors: supplied.errors });
    return;
  }
  const message = supplied ?? `Restored from revision ${number}`;
  const type_row = find_type_by_slug(deps.db, (deps.db.prepare('SELECT slug FROM section_types WHERE id = ?').get(section.type_id) as { slug: string }).slug)!;
  const schema = parse_property_schema(type_row);
  const restored_properties = JSON.parse(snapshot.properties_json) as Record<string, unknown>;
  const restored_tags = JSON.parse(snapshot.tags_json) as string[];
  const restored_html = stamp_anchors(snapshot.html);
  deps.db.exec('BEGIN');
  try {
    update_section(deps.db, section.id, {
      title: snapshot.title,
      deck: snapshot.deck,
      properties: restored_properties,
      tags: restored_tags,
      html: restored_html,
    });
    const sync = sync_section_refs(deps.db, section.id, restored_html, restored_properties, schema, deps.get_peer_db);
    if (is_failure(sync)) {
      deps.db.exec('ROLLBACK');
      send_problem(ctx.res, 422, sync.code, sync.message, ctx.req.url ?? '', { errors: sync.errors });
      return;
    }
    persist_unresolved_refs(deps.db, section.id, sync.unresolved);
    const post = find_section_by_slug(deps.db, ctx.params.slug)!;
    insert_revision(deps.db, post, author, message);
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
    const fresh = find_section_by_slug(deps.db, ctx.params.slug)!;
    const embed = new Set(['type', 'parent', 'refs', 'children']);
    const { body: serialized } = serialize_section(deps.db, fresh, embed, sync.unresolved);
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
