import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { treeOpenState, toggle_tree_open } from '../store-signals.ts';
import { nav_to_section } from '../nav.ts';
import { tree_keydown } from './arch-tree-keys.ts';
import type { TreeNode } from '../lib/tree-utils.ts';

class ArchTreeNode extends SignalWatcher(LitElement) {
  static properties = {
    node: { type: Object },
    level: { type: Number },
    posinset: { type: Number },
    setsize: { type: Number },
    active: { type: String },
  };

  node!: TreeNode;
  level: number = 1;
  posinset: number = 1;
  setsize: number = 1;
  active: string | null = null;

  createRenderRoot() {
    return this;
  }

  #navigate = (event: Event) => {
    event.stopPropagation();
    nav_to_section(this.node.slug);
  };

  #toggle = (event: Event) => {
    event.stopPropagation();
    if (this.node.children.length > 0) {
      toggle_tree_open(this.node.slug);
    }
  };

  #on_keydown = (event: KeyboardEvent) => tree_keydown(event, this, this.node, toggle_tree_open);

  render() {
    const open_set = treeOpenState.get();
    const expanded = open_set.has(this.node.slug);
    const has_kids = this.node.children.length > 0;
    const is_current = this.node.slug === this.active;
    return html`
      <li role="none">
        <div
          class=${is_current ? 'row current' : 'row'}
          role="treeitem"
          aria-level=${this.level}
          aria-posinset=${this.posinset}
          aria-setsize=${this.setsize}
          aria-expanded=${has_kids ? (expanded ? 'true' : 'false') : nothing}
          tabindex=${is_current ? '0' : '-1'}
          data-slug=${this.node.slug}
          @click=${this.#navigate}
          @keydown=${this.#on_keydown}
        >
          <button
            class=${has_kids ? (expanded ? 'chev open' : 'chev') : 'chev leaf'}
            tabindex="-1"
            aria-hidden="true"
            @click=${this.#toggle}
          >${has_kids ? '›' : ''}</button>
          <span class="name">
            <span class="dot dot-${this.node.type}"></span>
            <span class="label-text">${this.node.title}</span>
          </span>
          <span class="num">${this.node.number}</span>
        </div>
        ${has_kids ? html`
          <ul role="group" class=${expanded ? '' : 'collapsed'}>
            ${this.node.children.map((child, index) => html`
              <arch-tree-node
                .node=${child}
                .level=${this.level + 1}
                .posinset=${index + 1}
                .setsize=${this.node.children.length}
                .active=${this.active}
              ></arch-tree-node>
            `)}
          </ul>
        ` : ''}
      </li>
    `;
  }
}

customElements.define('arch-tree-node', ArchTreeNode);
