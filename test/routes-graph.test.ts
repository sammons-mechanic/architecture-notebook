import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

const seed = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'A' });
  await request(port, 'POST', `${N}/api/sections`, { type: 'service', title: 'B', parent: 'a' });
};

describe('graph route', () => {
  test('GET /api/graph returns nodes and edges arrays', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'GET', `${N}/api/graph`);
    await server.close();
    assert.deepEqual(
      { count: response.json.nodes.length, has_edges: Array.isArray(response.json.edges) },
      { count: 2, has_edges: true },
    );
  });

  test('graph edges use slugs not numeric ids for from/to', async () => {
    const server = await make_test_server();
    await seed(server.port);
    await request(server.port, 'POST', `${N}/api/refs`, { from: 'b', to: 'a' });
    const response = await request(server.port, 'GET', `${N}/api/graph`);
    await server.close();
    const edge = response.json.edges[0];
    assert.deepEqual({ from: edge.from, to: edge.to, has_numeric_id: Number.isInteger(edge.id) }, { from: 'b', to: 'a', has_numeric_id: true });
  });

  test('graph node carries computed number', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'GET', `${N}/api/graph`);
    await server.close();
    const node_a = response.json.nodes.find((entry: any) => entry.slug === 'a');
    const node_b = response.json.nodes.find((entry: any) => entry.slug === 'b');
    assert.deepEqual({ a_number: node_a.number, b_number: node_b.number }, { a_number: '1', b_number: '1.1' });
  });

  test('graph node parent is the parent slug not numeric id', async () => {
    const server = await make_test_server();
    await seed(server.port);
    const response = await request(server.port, 'GET', `${N}/api/graph`);
    await server.close();
    const node_b = response.json.nodes.find((entry: any) => entry.slug === 'b');
    assert.deepEqual({ parent: node_b.parent }, { parent: 'a' });
  });

  test('notebook-unit edges carry to: @nb + to_notebook (no slug)', async () => {
    const server = await make_test_server();
    await seed(server.port);
    await request(server.port, 'POST', '/api/notebooks', { slug: 'peer', title: 'Peer' });
    // Section in test/a referencing @peer via html.
    const a_get = await request(server.port, 'GET', `${N}/api/sections/a`);
    const a_etag = a_get.headers['etag']!;
    await request(server.port, 'PATCH', `${N}/api/sections/a`,
      { html: '<arch-ref to="@peer" role="depends">Peer</arch-ref>', revision_message: 'add cross-ref' },
      { 'If-Match': a_etag },
    );
    // Also keep a local ref so the graph has both kinds in the same response.
    await request(server.port, 'POST', `${N}/api/refs`, { from: 'b', to: 'a' });
    const response = await request(server.port, 'GET', `${N}/api/graph`);
    await server.close();
    const cross = response.json.edges.find((e: any) => e.to_notebook === 'peer');
    const local = response.json.edges.find((e: any) => e.from === 'b' && e.to === 'a');
    assert.deepEqual(
      {
        cross: cross ? { from: cross.from, to: cross.to, to_notebook: cross.to_notebook, has_to_slug: 'to_slug' in cross, role: cross.role, source: cross.source } : null,
        local: local ? { from: local.from, to: local.to, to_notebook: local.to_notebook } : null,
      },
      {
        cross: { from: 'a', to: '@peer', to_notebook: 'peer', has_to_slug: false, role: 'depends', source: 'html' },
        local: { from: 'b', to: 'a', to_notebook: undefined },
      },
    );
  });
});
