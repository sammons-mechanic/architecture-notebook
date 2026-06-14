import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const seed_type = (port: number) => request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
const create_section = (port: number, slug: string) => request(port, 'POST', `${N}/api/sections`, { slug, title: slug, type: 'service' });
const version_of = async (port: number) => (await request(port, 'GET', `${N}/api`)).json.notebook.version;

describe('notebook versioning', () => {
  test('a fresh notebook starts at 0.0', async () => {
    const server = await make_test_server();
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual(version, { major: 0, minor: 0 });
  });

  test('creating a type bumps minor', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual(version, { major: 0, minor: 1 });
  });

  test('creating then patching a section bumps minor each time', async () => {
    const server = await make_test_server();
    await seed_type(server.port);                                  // 0.1
    const created = await create_section(server.port, 'orders');   // 0.2
    await request(server.port, 'PATCH', `${N}/api/sections/orders`, { title: 'Renamed' }, { 'If-Match': created.headers['etag'] }); // 0.3
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual(version, { major: 0, minor: 3 });
  });

  test('a batch bumps minor once, not once per op', async () => {
    const server = await make_test_server();
    const batch = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 't1', method: 'POST', href: `${N}/api/types`, body: { slug: 'queue', name: 'Queue', property_schema: { fields: [] } } },
        { id: 's1', method: 'POST', href: `${N}/api/sections`, body: { type: '$t1.slug', title: 'a' } },
        { id: 's2', method: 'POST', href: `${N}/api/sections`, body: { type: '$t1.slug', title: 'b' } },
      ],
    });
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual({ batch_status: batch.status, version }, { batch_status: 200, version: { major: 0, minor: 1 } });
  });

  test('a comment does not bump minor', async () => {
    const server = await make_test_server();
    await seed_type(server.port);                                  // 0.1
    await create_section(server.port, 'orders');                  // 0.2
    const comment = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'a note' });
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual({ comment_status: comment.status, version }, { comment_status: 201, version: { major: 0, minor: 2 } });
  });

  test('a failed write does not bump minor', async () => {
    const server = await make_test_server();
    await seed_type(server.port);                                  // 0.1
    await create_section(server.port, 'orders');                  // 0.2
    const failed = await request(server.port, 'PATCH', `${N}/api/sections/orders`, { title: 'x' }); // no If-Match → 428
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual({ failed_status: failed.status, version }, { failed_status: 428, version: { major: 0, minor: 2 } });
  });

  test('PATCH /api { major } bumps major and resets minor to 0', async () => {
    const server = await make_test_server();
    await seed_type(server.port);                                  // 0.1
    await create_section(server.port, 'orders');                  // 0.2
    const patched = await request(server.port, 'PATCH', `${N}/api`, { major: 1 });
    await server.close();
    assert.deepEqual(patched.json.notebook.version, { major: 1, minor: 0 });
  });

  test('the catalog summary carries the version', async () => {
    const server = await make_test_server();
    await seed_type(server.port);                                  // 0.1
    const list = await request(server.port, 'GET', '/api/notebooks');
    await server.close();
    const item = list.json._embedded.items.find((entry: { slug: string }) => entry.slug === 'test');
    assert.deepEqual(item.version, { major: 0, minor: 1 });
  });

  test('a comment-only batch does not bump minor', async () => {
    const server = await make_test_server();
    await seed_type(server.port);                                  // 0.1
    await create_section(server.port, 'orders');                  // 0.2
    const comment = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'resolve me' });
    const batch = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [{ id: 'c', method: 'PATCH', href: `${N}/api/comments/${comment.json.id}`, body: { resolved: true } }],
    });
    const version = await version_of(server.port);
    await server.close();
    assert.deepEqual({ batch_status: batch.status, version }, { batch_status: 200, version: { major: 0, minor: 2 } });
  });
});
