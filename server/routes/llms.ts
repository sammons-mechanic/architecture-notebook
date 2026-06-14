import type { RouteContext } from '../router.ts';

// A plaintext discovery file (llmstxt.org convention) naming the machine-facing
// entry points, so an agent given only the base URL can orient with one GET that
// needs no HAL/JSON negotiation. Kept deliberately tiny — /skill is the full
// contract; this is the signpost that points at it.
const LLMS_TXT = [
  '# Architecture Notebook',
  '',
  'A versioned HAL+JSON notebook for documenting system architectures.',
  '',
  '## Entry points',
  '- HAL+JSON API root: /api  (send `Accept: application/hal+json`)',
  '- AI authoring guide (the full contract): /skill  (send `Accept: text/markdown`)',
  '- MCP transport (SSE): /mcp/sse',
  '- Health: /api/health',
  '',
  'Start at /skill, then follow `_links` / `_actions` from /api. Never construct URLs.',
  '',
].join('\n');

export const llms_txt_route = () => (ctx: RouteContext): void => {
  ctx.res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  ctx.res.end(LLMS_TXT);
};
