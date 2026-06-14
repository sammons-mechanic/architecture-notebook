import { LitElement } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection } from '../store-signals.ts';
import { open_revisions_rail } from '../nav-rail.ts';
import {
  revisionsList, load_revisions, reset_revisions_for, type RevisionSummary,
} from '../lib/revisions-store.ts';
import { revisions_card_template } from './arch-revisions-body.ts';

const truncate_message = (message: string | null, limit: number) => {
  if (!message) return '';
  return message.length <= limit ? message : `${message.slice(0, limit - 1)}…`;
};

class ArchFootMetaRevisions extends SignalWatcher(LitElement) {
  createRenderRoot() { return this; }

  #last_slug: string | null = null;

  updated() {
    const section = currentSection.get();
    const slug = section?.slug ?? null;
    if (slug !== this.#last_slug) {
      this.#last_slug = slug;
      reset_revisions_for(slug);
      const link = section?._links.revisions;
      if (slug && link) {
        void load_revisions(link, slug);
      }
    }
  }

  #open_all = () => open_revisions_rail();

  render() {
    const count = currentSection.get()?.revision_count ?? 0;
    const items = revisionsList.get();
    const recent: ReadonlyArray<RevisionSummary> = items.slice(0, 3);
    return revisions_card_template({
      count,
      recent,
      truncate: (message) => truncate_message(message, 60),
      on_view_all: this.#open_all,
    });
  }
}

customElements.define('arch-foot-meta-revisions', ArchFootMetaRevisions);
