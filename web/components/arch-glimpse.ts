import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { glimpseStack, glimpseCursor, currentSectionSlug, rootDoc } from '../store-signals.ts';
import { nav_to_section } from '../nav.ts';
import { glimpseSection, load_glimpse } from '../lib/glimpse-store.ts';
import { glimpse_body_template } from './arch-glimpse-body.ts';

class ArchGlimpse extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #last_loaded: string | null = null;

  #goto = (next_cursor: number, mode: 'push' | 'replace') => {
    const slug = currentSectionSlug.get();
    const stack = glimpseStack.get();
    if (!slug) return;
    nav_to_section(slug, stack, next_cursor, mode);
  };

  #back = () => this.#goto(glimpseCursor.get() - 1, 'push');
  #forward = () => this.#goto(glimpseCursor.get() + 1, 'push');
  #close = () => {
    const slug = currentSectionSlug.get();
    if (!slug) return;
    nav_to_section(slug);
  };

  #jump_to = (index: number) => this.#goto(index, 'replace');

  updated() {
    const cursor = glimpseCursor.get();
    const stack = glimpseStack.get();
    const target = cursor >= 0 ? stack[cursor] : null;
    if (target && target !== this.#last_loaded) {
      this.#last_loaded = target;
      const sections_link = rootDoc.get()?._links.sections;
      if (sections_link) {
        void load_glimpse(sections_link.href, target);
      }
    }
    if (!target) {
      this.#last_loaded = null;
    }
  }

  render() {
    const cursor = glimpseCursor.get();
    const stack = glimpseStack.get();
    if (cursor < 0 || stack.length === 0) {
      return html``;
    }
    const section = glimpseSection.get();
    const current_slug = stack[cursor];
    const can_back = cursor > 0;
    const can_fwd = cursor < stack.length - 1;
    return html`
      <aside class="glimpse" role="dialog" aria-label="Glimpse panel">
        <div class="glimpse-head">
          <span class="label">Glimpse<span class="id"> · ${section?.number ?? current_slug}</span></span>
          <button ?disabled=${!can_back} title="back" @click=${this.#back}>←</button>
          <button ?disabled=${!can_fwd} title="forward" @click=${this.#forward}>→</button>
          <button title="close" @click=${this.#close}>✕</button>
        </div>
        <div class="glimpse-stack">
          ${stack.map((slug, index) => html`
            ${index > 0 ? html`<span class="arrow">→</span>` : ''}
            <span
              class=${index === cursor ? 'chip current' : 'chip'}
              @click=${() => this.#jump_to(index)}
            >${slug}</span>
          `)}
        </div>
        ${glimpse_body_template(section)}
      </aside>
    `;
  }
}

customElements.define('arch-glimpse', ArchGlimpse);
