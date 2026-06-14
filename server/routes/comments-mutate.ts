import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of, check_if_match } from '../hal.ts';
import { is_failure } from '../lib/failure.ts';
import { read_author } from '../lib/author.ts';
import { find_section_by_slug, find_section_by_id } from '../repo-sections.ts';
import { find_comment_by_id, insert_comment, update_comment } from '../repo-comments.ts';
import { serialize_comment } from '../serialize-comment.ts';
import { validate_body_field, validate_anchor_field, validate_resolved_field } from './comments-validate.ts';

export const create_comment_route = (deps: Deps) => (ctx: RouteContext): void => {
  const section = find_section_by_slug(deps.db, ctx.params.slug);
  if (!section) {
    send_problem(ctx.res, 404, 'not-found', 'Section not found', ctx.req.url ?? '');
    return;
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const author = read_author(ctx.req.headers);
  if (is_failure(author)) {
    send_problem(ctx.res, 422, author.code, author.message, ctx.req.url ?? '', { errors: author.errors });
    return;
  }
  const body_text = validate_body_field(body.body, true);
  if (is_failure(body_text)) {
    send_problem(ctx.res, 422, body_text.code, body_text.message, ctx.req.url ?? '', { errors: body_text.errors });
    return;
  }
  const anchor = validate_anchor_field(body.anchor);
  if (is_failure(anchor)) {
    send_problem(ctx.res, 422, anchor.code, anchor.message, ctx.req.url ?? '', { errors: anchor.errors });
    return;
  }
  const row = insert_comment(deps.db, { section_id: section.id, anchor, body: body_text as string, author });
  send_response(ctx.res, {
    status: 201,
    body: serialize_comment(section, row),
    headers: { Location: `/api/comments/${row.id}`, ETag: etag_of(row) },
  }, negotiate_accept(ctx.req.headers.accept));
};

export const patch_comment_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_comment_by_id(deps.db, Number(ctx.params.id));
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Comment not found', ctx.req.url ?? '');
    return;
  }
  const match = check_if_match(ctx.req.headers['if-match'] as string | undefined, row.etag);
  if (match.kind === 'missing') {
    send_problem(ctx.res, 428, 'precondition-required', 'If-Match required', ctx.req.url ?? '');
    return;
  }
  if (match.kind === 'mismatch') {
    send_problem(ctx.res, 412, 'etag-mismatch', 'ETag mismatch', ctx.req.url ?? '', { current_etag: etag_of(row) });
    return;
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const body_text = validate_body_field(body.body, false);
  if (is_failure(body_text)) {
    send_problem(ctx.res, 422, body_text.code, body_text.message, ctx.req.url ?? '', { errors: body_text.errors });
    return;
  }
  const resolved_value = validate_resolved_field(body.resolved);
  if (is_failure(resolved_value)) {
    send_problem(ctx.res, 422, resolved_value.code, resolved_value.message, ctx.req.url ?? '', { errors: resolved_value.errors });
    return;
  }
  const next = update_comment(deps.db, row.id, { body: body_text as string | undefined, resolved: resolved_value });
  const section = find_section_by_id(deps.db, next.section_id)!;
  send_response(ctx.res, { status: 200, body: serialize_comment(section, next), headers: { ETag: etag_of(next) } }, negotiate_accept(ctx.req.headers.accept));
};

