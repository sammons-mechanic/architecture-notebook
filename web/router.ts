import { parse_hash, build_hash } from './lib/router-parse.ts';
import type { Route } from './lib/router-parse.ts';
import {
  currentSectionSlug, currentView, glimpseStack, glimpseCursor, rootDoc, graphCache, currentNotebookSlug,
} from './store-signals.ts';
import { bootCatalog, bootNotebook, loadSection, resetNotebookContext } from './store-actions.ts';

let last_loaded_section: string | null = null;

const navigate_to = (route: Route, mode: 'push' | 'replace') => {
  const hash = build_hash(route);
  if (mode === 'replace') history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  paint();
};

export const push_route = (route: Route) => navigate_to(route, 'push');
export const replace_route = (route: Route) => navigate_to(route, 'replace');

const first_root_slug = () => graphCache.get()?.nodes.find((node) => node.parent === null)?.slug ?? null;

const apply_section_route = async (notebook: string, slug: string, glimpse: ReadonlyArray<string>, cursor: number | null) => {
  currentNotebookSlug.set(notebook);
  currentSectionSlug.set(slug);
  currentView.set('read');
  glimpseStack.set(glimpse);
  const default_cursor = glimpse.length === 0 ? -1 : glimpse.length - 1;
  const raw = cursor === null ? default_cursor : cursor;
  const clamped = glimpse.length === 0 ? -1 : Math.max(0, Math.min(raw, glimpse.length - 1));
  if (cursor !== null && clamped !== cursor) {
    replace_route({ kind: 'section', notebook, slug, glimpse, cursor: clamped });
    return;
  }
  glimpseCursor.set(clamped);
  const key = `${notebook}::${slug}`;
  if (key !== last_loaded_section) {
    last_loaded_section = key;
    const sections_link = rootDoc.get()?._links.sections;
    if (sections_link) {
      await loadSection({ href: `${sections_link.href}/${encodeURIComponent(slug)}` }, ['type', 'parent', 'refs', 'children', 'ancestors']);
    }
  }
};

const paint = async () => {
  const route = parse_hash(location.hash);
  if (route.kind === 'home') {
    resetNotebookContext();
    currentView.set('landing');
    glimpseStack.set([]);
    glimpseCursor.set(-1);
    last_loaded_section = null;
    await bootCatalog();
    return;
  }
  if (route.kind === 'unknown') {
    replace_route({ kind: 'home' });
    return;
  }
  await bootNotebook(route.notebook);
  if (route.kind === 'notebook') {
    const slug = first_root_slug();
    if (slug) {
      replace_route({ kind: 'section', notebook: route.notebook, slug, glimpse: [], cursor: null });
    } else {
      currentView.set('read');
      currentSectionSlug.set(null);
    }
    return;
  }
  if (route.kind === 'toc') {
    currentView.set('toc');
    currentNotebookSlug.set(route.notebook);
    glimpseStack.set([]);
    glimpseCursor.set(-1);
    return;
  }
  if (route.kind === 'print') {
    currentView.set('print');
    currentNotebookSlug.set(route.notebook);
    glimpseStack.set([]);
    glimpseCursor.set(-1);
    return;
  }
  if (route.kind === 'history') {
    currentView.set('history');
    currentNotebookSlug.set(route.notebook);
    glimpseStack.set([]);
    glimpseCursor.set(-1);
    return;
  }
  await apply_section_route(route.notebook, route.slug, route.glimpse, route.cursor);
};

export const init_router = () => {
  window.addEventListener('popstate', () => { void paint(); });
  window.addEventListener('hashchange', () => { void paint(); });
  void paint();
};

export const current_route = () => parse_hash(location.hash);
