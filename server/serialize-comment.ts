import { etag_of } from './hal.ts';
import type { CommentRow } from './repo-comments.ts';
import type { SectionRow } from './repo-sections.ts';

const comment_actions = (id: number) => ({
  update: {
    method: 'PATCH',
    href: `/api/comments/${id}`,
    headers: { 'If-Match': '<_etag>' },
    schema: {
      fields: [
        { key: 'body', type: 'string', required: false },
        { key: 'resolved', type: 'boolean', required: false },
      ],
    },
  },
  delete: {
    method: 'DELETE',
    href: `/api/comments/${id}`,
    headers: { 'If-Match': '<_etag>' },
  },
});

export const serialize_comment = (section: SectionRow, row: CommentRow): Record<string, unknown> => ({
  id: row.id,
  section_slug: section.slug,
  anchor: row.anchor,
  body: row.body,
  author: row.author,
  resolved: row.resolved === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
  _etag: etag_of(row),
  _links: {
    self: { href: `/api/comments/${row.id}` },
    section: { href: `/api/sections/${section.slug}` },
  },
  _actions: comment_actions(row.id),
});

export const collection_comment_create_action = (section_slug: string) => ({
  create: {
    method: 'POST',
    href: `/api/sections/${section_slug}/comments`,
    title: 'Create a comment on this section',
    schema: {
      fields: [
        { key: 'body', type: 'string', required: true },
        { key: 'anchor', type: 'string', required: false, placeholder: 'section' },
      ],
    },
  },
});
