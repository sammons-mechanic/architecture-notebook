import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection } from '../store-signals.ts';
import { attach_anchor_affordances } from '../lib/anchor-affordance.ts';
import './arch-properties.ts';
import './arch-edges.ts';
import './arch-refs-grid.ts';
import './arch-foot-meta.ts';
import './arch-prev-next.ts';

const updated_date = (epoch: number): string => {
  const date = new Date(epoch * 1000);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

class ArchSectionView extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  updated() {
    const prose = this.querySelector<HTMLElement>('.prose');
    if (prose) attach_anchor_affordances(prose);
  }

  render() {
    const section = currentSection.get();
    if (!section) {
      return html``;
    }
    return html`
      <main class="read">
        <header class="section-head">
          <div class="section-meta">
            <span class="num">${section.number}</span>
            <span class="type-pill"><span class="dot dot-${section.type}"></span>${section._embedded?.type?.name ?? section.type}</span>
            <span class="pipe">·</span>
            <span>amended ${updated_date(section.updated_at)}</span>
          </div>
          <h1 class="section-title">${section.title}</h1>
          ${section.deck ? html`<p class="section-deck">${section.deck}</p>` : ''}
          ${section.tags && section.tags.length > 0 ? html`
            <div class="tags">
              ${section.tags.map((tag) => html`<span class="tag">${tag}</span>`)}
            </div>
          ` : ''}
        </header>
        <arch-properties></arch-properties>
        <div class="prose">${unsafeHTML(section.html)}</div>
        <arch-edges></arch-edges>
        <arch-refs-grid></arch-refs-grid>
        <arch-prev-next></arch-prev-next>
        <arch-foot-meta></arch-foot-meta>
      </main>
    `;
  }
}

customElements.define('arch-section-view', ArchSectionView);
