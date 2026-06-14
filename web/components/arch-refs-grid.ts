import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection, graphCache } from '../store-signals.ts';
import type { EmbeddedRef } from '../lib/types.ts';

class ArchRefsGrid extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #item(edge: EmbeddedRef, direction: 'out' | 'in') {
    const entry = direction === 'out' ? edge.to : edge.from;
    if (!entry) {
      return html``;
    }
    const graph = graphCache.get();
    const known = graph ? graph.nodes.some((node) => node.slug === entry.slug) : true;
    const broken = !known ? 'true' : '';
    const number = graph?.nodes.find((node) => node.slug === entry.slug)?.number ?? '';
    return html`
      <li>
        <span class="role">${edge.role}</span>
        <arch-ref to=${entry.slug} broken=${broken}>${entry.title}</arch-ref>
        <span class="num">${number}</span>
      </li>
    `;
  }

  render() {
    const section = currentSection.get();
    const out = section?._embedded?.refs?.out ?? [];
    const incoming = section?._embedded?.refs?.in ?? [];
    if (out.length === 0 && incoming.length === 0) {
      return html``;
    }
    return html`
      <div class="refs-grid">
        <div>
          <h4>References to</h4>
          <ul>${out.map((edge) => this.#item(edge, 'out'))}</ul>
        </div>
        <div>
          <h4>Referenced by</h4>
          <ul>${incoming.map((edge) => this.#item(edge, 'in'))}</ul>
        </div>
      </div>
    `;
  }
}

customElements.define('arch-refs-grid', ArchRefsGrid);
