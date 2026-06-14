import { hal_fetch, ROOT_HREF } from './lib/hal-fetch.ts';
import {
  rootDoc, graphCache, tree, currentSection, error, catalogRoot, notebooks, currentNotebookSlug,
  type CatalogRoot, type NotebookSummary,
} from './store-signals.ts';
import type { HalLink, Graph, ProblemJson, RootDoc, Section } from './lib/types.ts';

let catalog_in_flight: Promise<void> | null = null;
let notebook_in_flight: Promise<void> | null = null;
let last_booted_notebook: string | null = null;

const handle_problem = (problem: ProblemJson) => { error.set(problem); };

export const bootCatalog = async () => {
  if (catalogRoot.get() && notebooks.get().length > 0 && !catalog_in_flight) return;
  if (catalog_in_flight) return catalog_in_flight;
  catalog_in_flight = (async () => {
    const root = await hal_fetch<CatalogRoot>({ href: ROOT_HREF });
    if (!root.ok) { handle_problem(root.problem); return; }
    catalogRoot.set(root.body);
    const list_link = root.body._links.notebooks;
    if (!list_link) return;
    const list = await hal_fetch<{ readonly _embedded?: { readonly items: ReadonlyArray<NotebookSummary> } }>(list_link);
    if (!list.ok) { handle_problem(list.problem); return; }
    notebooks.set(list.body._embedded?.items ?? []);
  })();
  await catalog_in_flight;
  catalog_in_flight = null;
};

export const refreshNotebookList = async () => {
  catalog_in_flight = null;
  catalogRoot.set(catalogRoot.get());
  await bootCatalog();
};

export const bootNotebook = async (slug: string) => {
  if (last_booted_notebook === slug && rootDoc.get() && !notebook_in_flight) return;
  if (notebook_in_flight) return notebook_in_flight;
  notebook_in_flight = (async () => {
    last_booted_notebook = slug;
    const root_response = await hal_fetch<RootDoc>({ href: `${ROOT_HREF}/notebooks/${encodeURIComponent(slug)}` });
    if (!root_response.ok) { handle_problem(root_response.problem); return; }
    const summary = root_response.body as unknown as NotebookSummary;
    const root_link = (summary._links as Record<string, HalLink>)?.root;
    if (!root_link) return;
    const nb_root = await hal_fetch<RootDoc>(root_link);
    if (!nb_root.ok) { handle_problem(nb_root.problem); return; }
    rootDoc.set(nb_root.body);
    currentNotebookSlug.set(slug);
    const graph_link = nb_root.body._links.graph;
    if (!graph_link) return;
    const graph_response = await hal_fetch<Graph>(graph_link);
    if (!graph_response.ok) { handle_problem(graph_response.problem); return; }
    graphCache.set(graph_response.body);
    tree.set(graph_response.body.nodes);
  })();
  await notebook_in_flight;
  notebook_in_flight = null;
};

export const resetNotebookContext = () => {
  rootDoc.set(null);
  graphCache.set(null);
  tree.set([]);
  currentSection.set(null);
  currentNotebookSlug.set(null);
  last_booted_notebook = null;
};

export const loadSection = async (link: HalLink, embed?: ReadonlyArray<string>) => {
  const target = embed && !link.templated
    ? { href: `${link.href}?embed=${embed.join(',')}`, templated: false }
    : link;
  const vars = embed ? { embed: embed.join(',') } : {};
  const response = await hal_fetch<Section>(target, { vars });
  if (!response.ok) {
    handle_problem(response.problem);
    if (response.status === 404) currentSection.set(null);
    return;
  }
  currentSection.set(response.body);
};

export const searchSections = async (q: string) => {
  const root = rootDoc.get();
  const search_link = root?._links.search;
  if (!root || !search_link) return null;
  const response = await hal_fetch<{ readonly _embedded?: { readonly results: ReadonlyArray<{ readonly slug: string; readonly title: string }> } }>(search_link, { vars: { q } });
  if (!response.ok) { handle_problem(response.problem); return null; }
  return response.body;
};

export const printHref = () => rootDoc.get()?._links.print?.href ?? null;

export const clear_error = () => error.set(null);

export { createNotebook } from './store-notebooks.ts';
export type { CreateNotebookInput } from './store-notebooks.ts';
