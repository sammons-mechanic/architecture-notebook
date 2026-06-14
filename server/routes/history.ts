import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { compute_numbering, type TreeNode } from '../lib/numbering.ts';
import { list_all_sections } from '../repo-sections.ts';
import { list_revisions_global, type GlobalRevisionsFilter } from '../repo-revisions-global.ts';
import { read_notebook_version } from '../repo-notebook-meta.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const parse_int = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parse_filter = (url: URL): GlobalRevisionsFilter | { kind: 'invalid'; field: string; message: string } => {
  const limit_raw = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limit_raw !== null) {
    const parsed = parse_int(limit_raw);
    if (parsed === null || parsed < 1 || parsed > MAX_LIMIT) {
      return { kind: 'invalid', field: 'limit', message: `limit must be an integer between 1 and ${MAX_LIMIT}` };
    }
    limit = parsed;
  }
  return {
    author: url.searchParams.get('author'),
    since: parse_int(url.searchParams.get('since')),
    limit,
  };
};

// GET /api/history — the notebook change timeline. Aggregates every section's
// revisions into one reverse-chron feed, each entry linking to the section and
// to that exact historical snapshot (the per-section revision viewer already
// renders and restores it). Mirrors the notebook comments inbox shape.
export const list_notebook_history_route = (deps: Deps) => (ctx: RouteContext): void => {
  const filter = parse_filter(ctx.url);
  if ('kind' in filter) {
    send_problem(ctx.res, 422, 'validation', filter.message, ctx.req.url ?? '', {
      errors: [{ field: filter.field, code: 'validation', message: filter.message }],
    });
    return;
  }
  const rows = list_revisions_global(deps.db, filter);
  const sections = list_all_sections(deps.db);
  const by_id = new Map(sections.map((section) => [section.id, section] as const));
  const numbers = compute_numbering(
    sections.map((section): TreeNode => ({ id: section.id, slug: section.slug, parent_id: section.parent_id, position: section.position })),
  );
  const items = rows
    .map((row) => {
      const section = by_id.get(row.section_id);
      if (!section) {
        return null;
      }
      return {
        section: {
          slug: section.slug,
          title: section.title,
          number: numbers.get(section.id) ?? '',
          _links: { self: { href: `/api/sections/${section.slug}` } },
        },
        revision: row.revision,
        author: row.author,
        message: row.message,
        created_at: row.created_at,
        _links: {
          section: { href: `/api/sections/${section.slug}` },
          snapshot: { href: `/api/sections/${section.slug}/revisions/${row.revision}` },
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  send_response(ctx.res, {
    status: 200,
    body: {
      notebook_version: read_notebook_version(deps.db),
      total: items.length,
      limit: filter.limit,
      _embedded: { items },
      _links: { self: { href: ctx.req.url ?? '/api/history' } },
    },
  }, negotiate_accept(ctx.req.headers.accept));
};
