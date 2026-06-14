import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

const create_type_body = {
  slug: 'service',
  name: 'Service',
  color: '#0ea5e9',
  property_schema: {
    fields: [
      { key: 'engine', type: 'enum', enum: ['sqs', 'sns'], required: true },
    ],
  },
};

describe('types routes', () => {
  test('POST /api/types creates a type and returns 201 with Location', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/types`, create_type_body);
    await server.close();
    assert.deepEqual(
      { status: response.status, location: response.headers['location'], slug: response.json.slug },
      { status: 201, location: `${N}/api/types/service`, slug: 'service' },
    );
  });

  test('POST /api/types rejects invalid slug with 422 slug-invalid', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/types`, { ...create_type_body, slug: 'Service Bad' });
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 422, code: '/errors/slug-invalid' });
  });

  test('GET /api/types/:slug returns _links.self and _links.sections', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, create_type_body);
    const response = await request(server.port, 'GET', `${N}/api/types/service`);
    await server.close();
    assert.deepEqual(
      Object.keys(response.json._links).sort(),
      ['sections', 'self'],
    );
  });

  test('DELETE /api/types/:slug returns 409 type-in-use when sections exist', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, create_type_body);
    const get_type = await request(server.port, 'GET', `${N}/api/types/service`);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'srv-one', properties: { engine: 'sqs' } });
    const response = await request(server.port, 'DELETE', `${N}/api/types/service`, undefined, { 'If-Match': get_type.headers['etag'] });
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 409, code: '/errors/type-in-use' });
  });

  test('PATCH /api/types/:slug without If-Match returns 428', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, create_type_body);
    const response = await request(server.port, 'PATCH', `${N}/api/types/service`, { name: 'Other' });
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 428, code: '/errors/precondition-required' });
  });
});
