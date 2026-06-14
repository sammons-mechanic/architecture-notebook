import type { Deps } from './lib/types.ts';
import type { OpResult } from './batch-op-runner.ts';
import { is_failure } from './lib/failure.ts';
import { build_problem } from './problem.ts';
import { is_valid_slug } from './lib/slug.ts';
import { find_type_by_slug, insert_type } from './repo-types.ts';
import { find_section_by_slug, insert_section, next_position_under } from './repo-sections.ts';
import { insert_ref, find_existing_ref } from './repo-refs.ts';
import { prepare_section_create } from './routes/sections-helpers.ts';
import { serialize_type } from './serialize-type.ts';
import { serialize_section } from './serialize-section.ts';
import { serialize_ref } from './serialize-ref.ts';
import { sync_section_refs, persist_unresolved_refs, re_resolve_for_slug } from './refs-sync.ts';
import { parse_property_schema } from './repo-types.ts';
import { stamp_anchors } from './lib/links.ts';

export const run_op_types = (deps: Deps, body: Record<string, unknown>): OpResult => {
  if (typeof body.slug !== 'string' || !is_valid_slug(body.slug)) {
    return { status: 422, body: build_problem('slug-invalid', 422, 'Type slug invalid', deps.req_path), tokens: null };
  }
  if (typeof body.name !== 'string' || body.name.length === 0) {
    return { status: 422, body: build_problem('validation', 422, 'name required', deps.req_path, { errors: [{ field: 'name', code: 'validation', message: 'name required' }] }), tokens: null };
  }
  if (find_type_by_slug(deps.db, body.slug)) {
    return { status: 409, body: build_problem('slug-conflict', 409, `Type ${body.slug} already exists`, deps.req_path), tokens: null };
  }
  const schema = (body.property_schema as { fields?: unknown }) ?? { fields: [] };
  if (!schema.fields || !Array.isArray(schema.fields)) {
    return { status: 422, body: build_problem('validation', 422, 'property_schema.fields required', deps.req_path), tokens: null };
  }
  const inserted = insert_type(deps.db, {
    slug: body.slug,
    name: body.name,
    description: typeof body.description === 'string' ? body.description : null,
    color: typeof body.color === 'string' ? body.color : null,
    property_schema: schema as { fields: [] },
  });
  return { status: 201, body: serialize_type(inserted), tokens: { slug: inserted.slug, id: inserted.id } };
};

export const run_op_sections = (deps: Deps, body: Record<string, unknown>): OpResult => {
  const prep = prepare_section_create(deps, body);
  if (is_failure(prep)) {
    const status = prep.code === 'slug-conflict' ? 409 : 422;
    return { status, body: build_problem(prep.code, status, prep.message, deps.req_path, { errors: prep.errors, ...(prep.hint ? { hint: prep.hint } : {}) }), tokens: null };
  }
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
  const type_row = find_type_by_slug(deps.db, prep.type_slug)!;
  const schema = parse_property_schema(type_row);
  const sync = sync_section_refs(deps.db, inserted.id, stamped_html, prep.validated_properties, schema, deps.get_peer_db);
  if (is_failure(sync)) {
    return { status: 422, body: build_problem(sync.code, 422, sync.message, deps.req_path, { errors: sync.errors }), tokens: null };
  }
  const unresolved = [...prep.unresolved_properties, ...sync.unresolved];
  persist_unresolved_refs(deps.db, inserted.id, unresolved);
  re_resolve_for_slug(deps.db, inserted.slug);
  const fresh = find_section_by_slug(deps.db, inserted.slug)!;
  const { body: serialized } = serialize_section(deps.db, fresh, new Set(), unresolved);
  return { status: 201, body: serialized, tokens: { slug: fresh.slug, id: fresh.id } };
};

export const run_op_refs = (deps: Deps, body: Record<string, unknown>): OpResult => {
  if (typeof body.from !== 'string') {
    return { status: 422, body: build_problem('validation', 422, 'from required', deps.req_path), tokens: null };
  }
  if (typeof body.to !== 'string') {
    return { status: 422, body: build_problem('validation', 422, 'to required', deps.req_path), tokens: null };
  }
  const from_row = find_section_by_slug(deps.db, body.from);
  if (!from_row) {
    return { status: 422, body: build_problem('validation', 422, 'from section missing', deps.req_path, { errors: [{ field: 'from', code: 'ref-unresolved', message: `No section ${body.from}`, hint: `/api/search?q=${encodeURIComponent(body.from)}` }] }), tokens: null };
  }
  const to_row = find_section_by_slug(deps.db, body.to);
  if (!to_row) {
    return { status: 422, body: build_problem('validation', 422, 'to section missing', deps.req_path, { errors: [{ field: 'to', code: 'ref-unresolved', message: `No section ${body.to}`, hint: `/api/search?q=${encodeURIComponent(body.to)}` }] }), tokens: null };
  }
  const role = typeof body.role === 'string' ? body.role : null;
  const existing = find_existing_ref(deps.db, from_row.id, to_row.id, role, 'manual');
  if (existing) {
    return { status: 200, body: serialize_ref(deps.db, existing), tokens: { id: existing.id } };
  }
  const row = insert_ref(deps.db, { from_id: from_row.id, to_id: to_row.id, role, source: 'manual' });
  return { status: 201, body: serialize_ref(deps.db, row), tokens: { id: row.id } };
};
