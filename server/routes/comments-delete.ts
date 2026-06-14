import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_problem } from '../response.ts';
import { etag_of, check_if_match } from '../hal.ts';
import { find_comment_by_id, delete_comment } from '../repo-comments.ts';

export const delete_comment_route = (deps: Deps) => (ctx: RouteContext): void => {
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
  deps.db.exec('BEGIN');
  try {
    delete_comment(deps.db, row.id);
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  ctx.res.writeHead(204);
  ctx.res.end();
};
