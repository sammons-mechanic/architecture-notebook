import type { RevisionRow } from './repo-revisions.ts';
import type { SectionRow } from './repo-sections.ts';

export const serialize_revision_summary = (section: SectionRow, row: RevisionRow): Record<string, unknown> => ({
  revision: row.revision,
  author: row.author,
  message: row.message,
  created_at: row.created_at,
  _links: {
    self: { href: `/api/sections/${section.slug}/revisions/${row.revision}` },
    section: { href: `/api/sections/${section.slug}` },
  },
});

export const serialize_revision_full = (section: SectionRow, row: RevisionRow): Record<string, unknown> => ({
  revision: row.revision,
  author: row.author,
  message: row.message,
  created_at: row.created_at,
  title: row.title,
  deck: row.deck,
  html: row.html,
  properties: JSON.parse(row.properties_json),
  tags: JSON.parse(row.tags_json),
  _links: {
    self: { href: `/api/sections/${section.slug}/revisions/${row.revision}` },
    section: { href: `/api/sections/${section.slug}` },
  },
});
