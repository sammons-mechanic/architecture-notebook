import type { Database } from './db.ts';
import { fresh_etag } from './hal.ts';

export type SectionRow = {
  id: number;
  slug: string;
  type_id: number;
  parent_id: number | null;
  title: string;
  deck: string | null;
  position: number;
  properties_json: string;
  tags_json: string;
  html: string;
  etag: string;
  created_at: number;
  updated_at: number;
};

export const find_section_by_slug = (db: Database, slug: string): SectionRow | null =>
  (db.prepare('SELECT * FROM sections WHERE slug = ?').get(slug) as SectionRow | undefined) ?? null;

export const find_section_by_id = (db: Database, id: number): SectionRow | null =>
  (db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow | undefined) ?? null;

export const list_all_sections = (db: Database): SectionRow[] =>
  db.prepare('SELECT * FROM sections ORDER BY id ASC').all() as SectionRow[];

export const list_root_sections = (db: Database): SectionRow[] =>
  db.prepare('SELECT * FROM sections WHERE parent_id IS NULL ORDER BY position ASC, id ASC').all() as SectionRow[];

export const list_children_of = (db: Database, parent_id: number): SectionRow[] =>
  db.prepare('SELECT * FROM sections WHERE parent_id = ? ORDER BY position ASC, id ASC').all(parent_id) as SectionRow[];

export const insert_section = (
  db: Database,
  data: { slug: string; type_id: number; parent_id: number | null; title: string; deck: string | null; position: number; properties: Record<string, unknown>; tags: string[]; html: string }
): SectionRow => {
  const etag = fresh_etag();
  db.prepare(
    'INSERT INTO sections(slug, type_id, parent_id, title, deck, position, properties_json, tags_json, html, etag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    data.slug,
    data.type_id,
    data.parent_id,
    data.title,
    data.deck,
    data.position,
    JSON.stringify(data.properties),
    JSON.stringify(data.tags),
    data.html,
    etag,
  );
  return find_section_by_slug(db, data.slug) as SectionRow;
};

export const update_section = (
  db: Database,
  id: number,
  patch: { title?: string; deck?: string | null; parent_id?: number | null; position?: number; properties?: Record<string, unknown>; tags?: string[]; html?: string; type_id?: number }
): SectionRow => {
  const etag = fresh_etag();
  const existing = db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow;
  db.prepare(
    'UPDATE sections SET title = ?, deck = ?, parent_id = ?, position = ?, properties_json = ?, tags_json = ?, html = ?, type_id = ?, etag = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(
    patch.title ?? existing.title,
    patch.deck === undefined ? existing.deck : patch.deck,
    patch.parent_id === undefined ? existing.parent_id : patch.parent_id,
    patch.position ?? existing.position,
    patch.properties ? JSON.stringify(patch.properties) : existing.properties_json,
    patch.tags ? JSON.stringify(patch.tags) : existing.tags_json,
    patch.html === undefined ? existing.html : patch.html,
    patch.type_id ?? existing.type_id,
    etag,
    id,
  );
  return db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow;
};

export const delete_section = (db: Database, id: number): void => {
  db.prepare('DELETE FROM sections WHERE id = ?').run(id);
};

export const next_position_under = (db: Database, parent_id: number | null): number => {
  const row = parent_id === null
    ? db.prepare('SELECT COALESCE(MAX(position), -1) AS pos FROM sections WHERE parent_id IS NULL').get() as { pos: number }
    : db.prepare('SELECT COALESCE(MAX(position), -1) AS pos FROM sections WHERE parent_id = ?').get(parent_id) as { pos: number };
  return row.pos + 1;
};
