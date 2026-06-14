import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { notebooks, catalogRoot, newProjectOpen } from '../store-signals.ts';
import { push_route } from '../router.ts';
import { notebook_card_template, new_notebook_tile_template } from './arch-landing-card.ts';
import './arch-new-project.ts';

class ArchLanding extends SignalWatcher(LitElement) {
  createRenderRoot() { return this; }

  #open(slug: string) { push_route({ kind: 'notebook', notebook: slug }); }
  #open_new() { newProjectOpen.set(true); }

  render() {
    const list = notebooks.get();
    const catalog = catalogRoot.get();
    if (!catalog) return html`<main class="landing landing-loading"><p>Loading…</p></main>`;
    return html`
      <main class="landing">
        <header class="landing-header">
          <span class="landing-eyebrow">Architecture Notebook</span>
          <h1 class="landing-title">Notebooks</h1>
          <p class="landing-deck">${list.length === 0
            ? 'No notebooks yet. Start one to begin documenting an architecture.'
            : 'Choose a notebook to open, or start a new one.'}</p>
        </header>
        <section class="landing-grid">
          ${list.map((nb) => notebook_card_template(nb, (slug) => this.#open(slug)))}
          ${new_notebook_tile_template(() => this.#open_new())}
        </section>
      </main>
      ${newProjectOpen.get() ? html`<arch-new-project></arch-new-project>` : ''}
    `;
  }
}

customElements.define('arch-landing', ArchLanding);
