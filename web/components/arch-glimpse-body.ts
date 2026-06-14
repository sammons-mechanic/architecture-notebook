import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { nav_to_section } from '../nav.ts';
import { currentSectionSlug } from '../store-signals.ts';
import type { Section } from '../lib/types.ts';

const open_full = (slug: string) => { nav_to_section(slug); };

export const glimpse_body_template = (section: Section | null) => {
  if (!section) {
    return html`<div class="glimpse-num">loading…</div>`;
  }
  const type_name = section._embedded?.type?.name ?? section.type;
  const current = currentSectionSlug.get();
  const is_self = current === section.slug;
  return html`
    <div class="glimpse-num">${section.number} · ${type_name}</div>
    <h2 class="glimpse-title">${section.title}</h2>
    ${section.tags && section.tags.length > 0 ? html`
      <div class="tags">
        ${section.tags.map((tag) => html`<span class="tag">${tag}</span>`)}
      </div>
    ` : ''}
    ${Object.keys(section.properties).length > 0 ? html`
      <div class="props">
        <div class="props-header"><span>Properties</span></div>
        <dl>
          ${Object.entries(section.properties).map(([key, value]) => html`
            <dt>${key}</dt>
            <dd>${typeof value === 'string' ? value : JSON.stringify(value)}</dd>
          `)}
        </dl>
      </div>
    ` : ''}
    <div class="prose">${unsafeHTML(section.html)}</div>
    ${is_self ? '' : html`
      <span class="glimpse-open" @click=${() => open_full(section.slug)}>Open in full →</span>
    `}
  `;
};
