import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request } from './_helpers.ts';

describe('base-URL discoverability', () => {
  test('GET / with Accept: application/hal+json serves the catalog root, not the SPA', async () => {
    const server = await make_test_server();
    const res = await request(server.port, 'GET', '/', undefined, { Accept: 'application/hal+json' });
    await server.close();
    assert.deepEqual(
      {
        status: res.status,
        self: res.json?._links?.self?.href,
        service_doc: res.json?._links?.['service-doc']?.href,
        link_header_has_service_doc: (res.headers['link'] ?? '').includes('service-doc'),
      },
      { status: 200, self: '/api', service_doc: '/skill', link_header_has_service_doc: true },
    );
  });

  test('GET / with Accept: application/json strips hypermedia but keeps the service-doc Link header', async () => {
    const server = await make_test_server();
    const res = await request(server.port, 'GET', '/', undefined, { Accept: 'application/json' });
    await server.close();
    assert.deepEqual(
      {
        status: res.status,
        name: res.json?.name,
        has_links: '_links' in (res.json ?? {}),
        link_header_points_to_skill: (res.headers['link'] ?? '').includes('/skill'),
      },
      { status: 200, name: 'Architecture Notebook', has_links: false, link_header_points_to_skill: true },
    );
  });

  test('GET / with Accept: text/html serves the SPA shell with a service-doc Link header', async () => {
    const server = await make_test_server();
    const res = await request(server.port, 'GET', '/', undefined, { Accept: 'text/html' });
    await server.close();
    assert.deepEqual(
      {
        status: res.status,
        is_html: (res.headers['content-type'] ?? '').includes('text/html'),
        link_header_has_service_doc: (res.headers['link'] ?? '').includes('service-doc'),
      },
      { status: 200, is_html: true, link_header_has_service_doc: true },
    );
  });

  test('GET / with a real-browser multi-type Accept still serves the SPA, not the catalog JSON', async () => {
    const server = await make_test_server();
    const res = await request(server.port, 'GET', '/', undefined, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });
    await server.close();
    assert.deepEqual(
      {
        status: res.status,
        is_html: (res.headers['content-type'] ?? '').includes('text/html'),
        is_catalog_json: res.json?.name === 'Architecture Notebook',
      },
      { status: 200, is_html: true, is_catalog_json: false },
    );
  });

  test('GET /llms.txt is a plaintext signpost naming /api and /skill (not 406-gated)', async () => {
    const server = await make_test_server();
    const res = await fetch(`http://127.0.0.1:${server.port}/llms.txt`, { headers: { Accept: 'text/plain' } });
    const content_type = res.headers.get('content-type') ?? '';
    const body = await res.text();
    await server.close();
    assert.deepEqual(
      {
        status: res.status,
        is_text: content_type.includes('text/plain'),
        names_api: body.includes('/api'),
        names_skill: body.includes('/skill'),
      },
      { status: 200, is_text: true, names_api: true, names_skill: true },
    );
  });
});
