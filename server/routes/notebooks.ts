import type { RouteContext } from '../router.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import type { NotebookManager, NotebookSummary } from '../notebook-manager.ts';

const serialize_summary = (summary: NotebookSummary) => ({
  slug: summary.slug,
  title: summary.title,
  version: summary.version,
  schema_version: summary.schema_version,
  section_count: summary.section_count,
  updated_at: summary.updated_at,
  _links: {
    self: { href: `/api/notebooks/${summary.slug}` },
    root: { href: `/n/${summary.slug}/api` },
    inbound: { href: `/api/notebooks/${summary.slug}/inbound` },
  },
});

export const list_notebooks_route = (manager: NotebookManager) => async (ctx: RouteContext) => {
  const items = await manager.list();
  send_response(ctx.res, {
    status: 200,
    body: {
      total: items.length,
      _embedded: { items: items.map(serialize_summary) },
      _links: { self: { href: '/api/notebooks' } },
      _actions: {
        create: {
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

export const create_notebook_route = (manager: NotebookManager) => (ctx: RouteContext) => {
  const body = ctx.body as { slug?: unknown; title?: unknown } | null;
  if (!body || typeof body !== 'object') {
    send_problem(ctx.res, 422, 'validation', 'Body must be an object', ctx.url.pathname);
    return;
  }
  if (typeof body.slug !== 'string' || typeof body.title !== 'string') {
    send_problem(ctx.res, 422, 'validation', 'slug and title are required', ctx.url.pathname, {
      errors: [
        ...(typeof body.slug !== 'string' ? [{ field: 'slug', code: 'validation', message: 'must be a string' }] : []),
        ...(typeof body.title !== 'string' ? [{ field: 'title', code: 'validation', message: 'must be a string' }] : []),
      ],
    });
    return;
  }
  try {
    const summary = manager.create(body.slug, body.title);
    send_response(ctx.res, {
      status: 201,
      body: serialize_summary(summary),
      headers: { Location: `/api/notebooks/${summary.slug}` },
    }, negotiate_accept(ctx.req.headers.accept));
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'slug-invalid') {
      send_problem(ctx.res, 422, 'slug-invalid', 'slug must match ^[a-z0-9-]+$', ctx.url.pathname);
      return;
    }
    if (code === 'slug-conflict') {
      send_problem(ctx.res, 409, 'slug-conflict', `Notebook ${body.slug} already exists`, ctx.url.pathname);
      return;
    }
    send_problem(ctx.res, 500, 'internal', 'Failed to create notebook', ctx.url.pathname);
  }
};

export const get_notebook_route = (manager: NotebookManager) => (ctx: RouteContext) => {
  const slug = ctx.params.slug;
  const summary = manager.summary(slug);
  if (!summary) {
    send_problem(ctx.res, 404, 'not-found', `No notebook ${slug}`, ctx.url.pathname);
    return;
  }
  send_response(ctx.res, { status: 200, body: serialize_summary(summary) }, negotiate_accept(ctx.req.headers.accept));
};

export const delete_notebook_route = (manager: NotebookManager) => async (ctx: RouteContext) => {
  const slug = ctx.params.slug;
  if (!manager.exists(slug)) {
    send_problem(ctx.res, 404, 'not-found', `No notebook ${slug}`, ctx.url.pathname);
    return;
  }
  await manager.remove(slug);
  ctx.res.writeHead(204);
  ctx.res.end();
};

// GET /api/notebooks/:slug/inbound — for each loaded peer notebook,
// count the refs that point at `slug` plus how many distinct sections
// in that peer hold those refs. Notebook-as-unit symmetry for the
// outbound /refs view (which lives per-section).
export const get_notebook_inbound_route = (manager: NotebookManager) => async (ctx: RouteContext) => {
  const slug = ctx.params.slug;
  if (!manager.exists(slug)) {
    send_problem(ctx.res, 404, 'not-found', `No notebook ${slug}`, ctx.url.pathname);
    return;
  }
  const items: Array<{
    from_notebook: string;
    section_count: number;
    ref_count: number;
    _links: Record<string, { href: string }>;
  }> = [];
  const peers = await manager.list();
  for (const peer of peers) {
    if (peer.slug === slug) continue;
    const entry = manager.get(peer.slug);
    if (!entry) continue;
    const row = entry.db
      .prepare(
        "SELECT COUNT(*) AS ref_count, COUNT(DISTINCT from_id) AS section_count FROM refs WHERE to_notebook = ? AND source IN ('html', 'property')"
      )
      .get(slug) as { ref_count: number; section_count: number } | undefined;
    if (!row || row.ref_count === 0) continue;
    items.push({
      from_notebook: peer.slug,
      section_count: row.section_count,
      ref_count: row.ref_count,
      _links: {
        from_notebook: { href: `/n/${peer.slug}/api` },
      },
    });
  }
  items.sort((left, right) => left.from_notebook.localeCompare(right.from_notebook));
  const self = `/api/notebooks/${slug}/inbound`;
  send_response(ctx.res, {
    status: 200,
    body: {
      total: items.length,
      _links: {
        self: { href: self },
        first: { href: self },
        notebook: { href: `/api/notebooks/${slug}` },
      },
      _embedded: { items },
    },
  }, negotiate_accept(ctx.req.headers.accept));
};
