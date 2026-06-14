import { signal } from '@lit-labs/signals';
import { load_tree_open, save_tree_open } from './lib/tree-storage.ts';
import type { Graph, NotebookVersion, ProblemJson, RootDoc, Section, TypeBrief } from './lib/types.ts';

export type NotebookSummary = {
  readonly slug: string;
  readonly title: string;
  readonly version: NotebookVersion;
  readonly schema_version: number;
  readonly section_count: number;
  readonly updated_at: number | null;
  readonly _links?: Readonly<Record<string, { readonly href: string; readonly templated?: boolean }>>;
};

export type CatalogRoot = {
  readonly name: string;
  readonly version: string;
  readonly _links: Readonly<Record<string, { readonly href: string; readonly templated?: boolean }>>;
  readonly _actions?: Readonly<Record<string, unknown>>;
};

export const currentNotebookSlug = signal<string | null>(null);
export const currentSectionSlug = signal<string | null>(null);
export const currentView = signal<'landing' | 'read' | 'toc' | 'print' | 'history'>('landing');
export const glimpseStack = signal<ReadonlyArray<string>>([]);
export const glimpseCursor = signal<number>(-1);
export const tree = signal<ReadonlyArray<import('./lib/types.ts').GraphNode>>([]);
export const treeOpenState = signal<ReadonlySet<string>>(load_tree_open());
export const graphCache = signal<Graph | null>(null);
export const rootDoc = signal<RootDoc | null>(null);
export const catalogRoot = signal<CatalogRoot | null>(null);
export const notebooks = signal<ReadonlyArray<NotebookSummary>>([]);
export const error = signal<ProblemJson | null>(null);
export const currentSection = signal<Section | null>(null);
export const typesCache = signal<ReadonlyArray<TypeBrief> | null>(null);
export const newProjectOpen = signal<boolean>(false);
export const revisionsPanelOpen = signal<boolean>(false);
export const commentsPanelOpen = signal<boolean>(false);

export const set_tree_open = (next: ReadonlySet<string>) => {
  treeOpenState.set(next);
  save_tree_open(next);
};

export const toggle_tree_open = (slug: string) => {
  const next = new Set(treeOpenState.get());
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  set_tree_open(next);
};
