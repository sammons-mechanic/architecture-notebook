import { signal } from '@lit-labs/signals';
import { hal_fetch } from './hal-fetch.ts';
import { currentSection, error } from '../store-signals.ts';
import { loadSection } from '../store-actions.ts';
import { close_all_rails } from '../nav-rail.ts';
import type { HalLink, HalLinks } from './types.ts';

export type RevisionSummary = {
  readonly revision: number;
  readonly author: string | null;
  readonly message: string | null;
  readonly created_at: number;
  readonly _links: HalLinks;
};

export type RevisionFull = RevisionSummary & {
  readonly title: string;
  readonly deck: string | null;
  readonly html: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly tags: ReadonlyArray<string>;
};

export const revisionsList = signal<ReadonlyArray<RevisionSummary>>([]);
export const revisionsLoading = signal<boolean>(false);
export const selectedRevisionNumber = signal<number | null>(null);
export const selectedRevision = signal<RevisionFull | null>(null);
export const restoreInFlight = signal<boolean>(false);

// Set by the History view before navigating; the revisions rail auto-opens
// that exact snapshot once its list for the matching slug has loaded.
export const pendingRevision = signal<{ readonly slug: string; readonly revision: number } | null>(null);

let last_loaded_slug: string | null = null;

export const try_resolve_pending = (slug: string) => {
  const pending = pendingRevision.get();
  const items = revisionsList.get();
  if (!pending || pending.slug !== slug || items.length === 0) return;
  pendingRevision.set(null);
  const match = items.find((item) => item.revision === pending.revision);
  if (match) void select_revision(match);
};

export const load_revisions = async (link: HalLink, slug: string) => {
  revisionsLoading.set(true);
  last_loaded_slug = slug;
  // A History-row click sets pendingRevision then navigates. If the user lands
  // on a DIFFERENT section first, abandon the stale intent here so it can never
  // auto-open a snapshot on a later, unrelated visit to its section. (Cleared
  // only on a concrete load — not in the per-render try_resolve_pending — so a
  // transient mid-navigation slug can't drop a still-valid pending.)
  const pending = pendingRevision.get();
  if (pending && pending.slug !== slug) {
    pendingRevision.set(null);
  }
  const response = await hal_fetch<{ readonly total: number; readonly _embedded?: { readonly items: ReadonlyArray<RevisionSummary> } }>(link);
  revisionsLoading.set(false);
  if (!response.ok) {
    error.set(response.problem);
    revisionsList.set([]);
    return;
  }
  revisionsList.set(response.body._embedded?.items ?? []);
  try_resolve_pending(slug);
};

export const reset_revisions_for = (slug: string | null) => {
  if (slug === last_loaded_slug) return;
  last_loaded_slug = null;
  revisionsList.set([]);
  selectedRevisionNumber.set(null);
  selectedRevision.set(null);
};

export const select_revision = async (item: RevisionSummary) => {
  selectedRevisionNumber.set(item.revision);
  selectedRevision.set(null);
  const self_link = item._links.self;
  if (!self_link) return;
  const response = await hal_fetch<RevisionFull>(self_link);
  if (!response.ok) {
    error.set(response.problem);
    return;
  }
  selectedRevision.set(response.body);
};

export const clear_selection = () => {
  selectedRevisionNumber.set(null);
  selectedRevision.set(null);
};

export const restore_revision = async (message: string) => {
  const section = currentSection.get();
  const revision = selectedRevision.get();
  const self_href = revision?._links.self?.href;
  if (!section || !revision || !self_href) return;
  const trimmed = message.trim();
  const body = trimmed.length > 0 ? { revision_message: trimmed } : {};
  restoreInFlight.set(true);
  const response = await hal_fetch<unknown>({ href: `${self_href}/restore` }, {
    method: 'POST', if_match: section._etag, idempotency_key: crypto.randomUUID(), body,
  });
  restoreInFlight.set(false);
  if (!response.ok) { error.set(response.problem); return; }
  if (section._links.self) {
    await loadSection(section._links.self, ['type', 'parent', 'refs', 'children', 'ancestors']);
  }
  const refreshed = currentSection.get();
  if (refreshed?._links.revisions) await load_revisions(refreshed._links.revisions, refreshed.slug);
  clear_selection();
  close_all_rails();
};
