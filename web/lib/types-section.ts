import type { HalLinks, PropertySchema, UnresolvedRef, EmbeddedItem, EmbeddedRef } from './types.ts';

export type Section = {
  readonly slug: string;
  readonly number: string;
  readonly title: string;
  readonly deck?: string;
  readonly type: string;
  readonly tags?: ReadonlyArray<string>;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly html: string;
  readonly unresolved_refs: ReadonlyArray<UnresolvedRef>;
  readonly revision_count?: number;
  readonly comment_count?: number;
  readonly updated_at: number;
  readonly _etag: string;
  readonly _links: HalLinks;
  readonly _actions?: Readonly<Record<string, unknown>>;
  readonly _embedded?: {
    readonly type?: { readonly slug: string; readonly name: string; readonly property_schema: PropertySchema };
    readonly parent?: EmbeddedItem;
    readonly ancestors?: ReadonlyArray<EmbeddedItem> | { readonly _embedded?: { readonly items: ReadonlyArray<EmbeddedItem> } };
    readonly children?: { readonly _embedded?: { readonly items: ReadonlyArray<EmbeddedItem> } };
    readonly refs?: { readonly out: ReadonlyArray<EmbeddedRef>; readonly in: ReadonlyArray<EmbeddedRef> };
  };
};

export type NotebookVersion = { readonly major: number; readonly minor: number };

export type RootDoc = {
  readonly name: string;
  readonly schema_version: number;
  readonly notebook: { readonly title: string; readonly version: NotebookVersion };
  readonly _links: HalLinks;
  readonly _actions?: Readonly<Record<string, unknown>>;
};
