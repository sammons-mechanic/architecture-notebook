import type { Database } from './db.ts';
import { fresh_etag } from './hal.ts';
import type { PropertySchema } from './lib/validate-schemas.ts';

export type SectionTypeRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  property_schema_json: string;
  etag: string;
  created_at: number;
  updated_at: number;
};

export const find_type_by_slug = (db: Database, slug: string): SectionTypeRow | null =>
  (db.prepare('SELECT * FROM section_types WHERE slug = ?').get(slug) as SectionTypeRow | undefined) ?? null;

export const list_types = (db: Database): SectionTypeRow[] =>
  db.prepare('SELECT * FROM section_types ORDER BY slug ASC').all() as SectionTypeRow[];

export const insert_type = (
  db: Database,
  data: { slug: string; name: string; description?: string | null; color?: string | null; property_schema: PropertySchema }
): SectionTypeRow => {
  const etag = fresh_etag();
  const info = db.prepare(
    'INSERT INTO section_types(slug, name, description, color, property_schema_json, etag) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.slug, data.name, data.description ?? null, data.color ?? null, JSON.stringify(data.property_schema), etag);
  return find_type_by_slug(db, data.slug) as SectionTypeRow;
};

export const update_type = (
  db: Database,
  id: number,
  patch: { name?: string; description?: string | null; color?: string | null; property_schema?: PropertySchema }
): SectionTypeRow => {
  const etag = fresh_etag();
  const existing = db.prepare('SELECT * FROM section_types WHERE id = ?').get(id) as SectionTypeRow;
  const next_schema = patch.property_schema ? JSON.stringify(patch.property_schema) : existing.property_schema_json;
  db.prepare(
    'UPDATE section_types SET name = ?, description = ?, color = ?, property_schema_json = ?, etag = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(
    patch.name ?? existing.name,
    patch.description === undefined ? existing.description : patch.description,
    patch.color === undefined ? existing.color : patch.color,
    next_schema,
    etag,
    id,
  );
  return db.prepare('SELECT * FROM section_types WHERE id = ?').get(id) as SectionTypeRow;
};

export const parse_property_schema = (row: SectionTypeRow): PropertySchema => {
  return JSON.parse(row.property_schema_json) as PropertySchema;
};

export const count_sections_of_type = (db: Database, type_id: number): number => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM sections WHERE type_id = ?').get(type_id) as { count: number };
  return row.count;
};

export const delete_type = (db: Database, id: number): void => {
  db.prepare('DELETE FROM section_types WHERE id = ?').run(id);
};
