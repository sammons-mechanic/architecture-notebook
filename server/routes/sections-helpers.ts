import type { Deps } from '../lib/types.ts';
import { find_type_by_slug, parse_property_schema } from '../repo-types.ts';
import { build_validate_deps } from '../validate-deps.ts';
import { validate_properties, validate_top_level } from '../lib/validate.ts';
import { is_failure, make_failure, type Failure } from '../lib/failure.ts';
import { is_valid_slug, slug_from_title, next_unique_slug } from '../lib/slug.ts';
import { find_section_by_slug } from '../repo-sections.ts';

export const allowed_section_create_keys = ['type', 'parent', 'title', 'deck', 'tags', 'html', 'properties', 'slug', 'revision_message'];
export const allowed_section_patch_keys = ['title', 'deck', 'tags', 'html', 'properties', 'type', 'revision_message'];

export type CreatePrep = {
  type_id: number;
  type_slug: string;
  schema_fields_count: number;
  parent_id: number | null;
  validated_properties: Record<string, unknown>;
  unresolved_properties: Array<{ slug: string; source: 'property'; field: string; notebook?: string }>;
  slug: string;
  title: string;
  deck: string | null;
  tags: string[];
  html: string;
};

export const prepare_section_create = (deps: Deps, body: Record<string, unknown>): CreatePrep | Failure => {
  const top = validate_top_level(body, allowed_section_create_keys);
  if (is_failure(top)) {
    return top;
  }
  if (typeof body.type !== 'string') {
    return make_failure('validation', 'type is required', { errors: [{ field: 'type', code: 'validation', message: 'type is required' }] });
  }
  const type_row = find_type_by_slug(deps.db, body.type);
  if (!type_row) {
    return make_failure('validation', `Type ${JSON.stringify(body.type)} does not exist`, {
      errors: [{ field: 'type', code: 'ref-unresolved', message: `No type with slug ${JSON.stringify(body.type)} exists`, hint: '/api/types' }],
    });
  }
  if (typeof body.title !== 'string' || body.title.length === 0) {
    return make_failure('validation', 'title is required', { errors: [{ field: 'title', code: 'validation', message: 'title is required' }] });
  }
  let parent_id: number | null = null;
  if (body.parent !== undefined && body.parent !== null) {
    if (typeof body.parent !== 'string') {
      return make_failure('validation', 'parent must be a slug', { errors: [{ field: 'parent', code: 'validation', message: 'parent must be a string slug' }] });
    }
    const parent_row = find_section_by_slug(deps.db, body.parent);
    if (!parent_row) {
      return make_failure('validation', `Parent ${JSON.stringify(body.parent)} not found`, { errors: [{ field: 'parent', code: 'ref-unresolved', message: `No section with slug ${JSON.stringify(body.parent)} exists`, hint: `/api/search?q=${encodeURIComponent(body.parent)}` }] });
    }
    parent_id = parent_row.id;
  }
  const schema = parse_property_schema(type_row);
  const validate_deps = build_validate_deps(deps.db, deps.root_doc, deps.get_peer_db);
  const property_input = (body.properties as Record<string, unknown>) ?? {};
  const validated_props = validate_properties(schema, property_input, validate_deps, 'create');
  if (is_failure(validated_props)) {
    return validated_props;
  }
  const slug_base = typeof body.slug === 'string' ? body.slug : slug_from_title(body.title);
  if (!is_valid_slug(slug_base)) {
    return make_failure('slug-invalid', 'Slug invalid', { errors: [{ field: 'slug', code: 'slug-invalid', message: `Slug ${JSON.stringify(slug_base)} must match ^[a-z0-9-]+$` }] });
  }
  const exists = (candidate: string) => find_section_by_slug(deps.db, candidate) !== null;
  const slug = typeof body.slug === 'string' ? slug_base : next_unique_slug(slug_base, exists);
  if (typeof body.slug === 'string' && exists(slug)) {
    return make_failure('slug-conflict', `Slug ${JSON.stringify(slug)} already exists`, { errors: [{ field: 'slug', code: 'slug-conflict', message: `Slug ${JSON.stringify(slug)} already exists` }] });
  }
  const tags = Array.isArray(body.tags) ? (body.tags.filter((entry): entry is string => typeof entry === 'string')) : [];
  return {
    type_id: type_row.id,
    type_slug: type_row.slug,
    schema_fields_count: schema.fields.length,
    parent_id,
    validated_properties: validated_props.values,
    unresolved_properties: validated_props.unresolved,
    slug,
    title: body.title,
    deck: typeof body.deck === 'string' ? body.deck : null,
    tags,
    html: typeof body.html === 'string' ? body.html : '',
  };
};
