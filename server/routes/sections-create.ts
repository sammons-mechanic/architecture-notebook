import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of } from '../hal.ts';
import { is_failure } from '../lib/failure.ts';
import { insert_section, find_section_by_slug, next_position_under } from '../repo-sections.ts';
import { prepare_section_create } from './sections-helpers.ts';
import { serialize_section } from '../serialize-section.ts';
import { sync_section_refs, persist_unresolved_refs, re_resolve_for_slug } from '../refs-sync.ts';
import { stamp_anchors } from '../lib/links.ts';
import { parse_property_schema, find_type_by_slug } from '../repo-types.ts';
import { insert_revision } from '../repo-revisions.ts';
import { bump_notebook_minor } from '../repo-notebook-meta.ts';
import { read_author, validate_revision_message } from '../lib/author.ts';

export const create_section_route = (deps: Deps) => (ctx: RouteContext): void => {
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
  const prep = prepare_section_create(deps, body);
  if (is_failure(prep)) {
    const status = prep.code === 'slug-conflict' ? 409 : prep.code === 'slug-invalid' ? 422 : 422;
    send_problem(ctx.res, status, prep.code, prep.message, ctx.req.url ?? '', { errors: prep.errors, ...(prep.hint ? { hint: prep.hint } : {}) });
    return;
  }
  deps.db.exec('BEGIN');
  try {
    const position = next_position_under(deps.db, prep.parent_id);
    const stamped_html = stamp_anchors(prep.html);
    const inserted = insert_section(deps.db, {
      slug: prep.slug,
      type_id: prep.type_id,
      parent_id: prep.parent_id,
      title: prep.title,
      deck: prep.deck,
      position,
      properties: prep.validated_properties,
      tags: prep.tags,
      html: stamped_html,
    });
    const type_row = find_type_by_slug(deps.db, prep.type_slug);
    const schema = parse_property_schema(type_row!);
    const sync = sync_section_refs(deps.db, inserted.id, stamped_html, prep.validated_properties, schema, deps.get_peer_db);
    if (is_failure(sync)) {
      deps.db.exec('ROLLBACK');
      send_problem(ctx.res, 422, sync.code, sync.message, ctx.req.url ?? '', { errors: sync.errors });
      return;
    }
    const unresolved = [...prep.unresolved_properties, ...sync.unresolved];
    persist_unresolved_refs(deps.db, inserted.id, unresolved);
    re_resolve_for_slug(deps.db, prep.slug);
    const fresh_before_commit = find_section_by_slug(deps.db, prep.slug)!;
    insert_revision(deps.db, fresh_before_commit, author, message);
    bump_notebook_minor(deps.db);
    deps.db.exec('COMMIT');
    const fresh = find_section_by_slug(deps.db, prep.slug)!;
    const embed = new Set(['type', 'parent', 'refs', 'children']);
    const { body: serialized } = serialize_section(deps.db, fresh, embed, unresolved);
    send_response(ctx.res, {
      status: 201,
      body: serialized,
      headers: { Location: `/api/sections/${prep.slug}`, ETag: etag_of(fresh) },
    }, negotiate_accept(ctx.req.headers.accept));
  } catch (error) {
    try {
      deps.db.exec('ROLLBACK');
    } catch (_inner) {
      // already rolled back
    }
    throw error;
  }
};
