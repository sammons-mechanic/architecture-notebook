import type { Database } from './db.ts';
import { etag_of } from './hal.ts';
import type { RefRow } from './repo-refs.ts';
import { find_section_by_id } from './repo-sections.ts';

export const serialize_ref = (db: Database, row: RefRow): Record<string, unknown> => {
  const from = find_section_by_id(db, row.from_id);
  const is_notebook_ref = row.to_id === null && row.to_notebook !== null;
  if (is_notebook_ref) {
    const to_notebook = row.to_notebook as string;
    return {
      id: row.id,
      from: from?.slug ?? null,
      to: `@${to_notebook}`,
      to_notebook,
      role: row.role,
      source: row.source,
      created_at: row.created_at,
      _etag: etag_of(row),
      _links: {
        self: { href: `/api/refs/${row.id}` },
        ...(from ? { from: { href: `/api/sections/${from.slug}` } } : {}),
        to: { href: `/n/${to_notebook}/api` },
      },
      _actions: {
        delete: {
          method: 'DELETE',
          href: `/api/refs/${row.id}`,
          headers: { 'If-Match': '<_etag>' },
        },
      },
    };
  }
  const to = row.to_id !== null ? find_section_by_id(db, row.to_id) : null;
  return {
    id: row.id,
    from: from?.slug ?? null,
    to: to?.slug ?? null,
    role: row.role,
    source: row.source,
    created_at: row.created_at,
    _etag: etag_of(row),
    _links: {
      self: { href: `/api/refs/${row.id}` },
      ...(from ? { from: { href: `/api/sections/${from.slug}` } } : {}),
      ...(to ? { to: { href: `/api/sections/${to.slug}` } } : {}),
    },
    _actions: {
      delete: {
        method: 'DELETE',
        href: `/api/refs/${row.id}`,
        headers: { 'If-Match': '<_etag>' },
      },
    },
  };
};
