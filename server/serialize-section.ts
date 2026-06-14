import type { Database } from './db.ts';
import { etag_of } from './hal.ts';
import { compute_numbering, ancestors_of, type TreeNode } from './lib/numbering.ts';
import { find_section_by_slug, find_section_by_id, list_all_sections, list_children_of } from './repo-sections.ts';
import { find_type_by_slug, parse_property_schema } from './repo-types.ts';
import { list_refs_for, type RefRow } from './repo-refs.ts';
import type { SectionRow } from './repo-sections.ts';
import type { UnresolvedRefEntry } from './refs-sync.ts';
import { section_actions } from './serialize-actions.ts';
import { revision_count } from './repo-revisions.ts';
import { count_open_comments_for_section } from './repo-comments.ts';

const section_to_tree_node = (row: SectionRow): TreeNode => ({
  id: row.id,
  slug: row.slug,
  parent_id: row.parent_id,
  position: row.position,
});

const lean_summary = (db: Database, section: SectionRow, numbers: Map<number, string>): Record<string, unknown> => {
  const type_row = db.prepare('SELECT slug FROM section_types WHERE id = ?').get(section.type_id) as { slug: string };
  const child_count = (db.prepare('SELECT COUNT(*) AS c FROM sections WHERE parent_id = ?').get(section.id) as { c: number }).c;
  const out = (db.prepare('SELECT COUNT(*) AS c FROM refs WHERE from_id = ?').get(section.id) as { c: number }).c;
  const inbound = (db.prepare('SELECT COUNT(*) AS c FROM refs WHERE to_id = ?').get(section.id) as { c: number }).c;
  return {
    slug: section.slug,
    number: numbers.get(section.id) ?? '',
    title: section.title,
    type: type_row.slug,
    tags: JSON.parse(section.tags_json),
    child_count,
    ref_counts: { out, in: inbound },
    _links: { self: { href: `/api/sections/${section.slug}` } },
  };
};

const ref_to_neighbor = (db: Database, ref: RefRow, direction: 'out' | 'in'): Record<string, unknown> => {
  const other_id = direction === 'out' ? ref.to_id : ref.from_id;
  const other = find_section_by_id(db, other_id);
  if (!other) {
    return { role: ref.role, source: ref.source, _links: { self: { href: `/api/refs/${ref.id}` } } };
  }
  const type_row = db.prepare('SELECT slug FROM section_types WHERE id = ?').get(other.type_id) as { slug: string };
  const neighbor_key = direction === 'out' ? 'to' : 'from';
  return {
    [neighbor_key]: { slug: other.slug, title: other.title, type: type_row.slug },
    role: ref.role,
    source: ref.source,
    _links: { self: { href: `/api/refs/${ref.id}` } },
  };
};

export const serialize_section = (
  db: Database,
  section: SectionRow,
  embed: ReadonlySet<string>,
  unresolved: ReadonlyArray<UnresolvedRefEntry>
): { body: Record<string, unknown>; etag: string } => {
  const all_sections = list_all_sections(db);
  const numbers = compute_numbering(all_sections.map(section_to_tree_node));
  const type_row = db.prepare('SELECT * FROM section_types WHERE id = ?').get(section.type_id) as { slug: string; name: string; color: string | null; property_schema_json: string };
  const parent = section.parent_id !== null ? find_section_by_id(db, section.parent_id) : null;
  const body: Record<string, unknown> = {
    slug: section.slug,
    number: numbers.get(section.id) ?? '',
    title: section.title,
    deck: section.deck,
    type: type_row.slug,
    tags: JSON.parse(section.tags_json),
    properties: JSON.parse(section.properties_json),
    html: section.html,
    unresolved_refs: unresolved,
    revision_count: revision_count(db, section.id),
    comment_count: count_open_comments_for_section(db, section.id),
    updated_at: section.updated_at,
    _etag: etag_of(section),
    _links: {
      self: { href: `/api/sections/${section.slug}` },
      type: { href: `/api/types/${type_row.slug}`, title: type_row.name },
      ...(parent ? { parent: { href: `/api/sections/${parent.slug}` } } : {}),
      children: { href: `/api/sections/${section.slug}/children` },
      ancestors: { href: `/api/sections/${section.slug}/ancestors` },
      refs: { href: `/api/sections/${section.slug}/refs` },
      'refs.out': { href: `/api/sections/${section.slug}/refs?dir=out` },
      'refs.in': { href: `/api/sections/${section.slug}/refs?dir=in` },
      revisions: { href: `/api/sections/${section.slug}/revisions` },
      comments: { href: `/api/sections/${section.slug}/comments` },
    },
    _actions: section_actions(section),
  };
  if (embed.size > 0) {
    const embedded: Record<string, unknown> = {};
    if (embed.has('type')) {
      embedded.type = { slug: type_row.slug, name: type_row.name, property_schema: parse_property_schema(type_row as any) };
    }
    if (embed.has('parent') && parent) {
      embedded.parent = { slug: parent.slug, title: parent.title, _links: { self: { href: `/api/sections/${parent.slug}` } } };
    }
    if (embed.has('children')) {
      const children = list_children_of(db, section.id);
      embedded.children = { _embedded: { items: children.map((child) => lean_summary(db, child, numbers)) } };
    }
    if (embed.has('refs')) {
      const { out, inbound } = list_refs_for(db, section.id);
      embedded.refs = {
        out: out.map((ref) => ref_to_neighbor(db, ref, 'out')),
        in: inbound.map((ref) => ref_to_neighbor(db, ref, 'in')),
      };
    }
    if (embed.has('ancestors')) {
      const ancestor_nodes = ancestors_of(all_sections.map(section_to_tree_node), section.id);
      embedded.ancestors = ancestor_nodes.map((node) => {
        const row = find_section_by_id(db, node.id) as SectionRow;
        return lean_summary(db, row, numbers);
      });
    }
    body._embedded = embedded;
  }
  return { body, etag: section.etag };
};

export { lean_summary };
