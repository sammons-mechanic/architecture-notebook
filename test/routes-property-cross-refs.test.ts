import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const PEER = 'peer';
const NP = `/n/${PEER}`;

const setup = async (port: number, schema_in_test: ReadonlyArray<unknown> = []) => {
  await request(port, 'POST', '/api/notebooks', { slug: PEER, title: 'Peer Notebook' });
  await request(port, 'POST', `${N}/api/types`, {
    slug: 'service', name: 'Service', property_schema: { fields: schema_in_test },
  });
};

describe('property notebook-unit refs (revised 2026-05-26)', () => {
  test('ref field with @peer resolves to notebook-ref edge when peer exists', async () => {
    const server = await make_test_server();
    await setup(server.port, [{ key: 'depends-on', type: 'ref' }]);
    const create = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      properties: { 'depends-on': '@peer' },
    });
    const refs = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const cross = refs.json._embedded.items.find((entry: any) => entry.source === 'property' && entry.to_notebook === 'peer');
    assert.deepEqual(
      {
        create_status: create.status,
        unresolved: create.json.unresolved_refs,
        prop_round_trip: create.json.properties['depends-on'],
        cross_present: !!cross,
        cross_to: cross?.to,
        cross_to_notebook: cross?.to_notebook,
        cross_role: cross?.role,
        cross_source: cross?.source,
      },
      {
        create_status: 201,
        unresolved: [],
        prop_round_trip: '@peer',
        cross_present: true,
        cross_to: '@peer',
        cross_to_notebook: 'peer',
        cross_role: 'depends-on',
        cross_source: 'property',
      },
    );
  });

  test('multi-ref with mixed local slug and @peer — both resolve', async () => {
    const server = await make_test_server();
    await setup(server.port, [{ key: 'uses', type: 'multi-ref' }]);
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'Local', slug: 'local',
    });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      properties: { uses: ['local', '@peer'] },
    });
    const refs = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const targets = refs.json._embedded.items
      .filter((e: any) => e.source === 'property')
      .map((e: any) => e.to)
      .sort();
    assert.deepEqual(targets, ['@peer', 'local']);
  });

  test('@nb/section is rejected at the validator with a clear error', async () => {
    const server = await make_test_server();
    await setup(server.port, [{ key: 'depends-on', type: 'ref' }]);
    const create = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      properties: { 'depends-on': '@peer/y' },
    });
    await server.close();
    assert.equal(create.status, 422);
  });

  test('optional @peer property surfaces unresolved when peer notebook missing', async () => {
    const server = await make_test_server();
    // Only `test` notebook; no peer.
    await request(server.port, 'POST', `${N}/api/types`, {
      slug: 'service', name: 'Service', property_schema: { fields: [{ key: 'depends-on', type: 'ref' }] },
    });
    const create = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      properties: { 'depends-on': '@nonexistent' },
    });
    await server.close();
    assert.deepEqual(
      { status: create.status, unresolved: create.json.unresolved_refs },
      { status: 201, unresolved: [{ notebook: 'nonexistent', source: 'property', field: 'depends-on' }] },
    );
  });

  test('required @peer property unresolved returns 422 ref-unresolved', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, {
      slug: 'service', name: 'Service', property_schema: { fields: [{ key: 'depends-on', type: 'ref', required: true }] },
    });
    const create = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x',
      properties: { 'depends-on': '@nonexistent' },
    });
    await server.close();
    assert.deepEqual(
      { status: create.status, type: create.json?.type, first_error_code: create.json?.errors?.[0]?.code },
      { status: 422, type: '/errors/validation', first_error_code: 'ref-unresolved' },
    );
  });
});
