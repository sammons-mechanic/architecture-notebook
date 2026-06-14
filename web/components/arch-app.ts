import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentView, currentSection, currentSectionSlug, glimpseCursor, graphCache, rootDoc, revisionsPanelOpen, commentsPanelOpen } from '../store-signals.ts';
import { bootCatalog } from '../store-actions.ts';
import { skeleton_template } from './arch-app-skeleton.ts';
import './arch-masthead.ts';
import './arch-tree.ts';
import './arch-section-view.ts';
import './arch-glimpse.ts';
import './arch-toc.ts';
import './arch-print.ts';
import './arch-history.ts';
import './arch-not-found.ts';
import './arch-error.ts';
import './arch-landing.ts';
import './arch-revisions.ts';
import './arch-comments.ts';
import './arch-command-palette.ts';

class ArchApp extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void bootCatalog();
  }

  #section_known(): boolean {
    const slug = currentSectionSlug.get();
    const graph = graphCache.get();
    if (!slug || !graph) {
      return false;
    }
    return graph.nodes.some((node) => node.slug === slug);
  }

  #right_rail() {
    if (glimpseCursor.get() >= 0) return html`<arch-glimpse></arch-glimpse>`;
    if (revisionsPanelOpen.get()) return html`<arch-revisions></arch-revisions>`;
    if (commentsPanelOpen.get()) return html`<arch-comments></arch-comments>`;
    return '';
  }

  #read_view() {
    const root = rootDoc.get();
    if (!root || !graphCache.get()) {
      return skeleton_template();
    }
    const known = this.#section_known();
    const slug = currentSectionSlug.get();
    const rail_open = glimpseCursor.get() >= 0 || revisionsPanelOpen.get() || commentsPanelOpen.get();
    const shell_class = rail_open ? 'read-shell panel' : 'read-shell';
    return html`
      <div class=${shell_class}>
        <aside class="tree"><arch-tree></arch-tree></aside>
        ${slug && !known ? html`<arch-not-found></arch-not-found>` :
          (currentSection.get() ? html`<arch-section-view></arch-section-view>` : html`<main class="read"></main>`)}
        ${this.#right_rail()}
      </div>
    `;
  }

  render() {
    const view = currentView.get();
    return html`
      <arch-masthead></arch-masthead>
      ${view === 'landing' ? html`<arch-landing></arch-landing>` : ''}
      ${view === 'read' ? this.#read_view() : ''}
      ${view === 'toc' ? html`<arch-toc></arch-toc>` : ''}
      ${view === 'print' ? html`<arch-print></arch-print>` : ''}
      ${view === 'history' ? html`<arch-history></arch-history>` : ''}
      <arch-error></arch-error>
      <arch-command-palette></arch-command-palette>
    `;
  }
}

customElements.define('arch-app', ArchApp);
