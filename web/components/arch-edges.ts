import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection, graphCache } from '../store-signals.ts';
import type { EmbeddedRef } from '../lib/types.ts';

class ArchEdges extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #row(edge: EmbeddedRef) {
    const target = edge.to;
    if (!target) {
      return html``;
    }
    const graph = graphCache.get();
    const known = graph ? graph.nodes.some((node) => node.slug === target.slug) : true;
    const broken = !known ? 'true' : '';
    const role = edge.role || 'ref';
    const number = graph?.nodes.find((node) => node.slug === target.slug)?.number ?? '';
    return html`
      <div class="gline">
        <span class="role">${role}</span>
        <span class="arrow">→</span>
        <arch-ref class="target" to=${target.slug} broken=${broken}>${target.slug}</arch-ref>
        <span class="num">${number}</span>
      </div>
    `;
  }

  render() {
    const section = currentSection.get();
    const edges = section?._embedded?.refs?.out ?? [];
    if (edges.length === 0) {
      return html``;
    }
    return html`
      <div class="edges">
        <div class="edges-header">
          <span>Edges</span>
          <span class="count">${edges.length}</span>
        </div>
        <div class="edges-list">
          ${edges.map((edge) => this.#row(edge))}
        </div>
      </div>
    `;
  }
}

customElements.define('arch-edges', ArchEdges);
