import { schema_version, type Database } from './db.ts';
import type { RootDoc } from './lib/types.ts';
import { read_notebook_version } from './repo-notebook-meta.ts';

export const build_root_doc_for = (db: Database): RootDoc => {
  const title_row = db.prepare("SELECT value FROM meta WHERE key = 'notebook_title'").get() as { value?: string } | undefined;
  return {
    name: 'Architecture Notebook',
    schema_version: schema_version(db),
    notebook: {
      title: title_row?.value ?? '',
      version: read_notebook_version(db),
    },
    _links: {
      self: { href: '/api' },
      types: { href: '/api/types' },
      sections: { href: '/api/sections' },
      graph: { href: '/api/graph' },
      search: { href: '/api/search?q={q}', templated: true },
      comments: { href: '/api/comments{?resolved,author,since,anchor,limit}', templated: true },
      history: { href: '/api/history{?author,since,limit}', templated: true },
      batch: { href: '/api/batch' },
      print: { href: '/print' },
      'service-doc': { href: '/skill', type: 'text/markdown', title: 'AI authoring guide' },
    },
  };
};
