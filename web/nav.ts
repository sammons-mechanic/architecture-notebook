import { push_route, replace_route } from './router.ts';
import { currentNotebookSlug } from './store-signals.ts';
import { pendingRevision } from './lib/revisions-store.ts';

const notebook_or_null = () => currentNotebookSlug.get();

export const nav_to_home = () => push_route({ kind: 'home' });

export const nav_to_notebook = (slug: string) => push_route({ kind: 'notebook', notebook: slug });

export const nav_to_section = (
  slug: string,
  glimpse: ReadonlyArray<string> = [],
  cursor: number | null = null,
  mode: 'push' | 'replace' = 'push'
) => {
  const notebook = notebook_or_null();
  if (!notebook) return;
  const route = { kind: 'section', notebook, slug, glimpse, cursor } as const;
  if (mode === 'replace') replace_route(route);
  else push_route(route);
};

export const nav_to_glimpse = (
  slug: string,
  glimpse: ReadonlyArray<string>,
  cursor: number | null,
  mode: 'push' | 'replace' = 'push'
) => {
  const notebook = notebook_or_null();
  if (!notebook) return;
  const route = { kind: 'section', notebook, slug, glimpse, cursor } as const;
  if (mode === 'replace') replace_route(route);
  else push_route(route);
};

export const nav_to_toc = () => {
  const notebook = notebook_or_null();
  if (notebook) push_route({ kind: 'toc', notebook });
};

export const nav_to_print = () => {
  const notebook = notebook_or_null();
  if (notebook) push_route({ kind: 'print', notebook });
};

export const nav_to_history = () => {
  const notebook = notebook_or_null();
  if (!notebook) return;
  // Entering the History view explicitly abandons any un-consumed snapshot
  // intent from an earlier, interrupted row click.
  pendingRevision.set(null);
  push_route({ kind: 'history', notebook });
};
