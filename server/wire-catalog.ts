import type { Router } from './router.ts';
import type { NotebookManager } from './notebook-manager.ts';
import { catalog_root_route, catalog_health_route, root_or_spa } from './routes/catalog-root.ts';
import { skill_route } from './routes/skill.ts';
import { llms_txt_route } from './routes/llms.ts';
import {
  list_notebooks_route,
  create_notebook_route,
  get_notebook_route,
  delete_notebook_route,
  get_notebook_inbound_route,
} from './routes/notebooks.ts';

export const register_catalog_routes = (router: Router, manager: NotebookManager, version: string) => {
  // Base URL: SPA for browsers, catalog root document for agents (content
  // negotiated). Registered so `GET /` is no longer an unrouted SPA fallback.
  router.add('GET', '/', root_or_spa(version));
  router.add('GET', '/api', catalog_root_route(version));
  router.add('GET', '/api/health', catalog_health_route(version));
  // Global authoring guide (skill/SKILL.md). Top-level, notebook-agnostic;
  // advertised from both roots via _links['service-doc'] + a Link header.
  router.add('GET', '/skill', skill_route());
  // Plaintext discovery signpost (llmstxt.org). Exempt from the hal/json Accept
  // gate in http-handler.ts, same as /skill.
  router.add('GET', '/llms.txt', llms_txt_route());
  router.add('GET', '/api/notebooks', list_notebooks_route(manager));
  router.add('POST', '/api/notebooks', create_notebook_route(manager));
  router.add('GET', '/api/notebooks/:slug', get_notebook_route(manager));
  router.add('GET', '/api/notebooks/:slug/inbound', get_notebook_inbound_route(manager));
  router.add('DELETE', '/api/notebooks/:slug', delete_notebook_route(manager));
};
