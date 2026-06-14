import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { graphCache, glimpseStack, glimpseCursor, currentSection, currentSectionSlug, currentView } from '../store-signals.ts';
import { nav_to_section } from '../nav.ts';
import { push_route } from '../router.ts';

const notebook_pattern = /^@([a-z0-9][a-z0-9-]*)$/;

const parse_notebook = (to: string): { notebook: string } | null => {
  const m = notebook_pattern.exec(to);
  return m ? { notebook: m[1] } : null;
};

class ArchRef extends SignalWatcher(LitElement) {
  static properties = {
    to: { type: String },
    role: { type: String },
    broken: { type: String },
  };

  to: string = '';
  role: string = '';
  broken: string = '';

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.#on_activate);
    this.addEventListener('keydown', this.#on_keydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#on_activate);
    this.removeEventListener('keydown', this.#on_keydown);
  }

  #notebook() {
    return parse_notebook(this.to);
  }

  #is_known() {
    const graph = graphCache.get();
    if (!graph) {
      return true;
    }
    return graph.nodes.some((node) => node.slug === this.to);
  }

  #is_broken() {
    if (this.broken === 'true') return true;
    const notebook = this.#notebook();
    if (notebook) {
      // graphCache only carries the current notebook's graph. For
      // notebook-unit refs, consult the current section's
      // unresolved_refs[] — the server populates it with the target
      // notebook when the peer doesn't exist. Match on notebook only;
      // no slug for notebook-unit refs.
      const section = currentSection.get();
      if (!section) return false;
      return (section.unresolved_refs ?? []).some((entry) =>
        entry.source === 'html' && entry.notebook === notebook.notebook
      );
    }
    return !this.#is_known();
  }

  #on_activate = (event: Event) => {
    if (this.#is_broken()) {
      return;
    }
    if (currentView.get() === 'print') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const notebook = this.#notebook();
    if (notebook) {
      // Notebook-unit ref → navigate to the peer notebook's root view.
      push_route({ kind: 'notebook', notebook: notebook.notebook });
      return;
    }
    const section = currentSectionSlug.get();
    if (!section) {
      return;
    }
    const stack = glimpseStack.get();
    const cursor = glimpseCursor.get();
    const next_stack = [...stack.slice(0, cursor + 1), this.to];
    nav_to_section(section, next_stack);
  };

  #on_keydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.key === ' ') {
        event.preventDefault();
      }
      this.#on_activate(event);
    }
  };

  updated() {
    const cursor = glimpseCursor.get();
    const stack = glimpseStack.get();
    const current_target = cursor >= 0 ? stack[cursor] : null;
    const is_active = current_target === this.to && !this.#is_broken();
    const broken = this.#is_broken();
    const notebook = this.#notebook();
    this.classList.toggle('ref', !broken);
    this.classList.toggle('active', is_active);
    if (notebook) {
      this.setAttribute('data-cross', notebook.notebook);
    } else {
      this.removeAttribute('data-cross');
    }
    if (broken) {
      this.setAttribute('data-broken', 'true');
      this.setAttribute('aria-label', notebook ? `notebook ${notebook.notebook} not found` : 'reference target missing');
      this.removeAttribute('tabindex');
      this.removeAttribute('role');
    } else {
      this.removeAttribute('data-broken');
      if (notebook) {
        this.setAttribute('aria-label', `references notebook ${notebook.notebook}`);
      } else {
        this.removeAttribute('aria-label');
      }
      this.setAttribute('tabindex', '0');
      this.setAttribute('role', 'link');
    }
  }

  render() {
    return html`<slot></slot>`;
  }
}

customElements.define('arch-ref', ArchRef);
