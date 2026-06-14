import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import './arch-foot-meta-revisions.ts';
import './arch-foot-meta-comments.ts';

class ArchFootMeta extends SignalWatcher(LitElement) {
  createRenderRoot() { return this; }
  render() {
    return html`
      <div class="foot-meta">
        <arch-foot-meta-revisions></arch-foot-meta-revisions>
        <arch-foot-meta-comments></arch-foot-meta-comments>
      </div>
    `;
  }
}

customElements.define('arch-foot-meta', ArchFootMeta);
