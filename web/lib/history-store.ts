import { signal } from '@lit-labs/signals';
import { hal_fetch } from './hal-fetch.ts';
import { error } from '../store-signals.ts';
import type { HalLink, HalLinks, NotebookVersion } from './types.ts';

export type HistoryEntry = {
  readonly section: {
    readonly slug: string;
    readonly number: string;
    readonly title: string;
    readonly _links: HalLinks;
  };
  readonly revision: number;
  readonly author: string | null;
  readonly message: string | null;
  readonly created_at: number;
  readonly _links: HalLinks;
};

type HistoryDoc = {
  readonly notebook_version: NotebookVersion;
  readonly total: number;
  readonly _embedded?: { readonly items: ReadonlyArray<HistoryEntry> };
};

export const historyItems = signal<ReadonlyArray<HistoryEntry>>([]);
export const historyLoading = signal<boolean>(false);

export const load_history = async (link: HalLink) => {
  historyLoading.set(true);
  const response = await hal_fetch<HistoryDoc>(link);
  historyLoading.set(false);
  if (!response.ok) {
    error.set(response.problem);
    historyItems.set([]);
    return;
  }
  historyItems.set(response.body._embedded?.items ?? []);
};
