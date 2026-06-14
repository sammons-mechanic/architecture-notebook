import type { Deps } from './lib/types.ts';
import type { BatchOp } from './lib/batch-deps.ts';
import type { OpResult } from './batch-op-runner.ts';
import { is_failure } from './lib/failure.ts';
import { build_problem } from './problem.ts';
import { check_if_match } from './hal.ts';
import { validate_revision_message } from './lib/author.ts';
import { validate_top_level, validate_properties, merge_properties } from './lib/validate.ts';
import { allowed_section_patch_keys } from './routes/sections-helpers.ts';
import { build_validate_deps } from './validate-deps.ts';
import { find_section_by_slug, find_section_by_id, update_section } from './repo-sections.ts';
import { find_type_by_slug, parse_property_schema, update_type } from './repo-types.ts';
import { find_comment_by_id, update_comment } from './repo-comments.ts';
import { insert_revision } from './repo-revisions.ts';
import { sync_section_refs, persist_unresolved_refs } from './refs-sync.ts';
import { stamp_anchors } from './lib/links.ts';
import { serialize_section } from './serialize-section.ts';
import { serialize_type } from './serialize-type.ts';
import { serialize_comment } from './serialize-comment.ts';
import { validate_body_field, validate_resolved_field } from './routes/comments-validate.ts';

const problem = (deps: Deps, status: number, code: string, message: string, extras: Record<string, unknown> = {}): OpResult =>
  ({ status, body: build_problem(code, status, message, deps.req_path, extras), tokens: null });

const fail_with_errors = (deps: Deps, status: number, f: { code: string; message: string; errors?: ReadonlyArray<{ field: string; code: string; message: string; hint?: string }> }): OpResult =>
  ({ status, body: build_problem(f.code, status, f.message, deps.req_path, f.errors ? { errors: f.errors } : {}), tokens: null });

const if_match_guard = (deps: Deps, op_if_match: string | undefined, row_etag: string): OpResult | null => {
  const m = check_if_match(op_if_match, row_etag);
  if (m.kind === 'missing') return problem(deps, 428, 'precondition-required', 'If-Match required');
  if (m.kind === 'mismatch') return problem(deps, 412, 'etag-mismatch', 'ETag mismatch', { current_etag: `W/"${row_etag}"` });
  return null;
};

export const run_patch_section = (deps: Deps, op: BatchOp, body: Record<string, unknown>, slug: string, author: string | null): OpResult => {
  const row = find_section_by_slug(deps.db, slug);
  if (!row) return problem(deps, 404, 'not-found', `Section ${slug} not found`);
  const guard = if_match_guard(deps, op.if_match, row.etag);
  if (guard) return guard;
  const top = validate_top_level(body, allowed_section_patch_keys);
  if (is_failure(top)) return fail_with_errors(deps, 422, top);
  const msg_check = validate_revision_message(body.revision_message);
  if (is_failure(msg_check)) return fail_with_errors(deps, 422, msg_check);
  const message = typeof msg_check === 'string' ? msg_check : null;
  const type_slug = (deps.db.prepare('SELECT slug FROM section_types WHERE id = ?').get(row.type_id) as { slug: string }).slug;
  const type_row = find_type_by_slug(deps.db, type_slug)!;
  const schema = parse_property_schema(type_row);
  const validate_deps = build_validate_deps(deps.db, deps.root_doc, deps.get_peer_db);
  let next_props = JSON.parse(row.properties_json) as Record<string, unknown>;
  let unresolved_props: Array<{ slug: string; source: 'property'; field: string; notebook?: string }> = [];
  if (body.properties !== undefined) {
    const validated = validate_properties(schema, body.properties as Record<string, unknown>, validate_deps, 'patch');
    if (is_failure(validated)) return fail_with_errors(deps, 422, validated);
    next_props = merge_properties(next_props, validated.values);
    unresolved_props = validated.unresolved;
  }
  const next_html = stamp_anchors(typeof body.html === 'string' ? body.html : row.html);
  const next_tags = Array.isArray(body.tags) ? body.tags.filter((entry): entry is string => typeof entry === 'string') : JSON.parse(row.tags_json);
  update_section(deps.db, row.id, {
    title: typeof body.title === 'string' ? body.title : undefined,
    deck: body.deck === undefined ? undefined : (typeof body.deck === 'string' ? body.deck : null),
    properties: next_props, tags: next_tags, html: next_html,
  });
  const sync = sync_section_refs(deps.db, row.id, next_html, next_props, schema, deps.get_peer_db);
  if (is_failure(sync)) return fail_with_errors(deps, 422, sync);
  const unresolved = [...unresolved_props, ...sync.unresolved];
  persist_unresolved_refs(deps.db, row.id, unresolved);
  const post = find_section_by_slug(deps.db, slug)!;
  insert_revision(deps.db, post, author, message);
  const { body: serialized } = serialize_section(deps.db, post, new Set(), unresolved);
  return { status: 200, body: serialized, tokens: { slug: post.slug, id: post.id } };
};

export const run_patch_comment = (deps: Deps, op: BatchOp, body: Record<string, unknown>, id: number): OpResult => {
  const row = find_comment_by_id(deps.db, id);
  if (!row) return problem(deps, 404, 'not-found', `Comment ${id} not found`);
  const guard = if_match_guard(deps, op.if_match, row.etag);
  if (guard) return guard;
  const body_text = validate_body_field(body.body, false);
  if (is_failure(body_text)) return fail_with_errors(deps, 422, body_text);
  const resolved = validate_resolved_field(body.resolved);
  if (is_failure(resolved)) return fail_with_errors(deps, 422, resolved);
  const next = update_comment(deps.db, row.id, { body: body_text as string | undefined, resolved });
  const section = find_section_by_id(deps.db, next.section_id)!;
  return { status: 200, body: serialize_comment(section, next), tokens: { id: next.id } };
};

export const run_patch_type = (deps: Deps, op: BatchOp, body: Record<string, unknown>, slug: string): OpResult => {
  const row = find_type_by_slug(deps.db, slug);
  if (!row) return problem(deps, 404, 'not-found', `Type ${slug} not found`);
  const guard = if_match_guard(deps, op.if_match, row.etag);
  if (guard) return guard;
  update_type(deps.db, row.id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    description: body.description === undefined ? undefined : (body.description as string | null),
    color: body.color === undefined ? undefined : (body.color as string | null),
    property_schema: body.property_schema ? (body.property_schema as { fields: [] }) : undefined,
  });
  const next = find_type_by_slug(deps.db, slug)!;
  return { status: 200, body: serialize_type(next), tokens: { slug: next.slug, id: next.id } };
};
