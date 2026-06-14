import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { newProjectOpen } from '../store-signals.ts';
import { createNotebook } from '../store-notebooks.ts';
import { push_route } from '../router.ts';
import { slug_from_title, is_valid_slug } from '../lib/slug-from-title.ts';
import { new_notebook_form_template, type FormState } from './arch-new-project-form.ts';

class ArchNewProject extends SignalWatcher(LitElement) {
  static properties = {
    title_value: { state: true }, slug_value: { state: true },
    slug_touched: { state: true }, submitting: { state: true }, error_message: { state: true },
  };
  declare title_value: string; declare slug_value: string;
  declare slug_touched: boolean; declare submitting: boolean; declare error_message: string | null;

  constructor() {
    super();
    this.title_value = ''; this.slug_value = '';
    this.slug_touched = false; this.submitting = false; this.error_message = null;
  }

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#on_keydown);
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => this.querySelector<HTMLInputElement>('input[name="title"]')?.focus());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#on_keydown);
    document.body.style.overflow = '';
  }

  #on_keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); newProjectOpen.set(false); }
  };

  #set_title(value: string) {
    this.title_value = value;
    if (!this.slug_touched) this.slug_value = slug_from_title(value);
  }

  async #submit() {
    if (!is_valid_slug(this.slug_value) || this.title_value.trim() === '') return;
    this.submitting = true; this.error_message = null;
    const created = await createNotebook({ title: this.title_value.trim(), slug: this.slug_value });
    this.submitting = false;
    if (!created) { this.error_message = 'Create failed — see the error banner for details.'; return; }
    newProjectOpen.set(false);
    push_route({ kind: 'notebook', notebook: created.slug });
  }

  render() {
    const state: FormState = {
      title: this.title_value, slug: this.slug_value,
      submitting: this.submitting, error: this.error_message,
    };
    return html`
      <div class="new-project-backdrop" @click=${() => newProjectOpen.set(false)}>
        ${new_notebook_form_template(state, {
          on_title: (v) => this.#set_title(v),
          on_slug: (v) => { this.slug_value = v; this.slug_touched = true; },
          on_cancel: () => newProjectOpen.set(false),
          on_submit: () => void this.#submit(),
        })}
      </div>
    `;
  }
}

customElements.define('arch-new-project', ArchNewProject);
