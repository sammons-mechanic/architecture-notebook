import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import type { RouteContext } from '../router.ts';

const mime_map: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
};

const web_root = resolve(process.cwd(), 'web/dist');

// Containment check for the static-asset root. A bare `candidate.startsWith(root)`
// also accepts a sibling whose name extends the root's final segment
// (web/dist vs web/distractor), which lets a crafted path escape the asset
// root. Allow only the root itself or paths beneath it (root + separator).
// Exported for direct testing of the boundary.
export const is_within_root = (root: string, candidate: string): boolean =>
  candidate === root || candidate.startsWith(root + sep);

// Detect path-style URLs that should land in the SPA's hash-routed view —
// e.g., someone pasted `/n/foo/section/bar` after stripping a `#`, or a tool
// concatenated path segments. Returns the canonical hash URL to redirect to,
// or null if the path is not a notebook deep link.
const notebook_redirect_target = (pathname: string): string | null => {
  const match = /^\/n\/([a-z0-9-]+)(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;
  const slug = match[1];
  const rest = match[2] ?? '';
  const segments = rest.split('/').filter(Boolean);
  const base = `/#/n/${slug}`;
  if (segments.length === 0) return base;
  if (segments[0] === 'toc' && segments.length === 1) return `${base}/toc`;
  // `print` is a real server route handled before spa fallback; treat any
  // `print` here as a deep-link copy and route to the SPA print view.
  if (segments[0] === 'print' && segments.length === 1) return `${base}/print`;
  if ((segments[0] === 'section' || segments[0] === 'sections') && segments.length >= 2) {
    const slug_seg = segments[1];
    const trailing = segments.slice(2).map(encodeURIComponent).join('/');
    return trailing ? `${base}/section/${slug_seg}/${trailing}` : `${base}/section/${slug_seg}`;
  }
  return null;
};

const send_index = (ctx: RouteContext, status: number): void => {
  const index_path = join(web_root, 'index.html');
  if (!existsSync(index_path)) {
    ctx.res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    ctx.res.end('<!doctype html><html><body>Architecture Notebook (UI not built)</body></html>');
    return;
  }
  const content = readFileSync(index_path);
  ctx.res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  ctx.res.end(content);
};

export const spa_route = () => (ctx: RouteContext): void => {
  const url_path = ctx.url.pathname;
  if (url_path.startsWith('/api/') || url_path === '/api' || url_path === '/print') {
    ctx.res.writeHead(404);
    ctx.res.end();
    return;
  }
  const accept = ctx.req.headers.accept ?? '';
  const wants_html = accept.includes('text/html') || accept === '' || accept === '*/*';
  if (wants_html) {
    const redirect = notebook_redirect_target(url_path);
    if (redirect !== null) {
      const search = ctx.url.search ?? '';
      ctx.res.writeHead(302, { Location: `${redirect}${search}` });
      ctx.res.end();
      return;
    }
  }
  if (url_path === '/' || !url_path.includes('.')) {
    if (wants_html) {
      send_index(ctx, 200);
      return;
    }
  }
  const candidate = resolve(web_root, `.${url_path}`);
  if (!is_within_root(web_root, candidate)) {
    ctx.res.writeHead(404);
    ctx.res.end();
    return;
  }
  // existsSync is true for directories too — reading one with readFileSync
  // throws EISDIR. `GET /` with a non-HTML Accept resolves `candidate` to
  // web_root itself, so guard on isFile() and fall through to the SPA index for
  // anything that is not a regular file.
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    const ext = extname(candidate).toLowerCase();
    const mime = mime_map[ext] ?? 'application/octet-stream';
    const content = readFileSync(candidate);
    ctx.res.writeHead(200, { 'Content-Type': mime });
    ctx.res.end(content);
    return;
  }
  send_index(ctx, 200);
};
