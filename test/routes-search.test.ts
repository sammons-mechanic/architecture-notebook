import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

const seed = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Order Engine', slug: 'service-order-engine' });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Pricing', slug: 'service-pricing' });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Settlement', slug: 'service-settlement' });
};

describe('search route', () => {
  test('GET /api/search?q= returns 422 for empty q', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api/search?q=`);
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 422, code: '/errors/validation' });
  });

  test('GET /api/search returns HAL with _embedded.results', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'GET', `${N}/api/search?q=order`);
    await server.close();
    const result = response.json._embedded.results[0];
    assert.deepEqual(
      { status: response.status, has_self: typeof result._links.self.href === 'string', slug: result.slug },
      { status: 200, has_self: true, slug: 'service-order-engine' },
    );
  });

  test('filter by types= returns only matching types', async () => {
    const server = await make_test_server();
    await seed(server.port);
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'queue', name: 'Queue', property_schema: { fields: [] } });
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'queue', title: 'order-queue', slug: 'order-queue' });
    const response = await request(server.port, 'GET', `${N}/api/search?q=order&types=queue`);
    await server.close();
    const slugs = response.json._embedded.results.map((entry: any) => entry.slug);
    assert.deepEqual({ slugs }, { slugs: ['order-queue'] });
  });

  test('limit caps the result count', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'GET', `${N}/api/search?q=service&limit=1`);
    await server.close();
    assert.deepEqual({ count: response.json._embedded.results.length, truncated: response.json.truncated }, { count: 1, truncated: true });
  });

  test('escapes LIKE wildcard characters', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'GET', `${N}/api/search?q=%25`);
    await server.close();
    assert.deepEqual({ count: response.json._embedded.results.length }, { count: 0 });
  });

  test('matches against body HTML and returns a snippet with the hit marked', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'Order Engine', slug: 'service-order-engine',
      html: '<p>The public HTTPS entrypoint terminates TLS at an ALB issued by Auth0 RS256.</p>',
    });
    const response = await request(server.port, 'GET', `${N}/api/search?q=RS256`);
    await server.close();
    const result = response.json._embedded.results[0];
    assert.deepEqual(
      { status: response.status, slug: result.slug, field: result.snippet_field, has_mark: result.snippet.includes('<mark>RS256</mark>') },
      { status: 200, slug: 'service-order-engine', field: 'body', has_mark: true },
    );
  });

  test('title-prefix ranks above body-contains', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'Background worker', slug: 'background-worker',
      html: '<p>Uses RS256 token signing under the hood.</p>',
    });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'RS256 signing service', slug: 'rs256-signer',
    });
    const response = await request(server.port, 'GET', `${N}/api/search?q=RS256`);
    await server.close();
    const slugs = response.json._embedded.results.map((entry: any) => entry.slug);
    assert.deepEqual({ first: slugs[0], count: slugs.length }, { first: 'rs256-signer', count: 2 });
  });

  test('matches against property values', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, {
      slug: 'ingress', name: 'Ingress',
      property_schema: { fields: [{ key: 'domain', type: 'string' }] },
    });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'ingress', title: 'api.acme.com', slug: 'api-acme', properties: { domain: 'api.acme.com' },
    });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'ingress', title: 'other-host', slug: 'other-host', properties: { domain: 'unrelated.example' },
    });
    const response = await request(server.port, 'GET', `${N}/api/search?q=acme.com`);
    await server.close();
    const slugs = response.json._embedded.results.map((entry: any) => entry.slug);
    assert.deepEqual({ slugs }, { slugs: ['api-acme'] });
  });
});
