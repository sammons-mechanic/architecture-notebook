import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { RevisionSummary, RevisionFull } from '../lib/revisions-store.ts';

const relative_time = (created_at: number) => {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - created_at));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export type RevisionsCardArgs = {
  readonly count: number;
  readonly recent: ReadonlyArray<RevisionSummary>;
  readonly truncate: (message: string | null) => string;
  readonly on_view_all: () => void;
};

export const revisions_card_template = (args: RevisionsCardArgs): TemplateResult => html`
  <section class="revisions-card">
    <h4>Revisions</h4>
    ${args.count === 0 ? html`<div class="revisions-empty">no revisions yet</div>` : html`
      <ul class="revisions-recent">
        ${args.recent.map((item) => html`
          <li>
            <span class="revisions-num">r${item.revision}</span>
            <span class="revisions-author">${item.author ?? 'unknown'}</span>
            <span class="revisions-msg">${args.truncate(item.message) || html`<em>no message</em>`}</span>
            <span class="revisions-time">${relative_time(item.created_at)}</span>
          </li>
        `)}
      </ul>
      ${args.count > 3 ? html`
        <button class="revisions-view-all" @click=${args.on_view_all}>View all (${args.count}) →</button>
      ` : nothing}
    `}
  </section>
`;

export type RevisionsPanelArgs = {
  readonly count: number;
  readonly items: ReadonlyArray<RevisionSummary>;
  readonly loading: boolean;
  readonly selected_number: number | null;
  readonly selected: RevisionFull | null;
  readonly current_revision: number;
  readonly restore_message: string;
  readonly restore_in_flight: boolean;
  readonly on_close: () => void;
  readonly on_select: (item: RevisionSummary) => void;
  readonly on_message_input: (next: string) => void;
  readonly on_restore: () => void;
};

const revision_row = (args: RevisionsPanelArgs, item: RevisionSummary) => {
  const is_current = item.revision === args.current_revision;
  const is_selected = item.revision === args.selected_number;
  const classes = `revisions-row${is_selected ? ' selected' : ''}${is_current ? ' current' : ''}`;
  return html`
    <li class=${classes} @click=${() => args.on_select(item)}>
      <span class="revisions-num">r${item.revision}${is_current ? html`<span class="revisions-pill">current</span>` : nothing}</span>
      <span class="revisions-author">${item.author ?? 'unknown'}</span>
      <span class="revisions-msg">${item.message ?? html`<em>no message</em>`}</span>
      <span class="revisions-time">${relative_time(item.created_at)}</span>
    </li>
  `;
};

const preview_block = (args: RevisionsPanelArgs) => {
  const revision = args.selected;
  if (!revision) return args.selected_number !== null ? html`<div class="revisions-preview-loading">loading…</div>` : nothing;
  const can_restore = revision.revision !== args.current_revision;
  return html`
    <div class="revisions-preview">
      <div class="revisions-preview-meta">r${revision.revision} · ${revision.author ?? 'unknown'} · ${relative_time(revision.created_at)}</div>
      <h3 class="revisions-preview-title">${revision.title}</h3>
      ${revision.deck ? html`<p class="revisions-preview-deck">${revision.deck}</p>` : nothing}
      ${revision.tags.length > 0 ? html`<div class="revisions-preview-tags">${revision.tags.map((tag) => html`<span class="tag">${tag}</span>`)}</div>` : nothing}
      ${Object.keys(revision.properties).length > 0 ? html`<pre class="revisions-preview-props">${JSON.stringify(revision.properties, null, 2)}</pre>` : nothing}
      <div class="revisions-preview-html">${unsafeHTML(revision.html)}</div>
      ${can_restore ? html`
        <div class="revisions-restore">
          <input class="revisions-restore-input" type="text" placeholder="revision message (optional)"
            .value=${args.restore_message} @input=${(event: Event) => args.on_message_input((event.target as HTMLInputElement).value)} />
          <button class="revisions-restore-button" ?disabled=${args.restore_in_flight} @click=${args.on_restore}>
            ${args.restore_in_flight ? 'Restoring…' : `Restore r${revision.revision}`}
          </button>
        </div>
      ` : nothing}
    </div>
  `;
};

export const revisions_panel_template = (args: RevisionsPanelArgs): TemplateResult => html`
  <aside class="revisions-panel" role="dialog" aria-label="Revisions panel">
    <div class="revisions-head">
      <span class="label">Revisions<span class="badge">${args.count}</span></span>
      <button title="close" @click=${args.on_close}>✕</button>
    </div>
    ${args.loading ? html`<div class="revisions-loading">loading…</div>` : html`
      <ul class="revisions-list">
        ${args.items.map((item) => revision_row(args, item))}
      </ul>
    `}
    ${preview_block(args)}
  </aside>
`;
