import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of } from '../hal.ts';
import { find_section_by_slug, find_section_by_id } from '../repo-sections.ts';
import { find_comment_by_id, list_comments_for_section } from '../repo-comments.ts';
import { serialize_comment, collection_comment_create_action } from '../serialize-comment.ts';
import { is_valid_anchor } from './comments-validate.ts';

const parse_resolved_filter = (raw: string | null): boolean | null => {
  if (raw === null) return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
};

const parse_anchor_filter = (raw: string | null): string | null => {
  if (raw === null) return null;
  if (!is_valid_anchor(raw)) return null;
  return raw;
};

const build_self_href = (slug: string, resolved: boolean | null, anchor: string | null): string => {
  const parts: string[] = [];
  if (resolved !== null) parts.push(`resolved=${resolved ? 'true' : 'false'}`);
  if (anchor !== null) parts.push(`anchor=${encodeURIComponent(anchor)}`);
  const query = parts.length === 0 ? '' : `?${parts.join('&')}`;
  return `/api/sections/${slug}/comments${query}`;
};

export const list_section_comments_route = (deps: Deps) => (ctx: RouteContext): void => {
  const section = find_section_by_slug(deps.db, ctx.params.slug);
  if (!section) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const filter = parse_resolved_filter(ctx.url.searchParams.get('resolved'));
  const anchor_filter = parse_anchor_filter(ctx.url.searchParams.get('anchor'));
  const rows = list_comments_for_section(deps.db, section.id, filter, anchor_filter);
  const self_href = build_self_href(section.slug, filter, anchor_filter);
  send_response(ctx.res, {
    status: 200,
    body: {
      total: rows.length,
      _links: {
        self: { href: self_href },
        section: { href: `/api/sections/${section.slug}` },
      },
      _embedded: { items: rows.map((row) => serialize_comment(section, row)) },
      _actions: collection_comment_create_action(section.slug),
    },
  }, negotiate_accept(ctx.req.headers.accept));
};

export const get_comment_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_comment_by_id(deps.db, Number(ctx.params.id));
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Comment not found', ctx.req.url ?? '');
    return;
  }
  const section = find_section_by_id(deps.db, row.section_id);
  if (!section) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  send_response(ctx.res, {
    status: 200,
    body: serialize_comment(section, row),
    headers: { ETag: etag_of(row) },
  }, negotiate_accept(ctx.req.headers.accept));
};
