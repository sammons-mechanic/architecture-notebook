import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

describe('root routes', () => {
  test('GET /api returns catalog root with notebooks links', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', '/api');
    await server.close();
    const links = response.json._links;
    assert.deepEqual(
      Object.keys(links).sort(),
      ['health', 'notebook', 'notebooks', 'self', 'service-doc'],
    );
  });

  test(`GET ${N}/api returns the per-notebook HAL+JSON entry document`, async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api`);
    await server.close();
    const links = response.json._links;
    assert.deepEqual(
      Object.keys(links).sort(),
      ['batch', 'comments', 'graph', 'history', 'print', 'search', 'sections', 'self', 'service-doc', 'types'],
    );
  });

  test('GET /api/health returns ok and version', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', '/api/health');
    await server.close();
    assert.deepEqual(
      { ok: response.json.ok, has_version: typeof response.json.version === 'string' },
      { ok: true, has_version: true },
    );
  });

  test(`GET ${N}/api returns the notebook title set at create time`, async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api`);
    await server.close();
    assert.deepEqual(response.json.notebook, { title: 'Untitled Notebook', version: { major: 0, minor: 0 } });
  });

  test(`PATCH ${N}/api updates title without requiring If-Match`, async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'PATCH', `${N}/api`, { title: 'Acme' });
    await server.close();
    assert.deepEqual(response.json.notebook, { title: 'Acme', version: { major: 0, minor: 0 } });
  });

  test('server bound to 127.0.0.1', async () => {
    const server = await make_test_server();
    const host = server.host;
    await server.close();
    assert.deepEqual({ host }, { host: '127.0.0.1' });
  });
});
