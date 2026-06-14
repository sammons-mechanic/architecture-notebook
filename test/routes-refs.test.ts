import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

const seed = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'A' });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'B' });
};

describe('refs routes', () => {
  test('POST /api/refs creates a manual ref', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'POST', `${N}/api/refs`, { from: 'a', to: 'b', role: 'uses' });
    await server.close();
    assert.deepEqual(
      { status: response.status, source: response.json?.source, role: response.json?.role },
      { status: 201, source: 'manual', role: 'uses' },
    );
  });

  test('DELETE /api/refs/:id on html-sourced ref returns 422 ref-derived', async () => {
    const server = await make_test_server();
    await seed(server.port);
    await request(server.port, 'PATCH', `${N}/api/sections/a`, { html: '<arch-ref to="b">B</arch-ref>' }, { 'If-Match': (await request(server.port, 'GET', `${N}/api/sections/a`)).headers['etag'] });
    const refs_collection = await request(server.port, 'GET', `${N}/api/refs`);
    const ref_id = refs_collection.json._embedded.items.find((entry: any) => entry.source === 'html').id;
    const get_ref = await request(server.port, 'GET', `${N}/api/refs/${ref_id}`);
    const response = await request(server.port, 'DELETE', `${N}/api/refs/${ref_id}`, undefined, { 'If-Match': get_ref.headers['etag'] });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.type, hint: response.json?.hint },
      { status: 422, code: '/errors/ref-derived', hint: `${N}/api/sections/a` },
    );
  });

  test('DELETE /api/refs/:id on manual ref returns 204', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const created = await request(server.port, 'POST', `${N}/api/refs`, { from: 'a', to: 'b' });
    const response = await request(server.port, 'DELETE', `${N}/api/refs/${created.json.id}`, undefined, { 'If-Match': created.headers['etag'] });
    await server.close();
    assert.deepEqual({ status: response.status }, { status: 204 });
  });

  test('GET /api/refs/:id returns _links.self _links.from _links.to', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const created = await request(server.port, 'POST', `${N}/api/refs`, { from: 'a', to: 'b' });
    const response = await request(server.port, 'GET', `${N}/api/refs/${created.json.id}`);
    await server.close();
    assert.deepEqual(Object.keys(response.json._links).sort(), ['from', 'self', 'to']);
  });
});
