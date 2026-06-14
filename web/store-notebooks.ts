import { hal_fetch } from './lib/hal-fetch.ts';
import { catalogRoot, notebooks, error, type NotebookSummary } from './store-signals.ts';
import type { ProblemJson } from './lib/types.ts';

const handle_problem = (problem: ProblemJson) => { error.set(problem); };

export type CreateNotebookInput = { readonly slug: string; readonly title: string };

export const createNotebook = async (input: CreateNotebookInput): Promise<NotebookSummary | null> => {
  const root = catalogRoot.get();
  const link = root?._links.notebooks;
  if (!root || !link) return null;
  const response = await hal_fetch<NotebookSummary>(link, {
    method: 'POST',
    body: { slug: input.slug, title: input.title },
    idempotency_key: crypto.randomUUID(),
  });
  if (!response.ok) { handle_problem(response.problem); return null; }
  const list_link = root._links.notebooks;
  if (list_link) {
    const list = await hal_fetch<{ readonly _embedded?: { readonly items: ReadonlyArray<NotebookSummary> } }>(list_link);
    if (list.ok) notebooks.set(list.body._embedded?.items ?? []);
  }
  return response.body;
};
