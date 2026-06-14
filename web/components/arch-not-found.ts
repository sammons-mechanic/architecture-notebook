import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSectionSlug } from '../store-signals.ts';

class ArchNotFound extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  render() {
    const slug = currentSectionSlug.get();
    return html`
      <div class="not-found">
        <div class="num">404</div>
        <h1>Not found</h1>
        <p>No section with slug <code>${slug ?? '(unknown)'}</code> exists.</p>
      </div>
    `;
  }
}

customElements.define('arch-not-found', ArchNotFound);
