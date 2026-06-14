import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

// A second notebook for cross-ref targets.
const PEER = 'peer';
const NP = `/n/${PEER}`;

const setup_two_notebooks = async (port: number) => {
  await request(port, 'POST', '/api/notebooks', { slug: PEER, title: 'Peer Notebook' });
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
  await request(port, 'POST', `${NP}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
};

describe('notebook-unit html refs (revised 2026-05-26 — @nb only, no section traversal)', () => {
  test('section in A with <arch-ref to="@peer"> resolves to a notebook-ref edge when peer exists', async () => {
    const server = await make_test_server();
    await setup_two_notebooks(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@peer" role="uses">Peer Notebook</arch-ref>',
    });
    const get_x = await request(server.port, 'GET', `${N}/api/sections/x`);
    const refs = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const cross = refs.json._embedded.items.find((entry: any) => entry.source === 'html' && entry.to_notebook === 'peer');
    assert.deepEqual(
      {
        get_unresolved: get_x.json.unresolved_refs,
        cross_present: !!cross,
        cross_to: cross?.to,
        cross_to_notebook: cross?.to_notebook,
        cross_to_slug_absent: cross?.to_slug === undefined,
        cross_link: cross?._links?.to?.href,
        cross_role: cross?.role,
      },
      {
        get_unresolved: [],
        cross_present: true,
        cross_to: '@peer',
        cross_to_notebook: 'peer',
        cross_to_slug_absent: true,
        cross_link: '/n/peer/api',
        cross_role: 'uses',
      },
    );
  });

  test('section in A with <arch-ref to="@nonexistent"> persists unresolved when the peer notebook is missing', async () => {
    const server = await make_test_server();
    await setup_two_notebooks(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@nonexistent">N</arch-ref>',
    });
    const get_x = await request(server.port, 'GET', `${N}/api/sections/x`);
    await server.close();
    assert.deepEqual(
      { get_unresolved: get_x.json.unresolved_refs },
      { get_unresolved: [{ notebook: 'nonexistent', source: 'html' }] },
    );
  });

  test('arch-ref parser rejects @nb/section with arch-ref-malformed', async () => {
    const server = await make_test_server();
    await setup_two_notebooks(server.port);
    const response = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@peer/section">Section in peer</arch-ref>',
    });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.type },
      { status: 422, code: '/errors/arch-ref-malformed' },
    );
  });

  test('arch-ref parser rejects bare @ with arch-ref-malformed', async () => {
    const server = await make_test_server();
    await setup_two_notebooks(server.port);
    const response = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@">no notebook</arch-ref>',
    });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.type },
      { status: 422, code: '/errors/arch-ref-malformed' },
    );
  });

  test('broadcast on notebook create: unresolved @peer entries resolve to ref edges', async () => {
    const server = await make_test_server();
    // Only `test` notebook exists initially.
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@peer" role="depends">Peer</arch-ref>',
    });
    // Verify unresolved before peer exists.
    const before = await request(server.port, 'GET', `${N}/api/sections/x`);
    // Create the peer notebook.
    await request(server.port, 'POST', '/api/notebooks', { slug: PEER, title: 'Peer' });
    // Verify resolved after.
    const after = await request(server.port, 'GET', `${N}/api/sections/x`);
    const refs_after = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const cross = refs_after.json._embedded.items.find((e: any) => e.to_notebook === 'peer');
    assert.deepEqual(
      {
        before_unresolved: before.json.unresolved_refs,
        after_unresolved: after.json.unresolved_refs,
        cross_to: cross?.to,
        cross_role: cross?.role,
      },
      {
        before_unresolved: [{ notebook: 'peer', source: 'html', role: 'depends' }],
        after_unresolved: [],
        cross_to: '@peer',
        cross_role: 'depends',
      },
    );
  });

  test('broadcast on notebook delete: existing @peer refs demote to unresolved entries', async () => {
    const server = await make_test_server();
    await setup_two_notebooks(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      html: '<arch-ref to="@peer" role="reads">Peer</arch-ref>',
    });
    const before = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    // Delete peer notebook.
    const peer_summary = await request(server.port, 'GET', '/api/notebooks/peer');
    const etag = peer_summary.headers['etag']!;
    const del = await request(server.port, 'DELETE', '/api/notebooks/peer', undefined, { 'If-Match': etag });
    const after = await request(server.port, 'GET', `${N}/api/sections/x`);
    const refs_after = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    assert.deepEqual(
      {
        before_cross_count: before.json._embedded.items.filter((e: any) => e.to_notebook === 'peer').length,
        delete_status: del.status,
        after_unresolved: after.json.unresolved_refs,
        after_cross_count: refs_after.json._embedded.items.filter((e: any) => e.to_notebook === 'peer').length,
      },
      {
        before_cross_count: 1,
        delete_status: 204,
        after_unresolved: [{ notebook: 'peer', source: 'html', role: 'reads' }],
        after_cross_count: 0,
      },
    );
  });
});
