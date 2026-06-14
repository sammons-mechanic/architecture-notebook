import { html } from 'lit';
import type { NotebookSummary } from '../store-signals.ts';

const format_updated = (ts: number | null): string => {
  if (!ts) return 'never edited';
  const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  const diff_sec = Math.floor((Date.now() - ms) / 1000);
  if (diff_sec < 60) return 'just now';
  if (diff_sec < 3600) return `${Math.floor(diff_sec / 60)}m ago`;
  if (diff_sec < 86_400) return `${Math.floor(diff_sec / 3600)}h ago`;
  if (diff_sec < 86_400 * 30) return `${Math.floor(diff_sec / 86_400)}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
};

export const notebook_card_template = (notebook: NotebookSummary, on_open: (slug: string) => void) => {
  const count = notebook.section_count;
  return html`
    <button
      class="project-card notebook-card"
      @click=${() => on_open(notebook.slug)}
      aria-label=${`Open notebook ${notebook.title}`}
    >
      <span class="project-card-stripe"></span>
      <span class="project-card-meta">
        <span class="notebook-card-slug">${notebook.slug}</span>
        <span class="project-card-num">v${notebook.version.major}.${notebook.version.minor}</span>
      </span>
      <h2 class="project-card-title">${notebook.title || notebook.slug}</h2>
      <span class="project-card-stats">
        <span>${count} section${count === 1 ? '' : 's'}</span>
        <span class="dotsep">·</span>
        <span>${format_updated(notebook.updated_at)}</span>
      </span>
    </button>
  `;
};

export const new_notebook_tile_template = (on_click: () => void) => html`
  <button class="project-card project-card-new" @click=${on_click} aria-label="New notebook">
    <span class="project-card-plus" aria-hidden="true">+</span>
    <span class="project-card-new-label">New Notebook</span>
    <span class="project-card-new-sub">Start a fresh architecture</span>
  </button>
`;
