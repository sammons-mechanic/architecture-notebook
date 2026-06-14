import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { error, clear_error } from '../store.ts';

class ArchError extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #dismiss = () => {
    clear_error();
  };

  #refresh = () => {
    location.reload();
  };

  render() {
    const problem = error.get();
    if (!problem) {
      return html``;
    }
    const is_conflict = problem.status === 412;
    return html`
      <div class="error-banner" role="alert">
        <div class="code">${problem.status} · ${problem.title}</div>
        <div class="msg">
          ${is_conflict
            ? 'This section changed. Refresh to see the new version and discard your change?'
            : (problem.detail ?? problem.errors?.[0]?.message ?? problem.title)}
        </div>
        ${problem.hint
          ? html`<a class="hint" href="${problem.hint}">${problem.hint}</a>`
          : (problem.errors?.[0]?.hint
              ? html`<a class="hint" href="${problem.errors[0].hint}">${problem.errors[0].hint}</a>`
              : html``)}
        <div class="actions">
          ${is_conflict ? html`<button @click=${this.#refresh}>Refresh</button>` : html``}
          <button @click=${this.#dismiss}>Dismiss</button>
        </div>
      </div>
    `;
  }
}

customElements.define('arch-error', ArchError);
