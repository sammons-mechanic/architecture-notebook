import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { tree, rootDoc, currentSectionSlug } from '../store-signals.ts';
import { build_tree } from '../lib/tree-utils.ts';
import { visible_slugs } from '../lib/tree-filter.ts';
import { tree_filter_query } from './arch-tree-filter.ts';
import './arch-tree-node.ts';
import './arch-tree-filter.ts';
import type { TreeNode } from '../lib/tree-utils.ts';

class ArchTree extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #filter(nodes: ReadonlyArray<TreeNode>, visible: Set<string>): ReadonlyArray<TreeNode> {
    const out: TreeNode[] = [];
    for (const node of nodes) {
      if (!visible.has(node.slug)) {
        continue;
      }
      const children = this.#filter(node.children, visible);
      out.push({ ...node, children });
    }
    return out;
  }

  render() {
    const nodes = tree.get();
    const query = tree_filter_query.get();
    const visible = visible_slugs(nodes, query);
    const root_nodes = this.#filter(build_tree(nodes), visible);
    const title = rootDoc.get()?.notebook.title ?? 'Notebook';
    const active = currentSectionSlug.get();
    return html`
      <arch-tree-filter></arch-tree-filter>
      <div class="tree-eyebrow"><span>${title}</span><b>${nodes.length}</b></div>
      <ul role="tree" aria-label="Section tree">
        ${root_nodes.map((node, index) => html`
          <arch-tree-node
            .node=${node}
            .level=${1}
            .posinset=${index + 1}
            .setsize=${root_nodes.length}
            .active=${active}
          ></arch-tree-node>
        `)}
      </ul>
    `;
  }
}

customElements.define('arch-tree', ArchTree);
