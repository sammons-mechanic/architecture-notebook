import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const PEER = 'peer';
const NP = `/n/${PEER}`;
const THIRD = 'third';
const NT = `/n/${THIRD}`;

const setup = async (port: number, slugs: ReadonlyArray<string>) => {
  for (const slug of slugs) {
    if (slug === 'test') continue;
    await request(port, 'POST', '/api/notebooks', { slug, title: `${slug} Notebook` });
  }
  for (const slug of slugs) {
    const base = slug === 'test' ? N : `/n/${slug}`;
    await request(port, 'POST', `${base}/api/types`, {
      slug: 'service', name: 'Service', property_schema: { fields: [] },
    });
  }
};

describe('GET /api/notebooks/:slug/inbound (notebook-as-unit symmetry)', () => {
  test('returns empty collection when no peer references this notebook', async () => {
    const server = await make_test_server();
    await setup(server.port, ['test', PEER]);
    const res = await request(server.port, 'GET', '/api/notebooks/test/inbound');
    await server.close();
    assert.deepEqual(
      {
        status: res.status,
        total: res.json.total,
        items: res.json._embedded.items,
        self: res.json._links.self.href,
      },
      {
        status: 200,
        total: 0,
        items: [],
        self: '/api/notebooks/test/inbound',
      },
    );
  });

  test('returns aggregated counts when peers reference this notebook', async () => {
    const server = await make_test_server();
    await setup(server.port, ['test', PEER, THIRD]);
    // Two sections in peer that reference @test, one in third.
    await request(server.port, 'POST', `${NP}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@test" role="uses">Test</arch-ref>',
    });
    await request(server.port, 'POST', `${NP}/api/sections`, {
      type: 'service', title: 'Y', slug: 'y',
      html: '<arch-ref to="@test" role="reads">Test</arch-ref>',
    });
    await request(server.port, 'POST', `${NT}/api/sections`, {
      type: 'service', title: 'Z', slug: 'z',
      html: '<arch-ref to="@test" role="depends">Test</arch-ref>',
    });
    const res = await request(server.port, 'GET', '/api/notebooks/test/inbound');
    await server.close();
    const items = res.json._embedded.items.map((entry: any) => ({
      from_notebook: entry.from_notebook,
      section_count: entry.section_count,
      ref_count: entry.ref_count,
      from_link: entry._links.from_notebook.href,
    }));
    assert.deepEqual(
      { total: res.json.total, items },
      {
        total: 2,
        items: [
          { from_notebook: 'peer', section_count: 2, ref_count: 2, from_link: '/n/peer/api' },
          { from_notebook: 'third', section_count: 1, ref_count: 1, from_link: '/n/third/api' },
        ],
      },
    );
  });

  test('aggregates multiple refs from the same section into ref_count > section_count', async () => {
    const server = await make_test_server();
    await setup(server.port, ['test', PEER]);
    // Single section in peer with TWO refs to @test (different roles).
    await request(server.port, 'POST', `${NP}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@test" role="uses">U</arch-ref><arch-ref to="@test" role="reads">R</arch-ref>',
    });
    const res = await request(server.port, 'GET', '/api/notebooks/test/inbound');
    await server.close();
    assert.deepEqual(
      { total: res.json.total, item: res.json._embedded.items[0] },
      {
        total: 1,
        item: {
          from_notebook: 'peer',
          section_count: 1,
          ref_count: 2,
          _links: { from_notebook: { href: '/n/peer/api' } },
        },
      },
    );
  });

  test('returns 404 for unknown notebook slug', async () => {
    const server = await make_test_server();
    await setup(server.port, ['test']);
    const res = await request(server.port, 'GET', '/api/notebooks/nonexistent/inbound');
    await server.close();
    assert.equal(res.status, 404);
  });

  test('notebook summary _links includes inbound', async () => {
    const server = await make_test_server();
    await setup(server.port, ['test']);
    const res = await request(server.port, 'GET', '/api/notebooks/test');
    await server.close();
    assert.equal(res.json._links.inbound?.href, '/api/notebooks/test/inbound');
  });
});
