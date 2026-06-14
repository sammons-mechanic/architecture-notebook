import { LitElement } from 'lit';
import { SignalWatcher, signal } from '@lit-labs/signals';
import { currentSection } from '../store-signals.ts';
import { close_all_rails } from '../nav-rail.ts';
import {
  revisionsList, revisionsLoading, selectedRevisionNumber, selectedRevision,
  restoreInFlight, load_revisions, reset_revisions_for, select_revision,
  restore_revision, try_resolve_pending, type RevisionSummary,
} from '../lib/revisions-store.ts';
import { revisions_panel_template } from './arch-revisions-body.ts';

const restoreMessage = signal<string>('');

class ArchRevisions extends SignalWatcher(LitElement) {
  createRenderRoot() { return this; }

  #last_slug: string | null = null;

  updated() {
    const section = currentSection.get();
    const slug = section?.slug ?? null;
    if (slug !== this.#last_slug) {
      this.#last_slug = slug;
      reset_revisions_for(slug);
      restoreMessage.set('');
      const link = section?._links.revisions;
      if (slug && link) {
        void load_revisions(link, slug);
      }
    }
    if (slug) try_resolve_pending(slug);
  }

  #close = () => { close_all_rails(); restoreMessage.set(''); };
  #select = (item: RevisionSummary) => { void select_revision(item); };
  #message_input = (next: string) => restoreMessage.set(next);
  #restore = () => {
    void restore_revision(restoreMessage.get()).then(() => restoreMessage.set(''));
  };

  render() {
    const section = currentSection.get() as ({ readonly revision_count?: number } | null);
    const current_revision = section?.revision_count ?? 0;
    return revisions_panel_template({
      count: current_revision,
      items: revisionsList.get(),
      loading: revisionsLoading.get(),
      selected_number: selectedRevisionNumber.get(),
      selected: selectedRevision.get(),
      current_revision,
      restore_message: restoreMessage.get(),
      restore_in_flight: restoreInFlight.get(),
      on_close: this.#close,
      on_select: this.#select,
      on_message_input: this.#message_input,
      on_restore: this.#restore,
    });
  }
}

customElements.define('arch-revisions', ArchRevisions);
