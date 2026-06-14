import { LitElement, html } from 'lit';
import { signal, SignalWatcher } from '@lit-labs/signals';
import { printHref } from '../store-actions.ts';
import './arch-print-bar.ts';

export const print_iframe_loaded = signal<boolean>(false);

class ArchPrint extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #iframe: HTMLIFrameElement | null = null;

  #on_keydown = (event: KeyboardEvent) => {
    if (!print_iframe_loaded.get()) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'p') {
      event.preventDefault();
      this.#iframe?.contentWindow?.print();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#on_keydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#on_keydown);
    print_iframe_loaded.set(false);
  }

  #on_load = (event: Event) => {
    this.#iframe = event.target as HTMLIFrameElement;
    print_iframe_loaded.set(true);
  };

  #trigger_print = () => {
    this.#iframe?.contentWindow?.print();
  };

  render() {
    const href = printHref();
    return html`
      <div class="print-shell">
        <arch-print-bar .onPrint=${this.#trigger_print}></arch-print-bar>
        ${href ? html`<iframe class="print-frame" src=${href} @load=${this.#on_load}></iframe>` : ''}
      </div>
    `;
  }
}

customElements.define('arch-print', ArchPrint);
