import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const seed_service_type = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
};

describe('revisions', () => {
  test('create section inserts revision 1', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' }, { 'Arch-Author': 'claude' });
    const list = await request(server.port, 'GET', `${N}/api/sections/orders/revisions`);
    await server.close();
    assert.deepEqual(
      { total: list.json.total, first: { revision: list.json._embedded.items[0].revision, author: list.json._embedded.items[0].author } },
      { total: 1, first: { revision: 1, author: 'claude' } },
    );
  });

  test('PATCH section inserts revision N+1 with new values + author + message', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const etag = create.headers.etag;
    await request(
      server.port, 'PATCH', `${N}/api/sections/orders`,
      { title: 'Order Engine', revision_message: 'Renamed' },
      { 'If-Match': etag, 'Arch-Author': 'human' },
    );
    const list = await request(server.port, 'GET', `${N}/api/sections/orders/revisions`);
    const rev2 = await request(server.port, 'GET', `${N}/api/sections/orders/revisions/2`);
    await server.close();
    assert.deepEqual(
      { total: list.json.total, rev2_title: rev2.json.title, rev2_author: rev2.json.author, rev2_message: rev2.json.message },
      { total: 2, rev2_title: 'Order Engine', rev2_author: 'human', rev2_message: 'Renamed' },
    );
  });

  test('section response carries revision_count and _links.revisions', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    await server.close();
    assert.deepEqual(
      { count: create.json.revision_count, link: create.json._links.revisions?.href },
      { count: 1, link: `${N}/api/sections/orders/revisions` },
    );
  });

  test('PATCH with oversized Arch-Author returns 422 header-invalid', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const etag = create.headers.etag;
    const response = await request(
      server.port, 'PATCH', `${N}/api/sections/orders`,
      { title: 'x' },
      { 'If-Match': etag, 'Arch-Author': 'x'.repeat(200) },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, type: response.json.type, field: response.json.errors?.[0].field },
      { status: 422, type: '/errors/header-invalid', field: 'Arch-Author' },
    );
  });

  test('idempotent PATCH replay does not double-insert a revision', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const etag = create.headers.etag;
    await request(
      server.port, 'PATCH', `${N}/api/sections/orders`,
      { title: 'Renamed' },
      { 'If-Match': etag, 'Idempotency-Key': 'rev-replay-key', 'Arch-Author': 'claude' },
    );
    await request(
      server.port, 'PATCH', `${N}/api/sections/orders`,
      { title: 'Renamed' },
      { 'If-Match': etag, 'Idempotency-Key': 'rev-replay-key', 'Arch-Author': 'claude' },
    );
    const list = await request(server.port, 'GET', `${N}/api/sections/orders/revisions`);
    await server.close();
    assert.deepEqual({ total: list.json.total }, { total: 2 });
  });

  test('GET revision number that does not exist returns 404', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const response = await request(server.port, 'GET', `${N}/api/sections/orders/revisions/99`);
    await server.close();
    assert.deepEqual({ status: response.status, type: response.json.type }, { status: 404, type: '/errors/not-found' });
  });
});

describe('revisions restore', () => {
  test('POST restore rewinds title and appends a new revision with default message', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' }, { 'Arch-Author': 'claude' });
    const patched = await request(
      server.port, 'PATCH', `${N}/api/sections/orders`,
      { title: 'Order Engine' },
      { 'If-Match': create.headers.etag, 'Arch-Author': 'human' },
    );
    const restored = await request(
      server.port, 'POST', `${N}/api/sections/orders/revisions/1/restore`,
      {},
      { 'If-Match': patched.headers.etag, 'Arch-Author': 'claude' },
    );
    const rev3 = await request(server.port, 'GET', `${N}/api/sections/orders/revisions/3`);
    await server.close();
    assert.deepEqual(
      { status: restored.status, title: restored.json.title, count: restored.json.revision_count, rev3_message: rev3.json.message, rev3_author: rev3.json.author, rev3_title: rev3.json.title },
      { status: 200, title: 'Orders', count: 3, rev3_message: 'Restored from revision 1', rev3_author: 'claude', rev3_title: 'Orders' },
    );
  });

  test('POST restore honors an explicit revision_message in the body', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const patched = await request(
      server.port, 'PATCH', `${N}/api/sections/orders`,
      { title: 'Order Engine' },
      { 'If-Match': create.headers.etag, 'Arch-Author': 'human' },
    );
    await request(
      server.port, 'POST', `${N}/api/sections/orders/revisions/1/restore`,
      { revision_message: 'Reverted the rename' },
      { 'If-Match': patched.headers.etag, 'Arch-Author': 'claude' },
    );
    const rev3 = await request(server.port, 'GET', `${N}/api/sections/orders/revisions/3`);
    await server.close();
    assert.deepEqual({ message: rev3.json.message }, { message: 'Reverted the rename' });
  });

  test('POST restore without If-Match returns 428 precondition-required', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const response = await request(server.port, 'POST', `${N}/api/sections/orders/revisions/1/restore`, {});
    await server.close();
    assert.deepEqual({ status: response.status, type: response.json.type }, { status: 428, type: '/errors/precondition-required' });
  });

  test('POST restore with stale If-Match returns 412 with current_etag', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const response = await request(
      server.port, 'POST', `${N}/api/sections/orders/revisions/1/restore`,
      {},
      { 'If-Match': 'W/"deadbeefdeadbeef"' },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, type: response.json.type, current_etag: response.json.current_etag },
      { status: 412, type: '/errors/etag-mismatch', current_etag: create.headers.etag },
    );
  });

  test('POST restore on a missing revision returns 404 not-found', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    const create = await request(server.port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
    const response = await request(
      server.port, 'POST', `${N}/api/sections/orders/revisions/42/restore`,
      {},
      { 'If-Match': create.headers.etag },
    );
    await server.close();
    assert.deepEqual({ status: response.status, type: response.json.type }, { status: 404, type: '/errors/not-found' });
  });
});
