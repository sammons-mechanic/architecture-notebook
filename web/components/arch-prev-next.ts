import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { tree, currentSectionSlug } from '../store-signals.ts';
import type { GraphNode } from '../lib/types.ts';
import { nav_to_section } from '../nav.ts';

// Depth-first traversal: parent before children, siblings ordered by
// position. Mirrors how the tree sidebar visually reads top-to-bottom,
// so "next" / "prev" feel intuitive.
const traversal_order = (nodes: ReadonlyArray<GraphNode>): GraphNode[] => {
  const children_by_parent = new Map<string | null, GraphNode[]>();
  for (const node of nodes) {
    const list = children_by_parent.get(node.parent);
    if (list) list.push(node);
    else children_by_parent.set(node.parent, [node]);
  }
  for (const list of children_by_parent.values()) {
    list.sort((left, right) => left.position - right.position);
  }
  const out: GraphNode[] = [];
  const visit = (parent: string | null): void => {
    const kids = children_by_parent.get(parent) ?? [];
    for (const kid of kids) {
      out.push(kid);
      visit(kid.slug);
    }
  };
  visit(null);
  return out;
};

class ArchPrevNext extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  render() {
    const current = currentSectionSlug.get();
    const nodes = tree.get();
    if (!current || nodes.length === 0) return html``;
    const order = traversal_order(nodes);
    const idx = order.findIndex((node) => node.slug === current);
    if (idx < 0) return html``;
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx < order.length - 1 ? order[idx + 1] : null;
    if (!prev && !next) return html``;
    return html`
      <nav class="prev-next" aria-label="section navigation">
        ${prev
          ? html`<button
              type="button"
              class="prev-next-btn prev"
              @click=${() => nav_to_section(prev.slug)}
              aria-label="Previous section: ${prev.number} ${prev.title}"
            >
              <span class="arrow" aria-hidden="true">←</span>
              <span class="meta">
                <span class="label">Prev</span>
                <span class="title">${prev.number} ${prev.title}</span>
              </span>
            </button>`
          : html`<span class="prev-next-spacer" aria-hidden="true"></span>`}
        ${next
          ? html`<button
              type="button"
              class="prev-next-btn next"
              @click=${() => nav_to_section(next.slug)}
              aria-label="Next section: ${next.number} ${next.title}"
            >
              <span class="meta">
                <span class="label">Next</span>
                <span class="title">${next.number} ${next.title}</span>
              </span>
              <span class="arrow" aria-hidden="true">→</span>
            </button>`
          : html`<span class="prev-next-spacer" aria-hidden="true"></span>`}
      </nav>
    `;
  }
}

customElements.define('arch-prev-next', ArchPrevNext);
