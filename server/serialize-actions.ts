import type { SectionRow } from './repo-sections.ts';

export const section_actions = (section: SectionRow): Record<string, unknown> => ({
  update: {
    method: 'PATCH',
    href: `/api/sections/${section.slug}`,
    headers: { 'If-Match': '<_etag>' },
    schema_ref: '$.type.property_schema',
  },
  move: {
    method: 'POST',
    href: `/api/sections/${section.slug}/move`,
    headers: { 'If-Match': '<_etag>' },
    schema: {
      fields: [
        { key: 'parent', type: 'ref', required: false },
        { key: 'position', type: 'number', required: false },
      ],
    },
  },
  delete: {
    method: 'DELETE',
    href: `/api/sections/${section.slug}`,
    headers: { 'If-Match': '<_etag>' },
  },
  'add-child': {
    method: 'POST',
    href: '/api/sections',
    title: 'Create a child under this section',
    body_preset: { parent: section.slug },
    schema_ref: '/api/types/{type}#/property_schema',
  },
  'add-ref': {
    method: 'POST',
    href: '/api/refs',
    body_preset: { from: section.slug },
    schema: {
      fields: [
        { key: 'to', type: 'ref', required: true },
        { key: 'role', type: 'string', required: false },
      ],
    },
  },
});

export const collection_section_create_action = {
  create: {
    method: 'POST',
    href: '/api/sections',
    title: 'Create a section',
    schema_ref: '/api/types/{type}#/property_schema',
    schema: {
      fields: [
        { key: 'type', type: 'ref', refType: '_type', required: true },
        { key: 'parent', type: 'ref', required: false },
        { key: 'title', type: 'string', required: true },
        { key: 'deck', type: 'string', required: false },
        { key: 'tags', type: 'multi-string' },
        { key: 'html', type: 'rich' },
        { key: 'properties', type: 'schema-driven', schema_ref: '$.type.property_schema' },
      ],
    },
  },
} as const;

export const collection_type_create_action = {
  create: {
    method: 'POST',
    href: '/api/types',
    title: 'Create a section type',
    schema: {
      fields: [
        { key: 'slug', type: 'string', required: true },
        { key: 'name', type: 'string', required: true },
        { key: 'description', type: 'string', required: false },
        { key: 'color', type: 'string', required: false },
        { key: 'property_schema', type: 'rich', required: false },
      ],
    },
  },
} as const;
