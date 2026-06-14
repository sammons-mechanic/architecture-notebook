import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { list_all_sections } from '../repo-sections.ts';
import { compute_numbering } from '../lib/numbering.ts';
import { build_print_html } from '../print-html.ts';

export const print_route = (deps: Deps) => (ctx: RouteContext): void => {
  const sections = list_all_sections(deps.db);
  const numbers = compute_numbering(sections.map((entry) => ({ id: entry.id, slug: entry.slug, parent_id: entry.parent_id, position: entry.position })));
  const notebook_title = (deps.db.prepare("SELECT value FROM meta WHERE key='notebook_title'").get() as { value: string }).value;
  const html = build_print_html(sections, numbers, notebook_title);
  ctx.res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  ctx.res.end(html);
};
