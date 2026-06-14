import { html, nothing, type TemplateResult } from 'lit';
import type { HistoryEntry } from '../lib/history-store.ts';

const relative_time = (created_at: number) => {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - created_at));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(created_at * 1000).toISOString().slice(0, 10);
};

export type HistoryViewArgs = {
  readonly title: string;
  readonly version: string;
  readonly total: number;
  readonly items: ReadonlyArray<HistoryEntry>;
  readonly loading: boolean;
  readonly on_open: (entry: HistoryEntry) => void;
};

const history_row = (args: HistoryViewArgs, entry: HistoryEntry) => html`
  <li class="history-row" @click=${() => args.on_open(entry)}>
    <span class="history-num">${entry.section.number}</span>
    <span class="history-main">
      <span class="history-section">${entry.section.title}</span>
      <span class="history-msg">${entry.message ?? html`<em>no message</em>`}</span>
    </span>
    <span class="history-rev">r${entry.revision}</span>
    <span class="history-author">${entry.author ?? 'unknown'}</span>
    <span class="history-time">${relative_time(entry.created_at)}</span>
  </li>
`;

export const history_view_template = (args: HistoryViewArgs): TemplateResult => html`
  <div class="history-shell">
    <div class="history-eyebrow">Architecture Notebook</div>
    <h1 class="history-title">History</h1>
    <p class="history-subtitle">${args.title}</p>
    <div class="history-meta">
      <span>Version<b>${args.version}</b></span>
      <span>Changes<b>${args.total}</b></span>
    </div>
    ${args.loading ? html`<div class="history-loading">loading…</div>` : nothing}
    ${!args.loading && args.items.length === 0 ? html`<div class="history-empty">No history yet</div>` : nothing}
    ${args.items.length > 0 ? html`
      <ul class="history-list">
        ${args.items.map((entry) => history_row(args, entry))}
      </ul>
    ` : nothing}
  </div>
`;
