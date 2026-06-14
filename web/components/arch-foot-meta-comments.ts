import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection } from '../store-signals.ts';
import { open_comments_rail } from '../nav-rail.ts';
import { commentsFilter } from '../lib/comments-store.ts';

type SectionWithCount = { readonly comment_count?: number };

class ArchFootMetaComments extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #open = () => {
    commentsFilter.set('open');
    open_comments_rail();
  };

  #open_all = () => {
    commentsFilter.set('all');
    open_comments_rail();
  };

  render() {
    const section = currentSection.get();
    const count = section ? ((section as unknown as SectionWithCount).comment_count ?? 0) : 0;
    return html`
      <section class="comments-foot">
        <div class="comments-foot-head">
          <h4>Comments</h4>
          <span class="comments-foot-count" aria-label="open comments">${count}</span>
        </div>
        <div class="comments-foot-body">
          <button type="button" class="comments-foot-add" @click=${this.#open}>
            Add comment
          </button>
          ${count > 0 ? html`
            <button type="button" class="comments-foot-link" @click=${this.#open_all}>
              View all (${count})
            </button>
          ` : html`<span class="comments-foot-empty">no open comments</span>`}
        </div>
      </section>
    `;
  }
}

customElements.define('arch-foot-meta-comments', ArchFootMetaComments);
