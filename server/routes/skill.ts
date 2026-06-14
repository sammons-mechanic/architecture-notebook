import type { RouteContext } from '../router.ts';
import { send_response } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { SKILL_MD } from '../skill-doc.ts';

// The skill is the global authoring contract — identical for every notebook —
// so it lives at the top-level /skill, not under /api. Staying out of the /api
// namespace keeps the per-notebook prefix rewriter from injecting a notebook
// slug into the /api/... examples inside the markdown.

const wants_hal = (accept: string | undefined): boolean =>
  typeof accept === 'string' && accept.includes('application/hal+json');

const wants_json = (accept: string | undefined): boolean =>
  typeof accept === 'string' && accept.includes('application/json') && !accept.includes('application/hal+json');

export const skill_route = () => (ctx: RouteContext): void => {
  const accept = ctx.req.headers.accept;
  if (wants_hal(accept) || wants_json(accept)) {
    send_response(
      ctx.res,
      {
        status: 200,
        body: {
          media_type: 'text/markdown',
          _links: { self: { href: '/skill' } },
          content: SKILL_MD,
        },
      },
      negotiate_accept(accept),
    );
    return;
  }
  // Default: the document itself, so `curl /skill` and any agent that just
  // wants the guide gets readable markdown.
  ctx.res.writeHead(200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  ctx.res.end(SKILL_MD);
};
