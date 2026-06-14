import type { RouteContext } from '../router.ts';
import type { Deps } from '../lib/types.ts';
import { send_response, send_problem } from '../response.ts';
import { negotiate_accept } from '../hal.ts';
import { schema_version } from '../db.ts';
import { build_root_doc_for } from '../notebook-root-doc.ts';
import { SERVICE_DOC_LINK_HEADER } from '../skill-doc.ts';
import { set_notebook_major } from '../repo-notebook-meta.ts';

const root_doc = (deps: Deps) => ({
  ...build_root_doc_for(deps.db),
  _actions: {
    'update-notebook': {
      method: 'PATCH',
      href: '/api',
      title: 'Update notebook title; bump the major version (resets minor to 0)',
      schema: {
        fields: [
          { key: 'title', type: 'string', required: false },
          { key: 'major', type: 'number', required: false },
        ],
      },
    },
  },
});

export const get_root = (deps: Deps) => (ctx: RouteContext): void => {
  send_response(
    ctx.res,
    { status: 200, headers: { Link: SERVICE_DOC_LINK_HEADER }, body: root_doc(deps) },
    negotiate_accept(ctx.req.headers.accept),
  );
};

export const get_health = (deps: Deps) => (ctx: RouteContext): void => {
  send_response(
    ctx.res,
    { status: 200, body: { ok: true, version: deps.version, schema_version: schema_version(deps.db) } },
    negotiate_accept(ctx.req.headers.accept),
  );
};

export const patch_root = (deps: Deps) => (ctx: RouteContext): void => {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const allowed = new Set(['title', 'major']);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      send_problem(ctx.res, 422, 'validation', `Unknown field ${JSON.stringify(key)}`, ctx.req.url ?? '', { errors: [{ field: key, code: 'validation', message: `Unknown field ${JSON.stringify(key)}` }] });
      return;
    }
  }
  if (body.title !== undefined && typeof body.title !== 'string') {
    send_problem(ctx.res, 422, 'validation', 'title must be a string', ctx.req.url ?? '', { errors: [{ field: 'title', code: 'validation', message: 'title must be a string' }] });
    return;
  }
  if (body.major !== undefined && (!Number.isInteger(body.major) || (body.major as number) < 0)) {
    send_problem(ctx.res, 422, 'validation', 'major must be a non-negative integer', ctx.req.url ?? '', { errors: [{ field: 'major', code: 'validation', message: 'major must be a non-negative integer' }] });
    return;
  }
  deps.db.exec('BEGIN');
  try {
    if (typeof body.title === 'string') {
      deps.db.prepare("UPDATE meta SET value = ? WHERE key='notebook_title'").run(body.title);
    }
    if (typeof body.major === 'number') {
      set_notebook_major(deps.db, body.major);
    }
    deps.db.exec('COMMIT');
  } catch (error) {
    deps.db.exec('ROLLBACK');
    throw error;
  }
  send_response(ctx.res, { status: 200, body: root_doc(deps) }, negotiate_accept(ctx.req.headers.accept));
};
