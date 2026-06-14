import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection, currentView, currentSectionSlug, rootDoc, graphCache, newProjectOpen, currentNotebookSlug } from '../store-signals.ts';
import { ancestors_of } from '../lib/tree-utils.ts';
import { nav_to_home, nav_to_section, nav_to_toc, nav_to_print, nav_to_history } from '../nav.ts';
import { mast_crumb_template, mast_toggle_template } from './arch-masthead-tpl.ts';

class ArchMasthead extends SignalWatcher(LitElement) {
  createRenderRoot() { return this; }

  #navigate(view: 'read' | 'toc' | 'print' | 'history') {
    if (view === 'toc') { nav_to_toc(); return; }
    if (view === 'print') { nav_to_print(); return; }
    if (view === 'history') { nav_to_history(); return; }
    const slug = currentSectionSlug.get();
    if (slug) nav_to_section(slug);
  }

  #crumb_titles(): ReadonlyArray<{ readonly slug: string; readonly title: string }> {
    const section = currentSection.get();
    const slug = currentSectionSlug.get();
    const graph = graphCache.get();
    if (!graph || !slug) return [];
    const ancestor_slugs = ancestors_of(graph.nodes, slug);
    const lookup = new Map(graph.nodes.map((node) => [node.slug, node.title] as const));
    const trail = ancestor_slugs.map((s) => ({ slug: s, title: lookup.get(s) ?? s }));
    const here = section ? section.title : (lookup.get(slug) ?? slug);
    return [...trail, { slug, title: here }];
  }

  #go_home() {
    newProjectOpen.set(false);
    nav_to_home();
  }

  render() {
    const root = rootDoc.get();
    const view = currentView.get();
    const notebook_slug = currentNotebookSlug.get();
    const trail = view === 'landing' ? [] : this.#crumb_titles();
    const brand_title = view === 'landing' ? 'Architecture Notebook' : (root?.notebook.title || notebook_slug || 'Notebook');
    return html`
      <header class="masthead">
        <button class="brand" type="button" @click=${() => this.#go_home()} aria-label="Go to notebooks">
          <span class="mark"></span>
          <span>${brand_title}</span>
          ${view !== 'landing' && root ? html`<span class="rev">v${root.notebook.version.major}.${root.notebook.version.minor}</span>` : ''}
        </button>
        ${view === 'landing' ? html`<div class="crumb"></div>` : mast_crumb_template(trail)}
        ${mast_toggle_template(view, (next) => this.#navigate(next))}
      </header>
    `;
  }
}

customElements.define('arch-masthead', ArchMasthead);
