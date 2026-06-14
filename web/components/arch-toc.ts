import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { tree, rootDoc, graphCache } from '../store-signals.ts';
import { nav_to_section } from '../nav.ts';
import { build_tree } from '../lib/tree-utils.ts';
import type { TreeNode } from '../lib/tree-utils.ts';

const flatten = (nodes: ReadonlyArray<TreeNode>, depth: number = 1): ReadonlyArray<{ readonly node: TreeNode; readonly depth: number }> => {
  const out: { readonly node: TreeNode; readonly depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0) {
      out.push(...flatten(node.children, depth + 1));
    }
  }
  return out;
};

class ArchToc extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #open = (slug: string) => { nav_to_section(slug); };

  render() {
    const root = rootDoc.get();
    const graph = graphCache.get();
    const nodes = build_tree(tree.get());
    const flat = flatten(nodes);
    return html`
      <div class="toc-shell">
        <div class="toc-eyebrow">Architecture Notebook</div>
        <h1 class="toc-title">${root?.notebook.title ?? 'Notebook'}</h1>
        <p class="toc-subtitle">Section reference</p>
        <div class="toc-meta">
          <span>Version<b>${root ? `${root.notebook.version.major}.${root.notebook.version.minor}` : '0.0'}</b></span>
          <span>Sections<b>${graph?.nodes.length ?? 0}</b></span>
        </div>
        <ul class="toc-list">
          ${flat.map(({ node, depth }) => html`
            <li class="toc-row l${depth}" @click=${() => this.#open(node.slug)}>
              <span class="num">${node.number}</span>
              <span class="name">
                <span class="dot dot-${node.type}"></span>${node.title}
              </span>
              <span class="page"></span>
            </li>
          `)}
        </ul>
      </div>
    `;
  }
}

customElements.define('arch-toc', ArchToc);
