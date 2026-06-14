import { html } from 'lit';

export type FormState = {
  readonly title: string;
  readonly slug: string;
  readonly submitting: boolean;
  readonly error: string | null;
};

export const new_notebook_form_template = (
  state: FormState,
  handlers: {
    readonly on_title: (value: string) => void;
    readonly on_slug: (value: string) => void;
    readonly on_cancel: () => void;
    readonly on_submit: () => void;
  }
) => {
  const can_submit = state.title.trim().length > 0 && /^[a-z0-9-]+$/.test(state.slug) && !state.submitting;
  return html`
    <form
      class="new-project-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      @click=${(event: Event) => event.stopPropagation()}
      @submit=${(event: Event) => { event.preventDefault(); if (can_submit) handlers.on_submit(); }}
    >
      <header class="new-project-header">
        <h2 id="new-project-title">New Notebook</h2>
        <button type="button" class="new-project-close" aria-label="Close" @click=${handlers.on_cancel}>×</button>
      </header>
      <label class="new-project-field">
        <span class="new-project-label">Title</span>
        <input
          name="title"
          type="text"
          autocomplete="off"
          placeholder="e.g. Customer Portal Architecture"
          .value=${state.title}
          @input=${(event: Event) => handlers.on_title((event.target as HTMLInputElement).value)}
        />
      </label>
      <label class="new-project-field">
        <span class="new-project-label">Slug <span class="new-project-hint">a-z 0-9 -</span></span>
        <input
          name="slug"
          type="text"
          class="new-project-slug"
          autocomplete="off"
          spellcheck="false"
          .value=${state.slug}
          @input=${(event: Event) => handlers.on_slug((event.target as HTMLInputElement).value)}
        />
      </label>
      ${state.error ? html`<p class="new-project-error" role="alert">${state.error}</p>` : ''}
      <footer class="new-project-actions">
        <button type="button" class="new-project-cancel" @click=${handlers.on_cancel}>Cancel</button>
        <button type="submit" class="new-project-create" ?disabled=${!can_submit}>
          ${state.submitting ? 'Creating…' : 'Create notebook'}
        </button>
      </footer>
    </form>
  `;
};
