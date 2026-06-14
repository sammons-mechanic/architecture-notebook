import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

const seed_type = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, {
    slug: 'service',
    name: 'Service',
    property_schema: { fields: [{ key: 'engine', type: 'enum', enum: ['sqs'], required: true }] },
  });
};

describe('sections routes', () => {
  test('POST /api/sections creates a section under the seeded type', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    const response = await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'orders', properties: { engine: 'sqs' } });
    await server.close();
    assert.deepEqual(
      { status: response.status, slug: response.json?.slug, type: response.json?.type, etag_present: typeof response.headers['etag'] === 'string' },
      { status: 201, slug: 'orders', type: 'service', etag_present: true },
    );
  });

  test('GET /api/sections/:slug emits every required _link and _action', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'orders', properties: { engine: 'sqs' } });
    const response = await request(server.port, 'GET', `${N}/api/sections/orders`);
    await server.close();
    assert.deepEqual(
      { links: Object.keys(response.json._links).sort(), actions: Object.keys(response.json._actions).sort() },
      { links: ['ancestors', 'children', 'comments', 'refs', 'refs.in', 'refs.out', 'revisions', 'self', 'type'], actions: ['add-child', 'add-ref', 'delete', 'move', 'update'].sort() },
    );
  });

  test('PATCH /api/sections/:slug with stale If-Match returns 412 with current _etag', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'orders', properties: { engine: 'sqs' } });
    const response = await request(server.port, 'PATCH', `${N}/api/sections/orders`, { title: 'Renamed' }, { 'If-Match': 'W/"deadbeef00000000"' });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.type, has_current: typeof response.json?.current_etag === 'string' },
      { status: 412, code: '/errors/etag-mismatch', has_current: true },
    );
  });

  test('PATCH /api/sections/:slug with matching If-Match succeeds and rotates _etag', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'orders', properties: { engine: 'sqs' } });
    const initial_etag = created.headers['etag'];
    const response = await request(server.port, 'PATCH', `${N}/api/sections/orders`, { title: 'Renamed' }, { 'If-Match': initial_etag });
    await server.close();
    assert.deepEqual(
      { status: response.status, title: response.json?.title, etag_rotated: response.headers['etag'] !== initial_etag },
      { status: 200, title: 'Renamed', etag_rotated: true },
    );
  });

  test('POST /api/sections with missing required type returns 422 validation', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    const response = await request(server.port, 'POST', `${N}/api/sections`, { title: 'orders' });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.type, field: response.json?.errors?.[0]?.field },
      { status: 422, code: '/errors/validation', field: 'type' },
    );
  });

  test('POST /api/sections with unknown type returns ref-unresolved hint to /api/types', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/sections`, { type: 'no-such', title: 'x' });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.errors?.[0]?.code, hint: response.json?.errors?.[0]?.hint },
      { status: 422, code: 'ref-unresolved', hint: `${N}/api/types` },
    );
  });
});
