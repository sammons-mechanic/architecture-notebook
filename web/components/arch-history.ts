import { LitElement } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { rootDoc } from '../store-signals.ts';
import { nav_to_section } from '../nav.ts';
import { open_revisions_rail } from '../nav-rail.ts';
import { pendingRevision } from '../lib/revisions-store.ts';
import { historyItems, historyLoading, load_history, type HistoryEntry } from '../lib/history-store.ts';
import { history_view_template } from './arch-history-body.ts';

class ArchHistory extends SignalWatcher(LitElement) {
  createRenderRoot() { return this; }

  #loaded_href: string | null = null;

  updated() {
    const link = rootDoc.get()?._links.history;
    if (link && link.href !== this.#loaded_href) {
      this.#loaded_href = link.href;
      void load_history(link);
    }
  }

  #open = (entry: HistoryEntry) => {
    pendingRevision.set({ slug: entry.section.slug, revision: entry.revision });
    open_revisions_rail();
    nav_to_section(entry.section.slug);
  };

  render() {
    const root = rootDoc.get();
    const version = root ? `${root.notebook.version.major}.${root.notebook.version.minor}` : '0.0';
    const items = historyItems.get();
    return history_view_template({
      title: root?.notebook.title ?? 'Notebook',
      version,
      total: items.length,
      items,
      loading: historyLoading.get(),
      on_open: this.#open,
    });
  }
}

customElements.define('arch-history', ArchHistory);
