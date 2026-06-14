import { etag_of } from './hal.ts';
import type { SectionTypeRow } from './repo-types.ts';
import { parse_property_schema } from './repo-types.ts';

export const serialize_type = (row: SectionTypeRow): Record<string, unknown> => ({
  slug: row.slug,
  name: row.name,
  description: row.description,
  color: row.color,
  property_schema: parse_property_schema(row),
  updated_at: row.updated_at,
  _etag: etag_of(row),
  _links: {
    self: { href: `/api/types/${row.slug}` },
    sections: { href: `/api/types/${row.slug}/sections` },
  },
  _actions: {
    update: {
      method: 'PATCH',
      href: `/api/types/${row.slug}`,
      headers: { 'If-Match': '<_etag>' },
      schema: {
        fields: [
          { key: 'name', type: 'string', required: false },
          { key: 'description', type: 'string', required: false },
          { key: 'color', type: 'string', required: false },
          { key: 'property_schema', type: 'rich', required: false },
        ],
      },
    },
    delete: {
      method: 'DELETE',
      href: `/api/types/${row.slug}`,
      headers: { 'If-Match': '<_etag>' },
    },
  },
});
