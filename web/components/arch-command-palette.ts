import { LitElement, html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { signal, SignalWatcher } from '@lit-labs/signals';
import { hal_fetch } from '../lib/hal-fetch.ts';
import { rootDoc, currentNotebookSlug } from '../store-signals.ts';
import { push_route } from '../router.ts';

export const palette_open = signal<boolean>(false);

export const open_palette = () => palette_open.set(true);
export const close_palette = () => palette_open.set(false);

type SearchResult = {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly number: string;
  readonly snippet: string;
  readonly snippet_field: 'title' | 'slug' | 'deck' | 'body' | 'properties' | 'tags';
};

type SearchResponse = {
  readonly query: string;
  readonly truncated?: boolean;
  readonly _embedded?: { readonly results: ReadonlyArray<SearchResult> };
};

const debounce_ms = 140;

class ArchCommandPalette extends SignalWatcher(LitElement) {
  static properties = {
    query: { state: true },
    results: { state: true },
    selected: { state: true },
    pending: { state: true },
    truncated: { state: true },
  };

  query = '';
  results: ReadonlyArray<SearchResult> = [];
  selected = 0;
  pending = false;
  truncated = false;

  #debounce_handle: number | null = null;
  #request_token = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#on_document_keydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#on_document_keydown);
    this.#clear_debounce();
  }

  updated() {
    if (palette_open.get()) {
      const input = this.querySelector<HTMLInputElement>('input.palette-input');
      if (input && document.activeElement !== input) input.focus();
      const active = this.querySelector('.palette-result.active');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }

  #on_document_keydown = (event: KeyboardEvent) => {
    const open = palette_open.get();
    if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
      event.preventDefault();
      if (open) {
        this.#close();
      } else {
        open_palette();
        this.query = '';
        this.results = [];
        this.selected = 0;
      }
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#move_selection(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.#move_selection(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.#open_selected();
    }
  };

  #close() {
    close_palette();
    this.#clear_debounce();
  }

  #move_selection(delta: number) {
    if (this.results.length === 0) return;
    const next = (this.selected + delta + this.results.length) % this.results.length;
    this.selected = next;
  }

  #on_input = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    this.query = value;
    this.selected = 0;
    this.#clear_debounce();
    if (value.trim().length === 0) {
      this.results = [];
      this.truncated = false;
      this.pending = false;
      return;
    }
    this.pending = true;
    this.#debounce_handle = window.setTimeout(() => { void this.#run_search(value); }, debounce_ms);
  };

  #clear_debounce() {
    if (this.#debounce_handle !== null) {
      window.clearTimeout(this.#debounce_handle);
      this.#debounce_handle = null;
    }
  }

  async #run_search(query: string) {
    const search_link = rootDoc.get()?._links.search;
    if (!search_link) {
      this.pending = false;
      this.results = [];
      return;
    }
    const token = ++this.#request_token;
    const response = await hal_fetch<SearchResponse>(search_link, { vars: { q: query, limit: '20' } });
    if (token !== this.#request_token) return;
    this.pending = false;
    if (!response.ok) {
      this.results = [];
      this.truncated = false;
      return;
    }
    this.results = response.body._embedded?.results ?? [];
    this.truncated = response.body.truncated === true;
    if (this.selected >= this.results.length) this.selected = 0;
  }

  #open_selected() {
    const target = this.results[this.selected];
    if (!target) return;
    const notebook = currentNotebookSlug.get();
    if (!notebook) return;
    push_route({ kind: 'section', notebook, slug: target.slug, glimpse: [], cursor: null });
    this.#close();
  }

  #on_result_click = (index: number) => () => {
    this.selected = index;
    this.#open_selected();
  };

  #on_backdrop_click = (event: MouseEvent) => {
    if (event.target === event.currentTarget) this.#close();
  };

  #render_result(result: SearchResult, index: number) {
    const active = index === this.selected ? 'active' : '';
    return html`
      <button
        type="button"
        class="palette-result ${active}"
        @mousemove=${() => { if (this.selected !== index) this.selected = index; }}
        @click=${this.#on_result_click(index)}
      >
        <span class="palette-num">${result.number}</span>
        <span class="palette-body">
          <span class="palette-title">${result.title}</span>
          ${result.snippet_field !== 'title' ? html`
            <span class="palette-snippet">${unsafeHTML(result.snippet)}</span>` : nothing}
        </span>
        <span class="palette-meta">
          <span class="palette-type type-${result.type}">
            <span class="palette-dot" style="background:var(--type-${result.type});"></span>
            ${result.type}
          </span>
          ${result.snippet_field !== 'title' ? html`
            <span class="palette-field">in ${result.snippet_field}</span>` : nothing}
        </span>
      </button>
    `;
  }

  render() {
    if (!palette_open.get()) return nothing;
    const has_query = this.query.trim().length > 0;
    return html`
      <div class="palette-backdrop" @mousedown=${this.#on_backdrop_click}>
        <div class="palette-modal" role="dialog" aria-label="Search">
          <div class="palette-input-row">
            <span class="palette-icon">⌕</span>
            <input
              class="palette-input"
              type="text"
              placeholder="Search this notebook…"
              .value=${this.query}
              @input=${this.#on_input}
              autocomplete="off"
              spellcheck="false"
            />
            <span class="palette-esc">esc</span>
          </div>
          <div class="palette-results">
            ${this.pending && this.results.length === 0
              ? html`<div class="palette-empty">Searching…</div>`
              : !has_query
                ? html`<div class="palette-empty">Type to search titles, decks, bodies, properties, and tags.</div>`
                : this.results.length === 0
                  ? html`<div class="palette-empty">No matches for “${this.query}”.</div>`
                  : this.results.map((result, index) => this.#render_result(result, index))}
          </div>
          <div class="palette-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
            ${this.truncated ? html`<span class="palette-truncated">showing top ${this.results.length}</span>` : nothing}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('arch-command-palette', ArchCommandPalette);
