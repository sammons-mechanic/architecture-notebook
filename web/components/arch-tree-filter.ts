import { LitElement, html } from 'lit';
import { signal, SignalWatcher } from '@lit-labs/signals';

export const tree_filter_query = signal<string>('');

class ArchTreeFilter extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #on_keydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      const input = this.querySelector('input');
      input?.focus();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#on_keydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#on_keydown);
  }

  #on_input = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    tree_filter_query.set(value);
  };

  render() {
    return html`
      <div class="tree-filter">
        <input
          type="text"
          placeholder="Filter sections"
          .value=${tree_filter_query.get()}
          @input=${this.#on_input}
        />
        <span class="shortcut">⌘K</span>
      </div>
    `;
  }
}

customElements.define('arch-tree-filter', ArchTreeFilter);
