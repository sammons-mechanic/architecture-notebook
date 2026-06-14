import { TYPE_SEEDS, type TypeSeed } from './types.ts';
import { SECTION_SEEDS, type SectionSeed } from './tree.ts';

type BatchOp = {
  readonly id: string;
  readonly method: string;
  readonly href: string;
  readonly body: Record<string, unknown>;
};

type Batch = {
  readonly atomic: boolean;
  readonly ops: ReadonlyArray<BatchOp>;
};

const type_op = (t: TypeSeed): BatchOp => ({
  id: `t-${t.slug}`,
  method: 'POST',
  href: '/api/types',
  body: {
    slug: t.slug,
    name: t.name,
    color: t.color,
    description: t.description,
    property_schema: t.property_schema,
  },
});

export const build_types_batch = (): Batch => ({
  atomic: true,
  ops: TYPE_SEEDS.map(type_op),
});

const section_body = (s: SectionSeed): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    slug: s.slug,
    title: s.title,
    type: s.type,
  };
  if (s.parent !== null) body.parent = s.parent;
  if (s.deck !== undefined) body.deck = s.deck;
  if (s.tags !== undefined) body.tags = s.tags;
  if (s.properties !== undefined) body.properties = s.properties;
  if (s.html !== undefined) body.html = s.html;
  return body;
};

const section_op = (s: SectionSeed): BatchOp => ({
  id: `s-${s.slug}`,
  method: 'POST',
  href: '/api/sections',
  body: section_body(s),
});

export const build_sections_batch = (): Batch => ({
  atomic: true,
  ops: SECTION_SEEDS.map(section_op),
});
