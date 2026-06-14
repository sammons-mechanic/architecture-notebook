import type { Database } from './db.ts';
import { find_type_by_slug, parse_property_schema } from './repo-types.ts';
import { find_section_by_slug } from './repo-sections.ts';
import type { ValidateDeps, RootDoc } from './lib/types.ts';

export type PeerLookup = (notebook_slug: string) => Database | null;

export const build_validate_deps = (
  db: Database,
  root_doc: RootDoc,
  get_peer_db?: PeerLookup,
): ValidateDeps => ({
  root_doc,
  resolve_section_slug: (slug) => find_section_by_slug(db, slug) !== null,
  resolve_section_type_slug: (section_slug) => {
    const section = find_section_by_slug(db, section_slug);
    if (!section) {
      return null;
    }
    const type_row = (db.prepare('SELECT slug FROM section_types WHERE id = ?').get(section.type_id) as { slug: string } | undefined);
    return type_row?.slug ?? null;
  },
  resolve_type_schema: (type_slug) => {
    const type_row = find_type_by_slug(db, type_slug);
    return type_row ? parse_property_schema(type_row) : null;
  },
  resolve_notebook: (notebook) => {
    if (!get_peer_db) return false;
    return get_peer_db(notebook) !== null;
  },
});
