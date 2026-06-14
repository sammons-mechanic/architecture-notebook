import type { RouteContext } from '../router.ts';
import { send_response } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { SERVICE_DOC_LINK_HEADER } from '../skill-doc.ts';
import { spa_route } from './spa.ts';

export const catalog_root_route = (version: string) => (ctx: RouteContext) => {
  send_response(ctx.res, {
    status: 200,
    headers: { Link: SERVICE_DOC_LINK_HEADER },
    body: {
      name: 'Architecture Notebook',
      version,
      _links: {
        self: { href: '/api' },
        notebooks: { href: '/api/notebooks' },
        notebook: { href: '/n/{notebook}/api', templated: true },
        health: { href: '/api/health' },
        'service-doc': { href: '/skill', type: 'text/markdown', title: 'AI authoring guide' },
      },
      _actions: {
        'create-notebook': {
          method: 'POST',
          href: '/api/notebooks',
          title: 'Create a notebook',
          schema: { fields: [
            { key: 'slug', type: 'string', required: true },
            { key: 'title', type: 'string', required: true },
          ]},
        },
      },
    },
  }, negotiate_accept(ctx.req.headers.accept));
};

// The base URL `/` is where a cold agent (or a browser) lands first. Browsers
// and plain `curl` (Accept includes text/html, is empty, or is */*) get the SPA
// shell; an agent that asks for json/hal gets the catalog root document so the
// very first hop is discoverable instead of an opaque HTML shell. Both branches
// carry the Link: service-doc header pointing at /skill. A non-HTML,
// non-negotiable Accept (e.g. image/png) intentionally still gets the catalog
// root as hal+json rather than a 406 — the base URL always orients you, the same
// stance as the /skill exemption.
export const root_or_spa = (version: string) => {
  const catalog_root = catalog_root_route(version);
  return (ctx: RouteContext): void => {
    const accept = ctx.req.headers.accept ?? '';
    const wants_html = accept.includes('text/html') || accept === '' || accept === '*/*';
    if (wants_html) {
      ctx.res.setHeader('Link', SERVICE_DOC_LINK_HEADER);
      spa_route()(ctx);
      return;
    }
    catalog_root(ctx);
  };
};

export const catalog_health_route = (version: string) => (ctx: RouteContext) => {
  send_response(ctx.res, {
    status: 200,
    body: { ok: true, version },
  }, negotiate_accept(ctx.req.headers.accept));
};
