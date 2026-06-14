import type { Database } from './db.ts';
import type { SectionRow } from './repo-sections.ts';

export type RevisionRow = {
  id: number;
  section_id: number;
  revision: number;
  title: string;
  deck: string | null;
  html: string;
  properties_json: string;
  tags_json: string;
  author: string | null;
  message: string | null;
  created_at: number;
};

export const revision_count = (db: Database, section_id: number): number => {
  const row = db.prepare('SELECT COUNT(*) AS n FROM revisions WHERE section_id = ?').get(section_id) as { n: number };
  return row.n;
};

export const next_revision_number = (db: Database, section_id: number): number => {
  const row = db.prepare('SELECT COALESCE(MAX(revision), 0) AS n FROM revisions WHERE section_id = ?').get(section_id) as { n: number };
  return row.n + 1;
};

export const insert_revision = (
  db: Database,
  section: SectionRow,
  author: string | null,
  message: string | null,
): RevisionRow => {
  const revision = next_revision_number(db, section.id);
  db.prepare(
    'INSERT INTO revisions(section_id, revision, title, deck, html, properties_json, tags_json, author, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(section.id, revision, section.title, section.deck, section.html, section.properties_json, section.tags_json, author, message);
  return db.prepare('SELECT * FROM revisions WHERE section_id = ? AND revision = ?').get(section.id, revision) as RevisionRow;
};

export const list_revisions = (db: Database, section_id: number): RevisionRow[] =>
  db.prepare('SELECT * FROM revisions WHERE section_id = ? ORDER BY revision DESC').all(section_id) as RevisionRow[];

export const find_revision = (db: Database, section_id: number, revision: number): RevisionRow | null =>
  (db.prepare('SELECT * FROM revisions WHERE section_id = ? AND revision = ?').get(section_id, revision) as RevisionRow | undefined) ?? null;
