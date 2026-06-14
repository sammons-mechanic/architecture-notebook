import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { make_test_server } from './_helpers.ts';

// The EISDIR crash only reproduces when web/dist exists as a real directory:
// production ships it, but a bare dev checkout does not — which is exactly why
// no existing test caught it (existsSync(web_root) was false, so the directory
// read never happened). Make the directory exist for the duration, creating it
// only when absent so a real build is never clobbered, and removing only what
// this test created.
const web_dist = resolve(process.cwd(), 'web/dist');
const index_html = resolve(web_dist, 'index.html');
let created_dir = false;
let created_index = false;

before(() => {
  if (!existsSync(web_dist)) {
    mkdirSync(web_dist, { recursive: true });
    created_dir = true;
  }
  if (!existsSync(index_html)) {
    writeFileSync(index_html, '<!doctype html><html><body><arch-app></arch-app></body></html>');
    created_index = true;
  }
});

after(() => {
  if (created_index && existsSync(index_html)) {
    rmSync(index_html);
  }
  if (created_dir && existsSync(web_dist)) {
    rmSync(web_dist, { recursive: true, force: true });
  }
});

describe('GET / Accept negotiation does not crash the server', () => {
  test('GET / with Accept: application/json returns non-5xx and the server stays up', async () => {
    const server = await make_test_server();
    // Before the fix this request resolved `candidate` to the web/dist
    // directory and readFileSync threw EISDIR, taking the process down.
    const root = await fetch(`http://127.0.0.1:${server.port}/`, { headers: { Accept: 'application/json' } });
    await root.text();
    const root_ok = root.status < 500;
    // Liveness proof: the process must still answer after the formerly-fatal request.
    const health = await fetch(`http://127.0.0.1:${server.port}/api/health`, { headers: { Accept: 'application/json' } });
    const health_body = await health.json() as { ok?: boolean };
    await server.close();
    assert.deepEqual(
      { root_ok, health_status: health.status, health_ok: health_body.ok },
      { root_ok: true, health_status: 200, health_ok: true },
    );
  });

  test('GET / with no Accept header still serves the SPA index', async () => {
    const server = await make_test_server();
    const root = await fetch(`http://127.0.0.1:${server.port}/`);
    const text = await root.text();
    await server.close();
    assert.deepEqual(
      { status: root.status, is_html: text.includes('<arch-app>') || text.includes('Architecture Notebook') },
      { status: 200, is_html: true },
    );
  });
});
