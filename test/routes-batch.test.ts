import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

describe('batch route', () => {
  test('atomic batch creating a type and two sections with back-refs returns 201s', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 't1', method: 'POST', href: `${N}/api/types`, body: { slug: 'queue', name: 'Queue', property_schema: { fields: [] } } },
        { id: 's1', method: 'POST', href: `${N}/api/sections`, body: { type: '$t1.slug', title: 'orders-events' } },
        { id: 's2', method: 'POST', href: `${N}/api/sections`, body: { type: '$t1.slug', title: 'settlement-events' } },
      ],
    });
    await server.close();
    const statuses = response.json.results.map((entry: any) => entry.status);
    assert.deepEqual({ envelope: response.status, statuses }, { envelope: 200, statuses: [201, 201, 201] });
  });

  test('atomic batch with failing op rolls back all writes', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 't1', method: 'POST', href: `${N}/api/types`, body: { slug: 'queue', name: 'Queue', property_schema: { fields: [] } } },
        { id: 's1', method: 'POST', href: `${N}/api/sections`, body: { type: 'no-such-type', title: 'x' } },
      ],
    });
    const after = await request(server.port, 'GET', `${N}/api/types/queue`);
    await server.close();
    assert.deepEqual(
      { envelope: response.status, rolled_back: response.json.rolled_back, type_state: after.status },
      { envelope: 200, rolled_back: true, type_state: 404 },
    );
  });

  test('batch with unknown opid token marks dependents with dependency-aborted', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'a', method: 'POST', href: `${N}/api/sections`, body: { type: '$missing.slug', title: 'x' } },
      ],
    });
    await server.close();
    assert.deepEqual(
      { envelope: response.status, code: response.json.results[0].body.type },
      { envelope: 200, code: '/errors/backref-unresolved' },
    );
  });

  test('batch with dependency cycle returns envelope 422 cycle-illegal', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'a', method: 'POST', href: `${N}/api/sections`, body: { title: '$b.slug' } },
        { id: 'b', method: 'POST', href: `${N}/api/sections`, body: { title: '$a.slug' } },
      ],
    });
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 422, code: '/errors/cycle-illegal' });
  });

  test('non-atomic batch continues past failing op for independent ops', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: false,
      ops: [
        { id: 'bad', method: 'POST', href: `${N}/api/sections`, body: { type: 'nope', title: 'x' } },
        { id: 'good', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'Good Section', slug: 'good-section' } },
      ],
    });
    await server.close();
    assert.deepEqual(
      response.json.results.map((entry: any) => ({ id: entry.id, status: entry.status })),
      [{ id: 'bad', status: 422 }, { id: 'good', status: 201 }],
    );
  });

  test('per-op Idempotency-Key is rejected', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'a', idempotency_key: 'x', method: 'POST', href: `${N}/api/types`, body: { slug: 'queue', name: 'Q' } },
      ],
    });
    await server.close();
    assert.deepEqual(
      { status: response.status, code: response.json?.type },
      { status: 422, code: '/errors/validation' },
    );
  });

  test('token .id substitutes an integer not a string', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 's1', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'A' } },
        { id: 's2', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'B' } },
        { id: 'r1', method: 'POST', href: `${N}/api/refs`, body: { from: '$s1.slug', to: '$s2.slug' } },
      ],
    });
    await server.close();
    const ref_body = response.json.results[2].body;
    assert.deepEqual(
      { id_is_integer: Number.isInteger(ref_body.id), from: ref_body.from, to: ref_body.to },
      { id_is_integer: true, from: 'a', to: 'b' },
    );
  });

  test('atomic batch envelope status is 200 even with rollback', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'a', method: 'POST', href: `${N}/api/types`, body: { slug: 'bad slug', name: 'X' } },
      ],
    });
    await server.close();
    assert.deepEqual({ envelope: response.status, rolled_back: response.json.rolled_back, inner: response.json.results[0].status }, { envelope: 200, rolled_back: true, inner: 422 });
  });
});
