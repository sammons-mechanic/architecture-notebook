import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The AI-facing authoring contract (skill/SKILL.md), read once at boot. It backs
// two surfaces so they can never drift: the MCP tool description
// (server/routes/mcp.ts) and the HTTP GET /skill endpoint (server/routes/skill.ts).
const skill_md_path = resolve(process.cwd(), 'skill/SKILL.md');

export const SKILL_MD: string = (() => {
  try {
    return readFileSync(skill_md_path, 'utf8');
  } catch {
    return '(skill/SKILL.md not found at server boot)';
  }
})();

// RFC 8288 Link header advertising the authoring guide, emitted on the API
// roots so a plain HTTP client discovers /skill from headers without parsing
// the HAL body. The target is global (no notebook prefix), valid on every root.
export const SERVICE_DOC_LINK_HEADER = '</skill>; rel="service-doc"; type="text/markdown"';
