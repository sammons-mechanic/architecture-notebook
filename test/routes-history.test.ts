import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const seed_service_type = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
};

// Build a small history: orders (rev1, rev2 by separate authors) + payments
// (rev1). Insertion order fixes the reverse-chron result because same-second
// writes tie-break on revisions.id DESC.
const seed_history = async (port: number) => {
  const create = await request(port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' }, { 'Arch-Author': 'claude' });
  await request(
    port, 'PATCH', `${N}/api/sections/orders`,
    { title: 'Order Engine', revision_message: 'Renamed' },
    { 'If-Match': create.headers.etag, 'Arch-Author': 'human' },
  );
  await request(port, 'POST', `${N}/api/sections`, { slug: 'payments', title: 'Payments', type: 'service' }, { 'Arch-Author': 'claude' });
};

describe('notebook history timeline', () => {
  test('aggregates every section revision into one reverse-chron feed with section + snapshot links', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await seed_history(server.port);
    const history = await request(server.port, 'GET', `${N}/api/history`);
    const items = history.json._embedded.items as Array<any>;
    await server.close();
    assert.deepEqual(
      {
        status: history.status,
        total: history.json.total,
        has_version: typeof history.json.notebook_version?.minor === 'number',
        order: items.map((item) => `${item.section.slug}#${item.revision}`),
        top_message: items[0].message,
        top_author: items[0].author,
        top_section_link: items[0]._links.section.href,
        top_snapshot_link: items[0]._links.snapshot.href,
      },
      {
        status: 200,
        total: 3,
        has_version: true,
        order: ['payments#1', 'orders#2', 'orders#1'],
        top_message: null,
        top_author: 'claude',
        top_section_link: `${N}/api/sections/payments`,
        top_snapshot_link: `${N}/api/sections/payments/revisions/1`,
      },
    );
  });

  test('a timeline entry snapshot link resolves to that exact historical revision', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await seed_history(server.port);
    const history = await request(server.port, 'GET', `${N}/api/history?author=human`);
    const entry = history.json._embedded.items[0];
    const snapshot = await request(server.port, 'GET', entry._links.snapshot.href);
    await server.close();
    assert.deepEqual(
      {
        filtered_total: history.json.total,
        entry: `${entry.section.slug}#${entry.revision}`,
        snapshot_status: snapshot.status,
        snapshot_title: snapshot.json.title,
        snapshot_message: snapshot.json.message,
      },
      { filtered_total: 1, entry: 'orders#2', snapshot_status: 200, snapshot_title: 'Order Engine', snapshot_message: 'Renamed' },
    );
  });

  test('limit out of range returns 422 validation on the limit field', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await seed_history(server.port);
    const response = await request(server.port, 'GET', `${N}/api/history?limit=0`);
    await server.close();
    assert.deepEqual(
      { status: response.status, type: response.json.type, field: response.json.errors?.[0].field },
      { status: 422, type: '/errors/validation', field: 'limit' },
    );
  });

  test('since in the future filters the feed down to nothing (created_at > since)', async () => {
    const server = await make_test_server();
    await seed_service_type(server.port);
    await seed_history(server.port);
    const response = await request(server.port, 'GET', `${N}/api/history?since=9999999999`);
    await server.close();
    assert.deepEqual(
      { status: response.status, total: response.json.total, items: response.json._embedded.items },
      { status: 200, total: 0, items: [] },
    );
  });

  test('a notebook with no revisions yet returns an empty feed', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api/history`);
    await server.close();
    assert.deepEqual(
      { status: response.status, total: response.json.total, items: response.json._embedded.items, self: response.json._links.self.href },
      { status: 200, total: 0, items: [], self: `${N}/api/history` },
    );
  });

  test('the notebook root advertises the history link', async () => {
    const server = await make_test_server();
    const root = await request(server.port, 'GET', `${N}/api`);
    await server.close();
    assert.deepEqual(
      { history: root.json._links.history?.href, templated: root.json._links.history?.templated },
      { history: `${N}/api/history{?author,since,limit}`, templated: true },
    );
  });
});
