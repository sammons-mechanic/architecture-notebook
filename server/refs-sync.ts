import type { Database } from './db.ts';
import { scan_html_refs } from './lib/links.ts';
import { parse_notebook_ref } from './lib/slug.ts';
import { find_section_by_slug } from './repo-sections.ts';
import { delete_scanned_refs, insert_ref, insert_notebook_ref, find_existing_ref, find_existing_notebook_ref } from './repo-refs.ts';
import { is_failure, type Failure } from './lib/failure.ts';
import type { PropertySchema } from './lib/validate-schemas.ts';

export type UnresolvedRefEntry = {
  // Local entries carry `slug` (and possibly `role` or `field`).
  // Notebook-unit cross-refs carry `notebook` and no `slug` — the target
  // is the notebook itself, not any section inside it.
  readonly slug?: string;
  readonly source: 'html' | 'property';
  readonly field?: string;
  readonly role?: string;
  readonly notebook?: string;
};

export type PeerLookup = (notebook_slug: string) => Database | null;

export const sync_section_refs = (
  db: Database,
  from_id: number,
  html: string,
  properties: Record<string, unknown>,
  schema: PropertySchema,
  peer_lookup?: PeerLookup,
): { unresolved: UnresolvedRefEntry[] } | Failure => {
  const html_refs = scan_html_refs(html);
  if (is_failure(html_refs)) {
    return html_refs;
  }
  const property_refs: Array<{ to: string; role: string; source: 'property' }> = [];
  for (const field of schema.fields) {
    const value = properties[field.key];
    if (field.type === 'ref' && typeof value === 'string') {
      property_refs.push({ to: value, role: field.key, source: 'property' });
    } else if (field.type === 'multi-ref' && Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          property_refs.push({ to: entry, role: field.key, source: 'property' });
        }
      }
    }
  }
  delete_scanned_refs(db, from_id);
  const unresolved: UnresolvedRefEntry[] = [];
  for (const ref of html_refs) {
    const notebook = parse_notebook_ref(ref.to);
    if (notebook) {
      // Notebook-unit ref: check the target notebook exists. We don't
      // care about its internal sections.
      const peer_exists = peer_lookup ? peer_lookup(notebook.notebook) !== null : false;
      if (!peer_exists) {
        unresolved.push({
          notebook: notebook.notebook,
          source: 'html',
          ...(ref.role ? { role: ref.role } : {}),
        });
        continue;
      }
      if (find_existing_notebook_ref(db, from_id, notebook.notebook, ref.role, 'html')) {
        continue;
      }
      insert_notebook_ref(db, {
        from_id,
        to_notebook: notebook.notebook,
        role: ref.role,
        source: 'html',
      });
      continue;
    }
    const target = find_section_by_slug(db, ref.to);
    if (!target) {
      unresolved.push({ slug: ref.to, source: 'html', ...(ref.role ? { role: ref.role } : {}) });
      continue;
    }
    if (find_existing_ref(db, from_id, target.id, ref.role, 'html')) {
      continue;
    }
    insert_ref(db, { from_id, to_id: target.id, role: ref.role, source: 'html' });
  }
  for (const ref of property_refs) {
    const notebook = parse_notebook_ref(ref.to);
    if (notebook) {
      const peer_exists = peer_lookup ? peer_lookup(notebook.notebook) !== null : false;
      if (!peer_exists) {
        unresolved.push({
          notebook: notebook.notebook,
          source: 'property',
          field: ref.role,
        });
        continue;
      }
      if (find_existing_notebook_ref(db, from_id, notebook.notebook, ref.role, 'property')) {
        continue;
      }
      insert_notebook_ref(db, {
        from_id,
        to_notebook: notebook.notebook,
        role: ref.role,
        source: 'property',
      });
      continue;
    }
    const target = find_section_by_slug(db, ref.to);
    if (!target) {
      unresolved.push({ slug: ref.to, source: 'property', field: ref.role });
      continue;
    }
    if (find_existing_ref(db, from_id, target.id, ref.role, 'property')) {
      continue;
    }
    insert_ref(db, { from_id, to_id: target.id, role: ref.role, source: 'property' });
  }
  return { unresolved };
};

export const persist_unresolved_refs = (
  db: Database,
  section_id: number,
  entries: ReadonlyArray<UnresolvedRefEntry>
): void => {
  db.prepare('UPDATE sections SET unresolved_refs_json = ? WHERE id = ?')
    .run(JSON.stringify(entries), section_id);
};

export const load_unresolved_refs = (
  db: Database,
  section_id: number
): UnresolvedRefEntry[] => {
  const row = db.prepare('SELECT unresolved_refs_json FROM sections WHERE id = ?')
    .get(section_id) as { unresolved_refs_json: string } | undefined;
  if (!row) return [];
  return JSON.parse(row.unresolved_refs_json) as UnresolvedRefEntry[];
};

// Before a section is deleted (alongside its cascade-doomed descendants),
// inbound html/property refs from sections OUTSIDE the doomed set still
// point at slugs that are about to vanish. The cascade kills the refs
// table rows but leaves the source's html/properties unchanged. Surface
// the loss by appending the doomed slug to each surviving source's
// unresolved_refs, mirroring the same shape sync_section_refs writes.
export const surface_unresolved_on_delete = (db: Database, doomed_ids: ReadonlyArray<number>): void => {
  if (doomed_ids.length === 0) return;
  const doomed_set = new Set(doomed_ids);
  const select_inbound = db.prepare(
    "SELECT from_id, role, source FROM refs WHERE to_id = ? AND source IN ('html', 'property')"
  );
  const select_section = db.prepare('SELECT slug, unresolved_refs_json FROM sections WHERE id = ?');
  const update_unresolved = db.prepare('UPDATE sections SET unresolved_refs_json = ? WHERE id = ?');
  for (const doomed_id of doomed_ids) {
    const target = select_section.get(doomed_id) as { slug: string; unresolved_refs_json: string } | undefined;
    if (!target) continue;
    const inbound = select_inbound.all(doomed_id) as Array<{ from_id: number; role: string | null; source: 'html' | 'property' }>;
    for (const ref of inbound) {
      if (doomed_set.has(ref.from_id)) continue;
      const source_row = select_section.get(ref.from_id) as { slug: string; unresolved_refs_json: string } | undefined;
      if (!source_row) continue;
      const entries = JSON.parse(source_row.unresolved_refs_json) as UnresolvedRefEntry[];
      const new_entry: UnresolvedRefEntry = ref.source === 'html'
        ? { slug: target.slug, source: 'html', ...(ref.role ? { role: ref.role } : {}) }
        : { slug: target.slug, source: 'property', field: ref.role ?? '' };
      const new_role_or_field = new_entry.source === 'html' ? (new_entry.role ?? null) : (new_entry.field ?? null);
      const duplicate = entries.some((existing) => {
        if (existing.slug !== new_entry.slug || existing.source !== new_entry.source) return false;
        const existing_role_or_field = existing.source === 'html' ? (existing.role ?? null) : (existing.field ?? null);
        return existing_role_or_field === new_role_or_field;
      });
      if (duplicate) continue;
      entries.push(new_entry);
      update_unresolved.run(JSON.stringify(entries), ref.from_id);
    }
  }
};

// One-shot backfill: sections written before migration 004 carry the
// default unresolved_refs_json='[]' even when their html has unresolved
// arch-ref tags. Walk every section through sync_section_refs to
// recompute the honest list, then persist. Idempotent on already-current
// data (the UNIQUE constraint on refs short-circuits duplicates and
// sync rewrites the column with the freshly computed list). Guarded by
// a meta flag so it runs once per database.
export const backfill_unresolved_refs = (db: Database, peer_lookup?: PeerLookup): boolean => {
  const flag = db.prepare("SELECT value FROM meta WHERE key = 'unresolved_refs_backfilled'").get() as { value: string } | undefined;
  if (flag && flag.value === 'true') return false;
  const rows = db.prepare('SELECT id, type_id, html, properties_json FROM sections').all() as Array<{ id: number; type_id: number; html: string; properties_json: string }>;
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const type = db.prepare('SELECT property_schema_json FROM section_types WHERE id = ?').get(row.type_id) as { property_schema_json: string } | undefined;
      if (!type) continue;
      const schema = JSON.parse(type.property_schema_json) as PropertySchema;
      const properties = JSON.parse(row.properties_json) as Record<string, unknown>;
      const result = sync_section_refs(db, row.id, row.html, properties, schema, peer_lookup);
      if (is_failure(result)) continue;
      persist_unresolved_refs(db, row.id, result.unresolved);
    }
    db.prepare("INSERT INTO meta(key, value) VALUES('unresolved_refs_backfilled', 'true') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
};

// When a section with `slug` is newly created (or any cross-batch event
// makes the slug newly resolvable), find every section whose persisted
// unresolved_refs name this slug and convert those entries to real ref
// edges. Idempotent: re-running over already-resolved entries is a no-op.
export const re_resolve_for_slug = (db: Database, slug: string): void => {
  const target = find_section_by_slug(db, slug);
  if (!target) return;
  const rows = db.prepare(
    'SELECT id, unresolved_refs_json FROM sections WHERE unresolved_refs_json LIKE ?'
  ).all(`%"${slug}"%`) as Array<{ id: number; unresolved_refs_json: string }>;
  for (const row of rows) {
    if (row.id === target.id) continue;
    const entries = JSON.parse(row.unresolved_refs_json) as UnresolvedRefEntry[];
    const remaining: UnresolvedRefEntry[] = [];
    let changed = false;
    for (const entry of entries) {
      if (entry.slug !== slug) {
        remaining.push(entry);
        continue;
      }
      const role = entry.source === 'html' ? (entry.role ?? null) : (entry.field ?? null);
      if (!find_existing_ref(db, row.id, target.id, role, entry.source)) {
        insert_ref(db, { from_id: row.id, to_id: target.id, role, source: entry.source });
      }
      changed = true;
    }
    if (changed) {
      db.prepare('UPDATE sections SET unresolved_refs_json = ? WHERE id = ?')
        .run(JSON.stringify(remaining), row.id);
    }
  }
};
