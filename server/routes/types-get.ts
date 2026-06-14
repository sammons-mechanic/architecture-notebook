import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept, etag_of } from '../hal.ts';
import { find_type_by_slug } from '../repo-types.ts';
import { serialize_type } from '../serialize-type.ts';

export const get_type_route = (deps: Deps) => (ctx: RouteContext): void => {
  const row = find_type_by_slug(deps.db, ctx.params.slug);
  if (!row) {
    send_problem(ctx.res, 404, 'not-found', 'Type not found', ctx.req.url ?? '');
    return;
  }
  send_response(ctx.res, { status: 200, body: serialize_type(row), headers: { ETag: etag_of(row) } }, negotiate_accept(ctx.req.headers.accept));
};
