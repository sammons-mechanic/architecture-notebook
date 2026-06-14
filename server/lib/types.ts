import type { Database } from '../db.ts';
import type { PropertySchema } from './validate-schemas.ts';

export type ValidatedBody = Record<string, unknown>;

export type LinkObject = {
  readonly href: string;
  readonly title?: string;
  readonly templated?: boolean;
  // HAL media-type hint for the target (e.g. 'text/markdown' on the
  // service-doc link). Standard HAL link property.
  readonly type?: string;
};

export type NotebookVersion = { readonly major: number; readonly minor: number };

export type RootDoc = {
  readonly name: string;
  readonly schema_version: number;
  readonly notebook: { readonly title: string; readonly version: NotebookVersion };
  readonly _links: Record<string, LinkObject>;
};

export type { IdempotencyStore } from '../idempotency.ts';

export type ValidateDeps = {
  readonly root_doc: RootDoc;
  readonly resolve_section_slug: (slug: string) => boolean;
  readonly resolve_section_type_slug: (section_slug: string) => string | null;
  readonly resolve_type_schema: (type_slug: string) => PropertySchema | null;
  // Notebook-unit resolver — true if a notebook with this slug is
  // currently loaded. Used by validators for `@<notebook>` refs.
  // Wired by build_validate_deps when a peer-lookup closure is available.
  readonly resolve_notebook?: (notebook: string) => boolean;
};

export type Deps = {
  readonly db: Database;
  readonly root_doc: RootDoc;
  readonly idempotency: import('../idempotency.ts').IdempotencyStore;
  readonly version: string;
  readonly req_path: string;
  // Cross-notebook lookup: returns the peer's Database if a notebook with
  // this slug is loaded, null otherwise. Wired by the notebook-manager
  // closure; missing in unit-helper contexts that don't need it.
  readonly get_peer_db?: (notebook_slug: string) => Database | null;
  // The notebook slug owning this Deps. Used by handlers that announce
  // new resolvable targets to other notebooks.
  readonly notebook_slug?: string;
};

export type OpResults = ReadonlyMap<string, { slug?: string; id?: number }>;
