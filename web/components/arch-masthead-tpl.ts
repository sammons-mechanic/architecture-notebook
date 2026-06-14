import { html, nothing } from 'lit';

type Crumb = { readonly slug: string; readonly title: string };

export const mast_crumb_template = (trail: ReadonlyArray<Crumb>) => {
  if (trail.length === 0) {
    return html`<div class="crumb"></div>`;
  }
  const last_index = trail.length - 1;
  return html`
    <div class="crumb">
      <span class="pin">⌖</span>
      ${trail.map((entry, index) => {
        const is_last = index === last_index;
        return html`
          ${is_last
            ? html`<b>${entry.title}</b>`
            : html`<span>${entry.title}</span><span class="sep">/</span>`}
        `;
      })}
    </div>
  `;
};

export type View = 'landing' | 'read' | 'toc' | 'print' | 'history';

export type ToggleTarget = 'read' | 'toc' | 'print' | 'history';

export const mast_toggle_template = (view: View, go: (next: ToggleTarget) => void) => {
  if (view === 'landing') {
    return html`<div class="view-toggle view-toggle-hidden" aria-hidden="true"></div>`;
  }
  const button = (key: ToggleTarget, label: string) => html`
    <button
      class=${view === key ? 'active' : nothing}
      aria-pressed=${view === key ? 'true' : 'false'}
      @click=${() => go(key)}
    >${label}</button>
  `;
  return html`
    <div class="view-toggle">
      ${button('read', 'Read')}
      ${button('toc', 'Contents')}
      ${button('history', 'History')}
      ${button('print', 'Print')}
    </div>
  `;
};
