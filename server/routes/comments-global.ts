import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { compute_numbering, type TreeNode } from '../lib/numbering.ts';
import { list_all_sections, type SectionRow } from '../repo-sections.ts';
import { list_comments_global, type GlobalCommentsFilter } from '../repo-comments-global.ts';
import { serialize_comment } from '../serialize-comment.ts';
import { is_valid_anchor } from './comments-validate.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const parse_bool = (value: string | null): boolean | null => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

const parse_int = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const parse_filter = (url: URL): GlobalCommentsFilter | { kind: 'invalid'; field: string; message: string } => {
  const limit_raw = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limit_raw !== null) {
    const parsed = parse_int(limit_raw);
    if (parsed === null || parsed < 1 || parsed > MAX_LIMIT) {
      return { kind: 'invalid', field: 'limit', message: `limit must be an integer between 1 and ${MAX_LIMIT}` };
    }
    limit = parsed;
  }
  const anchor = url.searchParams.get('anchor');
  if (anchor !== null && !is_valid_anchor(anchor)) {
    return { kind: 'invalid', field: 'anchor', message: 'anchor must match ^section$|^p-\\d+$' };
  }
  return {
    resolved: parse_bool(url.searchParams.get('resolved')),
    author: url.searchParams.get('author'),
    anchor,
    since: parse_int(url.searchParams.get('since')),
    limit,
  };
};

const serialize_with_section = (
  row: { section_id: number; id: number },
  by_id: ReadonlyMap<number, SectionRow>,
  numbers: ReadonlyMap<number, string>,
  serialized: Record<string, unknown>,
): Record<string, unknown> => {
  const section = by_id.get(row.section_id);
  if (!section) return serialized;
  return {
    ...serialized,
    section: {
      slug: section.slug,
      title: section.title,
      number: numbers.get(section.id) ?? '',
      _links: { self: { href: `/api/sections/${section.slug}` } },
    },
  };
};

export const list_notebook_comments_route = (deps: Deps) => (ctx: RouteContext): void => {
  const filter = parse_filter(ctx.url);
  if ('kind' in filter) {
    send_problem(ctx.res, 422, 'validation', filter.message, ctx.req.url ?? '', {
      errors: [{ field: filter.field, code: 'validation', message: filter.message }],
    });
    return;
  }
  const rows = list_comments_global(deps.db, filter);
  const sections = list_all_sections(deps.db);
  const by_id = new Map(sections.map((s) => [s.id, s] as const));
  const numbers = compute_numbering(sections.map((s): TreeNode => ({ id: s.id, slug: s.slug, parent_id: s.parent_id, position: s.position })));
  const items = rows.map((row) => {
    const section = by_id.get(row.section_id);
    if (!section) return null;
    return serialize_with_section(row, by_id, numbers, serialize_comment(section, row));
  }).filter((item): item is Record<string, unknown> => item !== null);
  send_response(ctx.res, {
    status: 200,
    body: {
      total: items.length,
      limit: filter.limit,
      _embedded: { items },
      _links: { self: { href: ctx.req.url ?? '/api/comments' } },
    },
  }, negotiate_accept(ctx.req.headers.accept));
};

