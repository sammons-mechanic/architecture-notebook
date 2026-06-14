export type HalLink = { readonly href: string; readonly templated?: boolean; readonly title?: string };

export type HalLinks = Readonly<Record<string, HalLink>>;

export type PropertyField = {
  readonly key: string;
  readonly type: 'string' | 'number' | 'boolean' | 'enum' | 'ref' | 'multi-ref' | 'rich' | 'multi-string' | 'schema-driven';
  readonly required?: boolean;
  readonly enum?: ReadonlyArray<string>;
  readonly refType?: string;
  readonly placeholder?: string;
  readonly schema_ref?: string;
};

export type PropertySchema = { readonly fields: ReadonlyArray<PropertyField> };

export type UnresolvedRef = {
  // Local entries carry `slug`. Notebook-unit cross-refs carry only
  // `notebook` — the target is the notebook itself, not any section
  // inside it (per the revised RFC 2026-05-26).
  readonly slug?: string;
  readonly source: 'html' | 'property';
  readonly field?: string;
  readonly role?: string;
  readonly notebook?: string;
};

export type GraphNode = {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly parent: string | null;
  readonly position: number;
  readonly number: string;
};

export type GraphEdge = {
  readonly id: number;
  readonly from: string;
  readonly to: string;
  readonly role: string | null;
  readonly source: 'manual' | 'html' | 'property';
};

export type Graph = {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly _links?: HalLinks;
};

export type EmbeddedItem = {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly number?: string;
  readonly _links?: HalLinks;
};

export type EmbeddedRef = {
  readonly to?: EmbeddedItem;
  readonly from?: EmbeddedItem;
  readonly role: string;
  readonly source: 'manual' | 'html' | 'property';
  readonly _links?: HalLinks;
};

export type ProblemJson = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly hint?: string;
  readonly errors?: ReadonlyArray<{ readonly field: string; readonly code: string; readonly message: string; readonly hint?: string }>;
  readonly _etag?: string;
};

export type TypeBrief = {
  readonly slug: string;
  readonly name: string;
  readonly color?: string;
  readonly description?: string;
  readonly _links?: HalLinks;
};

export type { Section, RootDoc, NotebookVersion } from './types-section.ts';
