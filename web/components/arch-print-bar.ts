import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { print_iframe_loaded } from './arch-print.ts';

class ArchPrintBar extends SignalWatcher(LitElement) {
  static properties = {
    onPrint: { attribute: false },
  };

  onPrint: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  #click = () => {
    this.onPrint?.();
  };

  render() {
    const ready = print_iframe_loaded.get();
    return html`
      <div class="print-bar">
        <span class="meta"><b>Print preview</b>·full notebook</span>
        <button ?disabled=${!ready} @click=${this.#click}>
          Save as PDF <span class="kbd">⌘P</span>
        </button>
      </div>
    `;
  }
}

customElements.define('arch-print-bar', ArchPrintBar);
