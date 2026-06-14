import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { compute_numbering } from '../lib/numbering.ts';
import { list_all_sections } from '../repo-sections.ts';

const escape_like = (input: string): string => input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
const max_limit = 100;
const default_limit = 20;
const snippet_radius = 60;
const snippet_max_len = 180;

type Row = {
  id: number;
  slug: string;
  title: string;
  deck: string | null;
  html: string;
  properties_json: string;
  tags_json: string;
  updated_at: number;
  type_slug: string;
};

// Rank buckets — lower is better.
const rank_title_prefix = 0;
const rank_slug_prefix = 1;
const rank_title_contains = 2;
const rank_slug_contains = 3;
const rank_deck_contains = 4;
const rank_body_contains = 5;
const rank_meta_contains = 6;

const strip_html = (input: string): string =>
  input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const flatten_json_strings = (json_text: string): string => {
  try {
    const parsed = JSON.parse(json_text) as unknown;
    const pieces: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        pieces.push(value);
      } else if (Array.isArray(value)) {
        for (const entry of value) walk(entry);
      } else if (value !== null && typeof value === 'object') {
        for (const entry of Object.values(value as Record<string, unknown>)) walk(entry);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        pieces.push(String(value));
      }
    };
    walk(parsed);
    return pieces.join(' ');
  } catch {
    return json_text;
  }
};

const escape_html = (input: string): string => input.replace(/[&<>"]/g, (ch) => {
  if (ch === '&') return '&amp;';
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  return '&quot;';
});

const make_snippet = (text: string, needle_lower: string): string => {
  if (text.length === 0 || needle_lower.length === 0) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle_lower);
  if (idx < 0) return text.length <= snippet_max_len ? escape_html(text) : escape_html(text.slice(0, snippet_max_len)) + '…';
  const start = Math.max(0, idx - snippet_radius);
  const end = Math.min(text.length, idx + needle_lower.length + snippet_radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + needle_lower.length);
  const after = text.slice(idx + needle_lower.length, end);
  return `${prefix}${escape_html(before)}<mark>${escape_html(match)}</mark>${escape_html(after)}${suffix}`;
};

const pick_match_field = (row: Row, needle_lower: string): { field: string; rank: number; text: string } => {
  const title_lower = row.title.toLowerCase();
  const slug_lower = row.slug.toLowerCase();
  if (title_lower.startsWith(needle_lower)) return { field: 'title', rank: rank_title_prefix, text: row.title };
  if (slug_lower.startsWith(needle_lower)) return { field: 'slug', rank: rank_slug_prefix, text: row.slug };
  if (title_lower.includes(needle_lower)) return { field: 'title', rank: rank_title_contains, text: row.title };
  if (slug_lower.includes(needle_lower)) return { field: 'slug', rank: rank_slug_contains, text: row.slug };
  if (row.deck && row.deck.toLowerCase().includes(needle_lower)) {
    return { field: 'deck', rank: rank_deck_contains, text: row.deck };
  }
  const body_text = strip_html(row.html);
  if (body_text.toLowerCase().includes(needle_lower)) {
    return { field: 'body', rank: rank_body_contains, text: body_text };
  }
  const properties_text = flatten_json_strings(row.properties_json);
  if (properties_text.toLowerCase().includes(needle_lower)) {
    return { field: 'properties', rank: rank_meta_contains, text: properties_text };
  }
  const tags_text = flatten_json_strings(row.tags_json);
  if (tags_text.toLowerCase().includes(needle_lower)) {
    return { field: 'tags', rank: rank_meta_contains, text: tags_text };
  }
  return { field: 'title', rank: rank_meta_contains, text: row.title };
};

export const search_route = (deps: Deps) => (ctx: RouteContext): void => {
  const q = ctx.url.searchParams.get('q') ?? '';
  if (q.length === 0) {
    send_problem(ctx.res, 422, 'validation', 'q is required', ctx.req.url ?? '', { errors: [{ field: 'q', code: 'validation', message: 'q must be a non-empty string' }] });
    return;
  }
  const limit_param = ctx.url.searchParams.get('limit');
  const limit_raw = limit_param ? Number(limit_param) : default_limit;
  const limit = Number.isFinite(limit_raw) ? Math.min(Math.max(1, Math.floor(limit_raw)), max_limit) : default_limit;
  const types_param = ctx.url.searchParams.get('types');
  const type_slugs = types_param ? types_param.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0) : [];
  const escaped = escape_like(q);
  const pattern = `%${escaped}%`;

  // Match against any indexed field — title, slug, deck, html, properties, tags.
  // Re-rank in-memory so prefix matches against title/slug beat body hits.
  const params: Array<string | number> = [pattern, pattern, pattern, pattern, pattern, pattern];
  let sql = `SELECT s.id, s.slug, s.title, s.deck, s.html, s.properties_json, s.tags_json, s.updated_at, st.slug AS type_slug
    FROM sections s JOIN section_types st ON st.id = s.type_id
    WHERE (s.title LIKE ? ESCAPE '\\'
        OR s.slug LIKE ? ESCAPE '\\'
        OR COALESCE(s.deck, '') LIKE ? ESCAPE '\\'
        OR s.html LIKE ? ESCAPE '\\'
        OR s.properties_json LIKE ? ESCAPE '\\'
        OR s.tags_json LIKE ? ESCAPE '\\')`;
  if (type_slugs.length > 0) {
    sql += ` AND st.slug IN (${type_slugs.map(() => '?').join(',')})`;
    params.push(...type_slugs);
  }
  // Pull a larger candidate set so app-side ranking + limit have headroom.
  sql += ' ORDER BY s.updated_at DESC LIMIT ?';
  params.push(Math.min(max_limit * 4, (limit + 1) * 4));
  const rows = deps.db.prepare(sql).all(...params) as Row[];

  const needle_lower = q.toLowerCase();
  const ranked = rows
    .map((row) => ({ row, pick: pick_match_field(row, needle_lower) }))
    .sort((left, right) => {
      if (left.pick.rank !== right.pick.rank) return left.pick.rank - right.pick.rank;
      return right.row.updated_at - left.row.updated_at;
    });
  const truncated = ranked.length > limit;
  const limited = truncated ? ranked.slice(0, limit) : ranked;

  const numbers = compute_numbering(list_all_sections(deps.db).map((entry) => ({
    id: entry.id, slug: entry.slug, parent_id: entry.parent_id, position: entry.position,
  })));
  const results = limited.map(({ row, pick }) => ({
    slug: row.slug,
    title: row.title,
    type: row.type_slug,
    number: numbers.get(row.id) ?? '',
    snippet: make_snippet(pick.text, needle_lower),
    snippet_field: pick.field,
    _links: { self: { href: `/api/sections/${row.slug}` } },
  }));

  const self_href = ctx.url.search.length > 0 ? `/api/search${ctx.url.search}` : `/api/search?q=${encodeURIComponent(q)}`;
  const body: Record<string, unknown> = { query: q, _links: { self: { href: self_href } }, _embedded: { results } };
  if (truncated) {
    body.truncated = true;
  }
  send_response(ctx.res, { status: 200, body }, negotiate_accept(ctx.req.headers.accept));
};
