import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const seed_section = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
  await request(port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
};

describe('comments routes', () => {
  test('POST creates a comment with author and exposes _links.self', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const response = await request(
      server.port, 'POST', `${N}/api/sections/orders/comments`,
      { body: 'Should we mention the WAF rate limits here?' },
      { 'Arch-Author': 'claude' },
    );
    await server.close();
    assert.deepEqual(
      {
        status: response.status,
        section_slug: response.json?.section_slug,
        author: response.json?.author,
        resolved: response.json?.resolved,
        anchor: response.json?.anchor,
        body: response.json?.body,
        self_href: response.json?._links?.self?.href,
      },
      {
        status: 201,
        section_slug: 'orders',
        author: 'claude',
        resolved: false,
        anchor: 'section',
        body: 'Should we mention the WAF rate limits here?',
        self_href: `${N}/api/comments/${response.json?.id}`,
      },
    );
  });

  test('GET list returns all comments by default and filters when ?resolved is set', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const open = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'open one' });
    const closing = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'closing one' });
    await request(
      server.port, 'PATCH', `${N}/api/comments/${closing.json.id}`,
      { resolved: true },
      { 'If-Match': closing.headers.etag },
    );
    const all = await request(server.port, 'GET', `${N}/api/sections/orders/comments`);
    const open_only = await request(server.port, 'GET', `${N}/api/sections/orders/comments?resolved=false`);
    const resolved_only = await request(server.port, 'GET', `${N}/api/sections/orders/comments?resolved=true`);
    await server.close();
    void open;
    assert.deepEqual(
      { total_all: all.json.total, total_open: open_only.json.total, total_resolved: resolved_only.json.total },
      { total_all: 2, total_open: 1, total_resolved: 1 },
    );
  });

  test('GET /api/comments/:id returns the full body', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'pick me' });
    const fetched = await request(server.port, 'GET', `${N}/api/comments/${created.json.id}`);
    await server.close();
    assert.deepEqual(
      { status: fetched.status, id: fetched.json?.id, body: fetched.json?.body, etag_present: typeof fetched.headers.etag === 'string' },
      { status: 200, id: created.json.id, body: 'pick me', etag_present: true },
    );
  });

  test('PATCH body updates and rotates _etag', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'first' });
    const initial_etag = created.headers.etag;
    const response = await request(
      server.port, 'PATCH', `${N}/api/comments/${created.json.id}`,
      { body: 'second' },
      { 'If-Match': initial_etag },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, body: response.json?.body, rotated: response.headers.etag !== initial_etag },
      { status: 200, body: 'second', rotated: true },
    );
  });

  test('PATCH resolved=true toggles the flag', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'flip me' });
    const response = await request(
      server.port, 'PATCH', `${N}/api/comments/${created.json.id}`,
      { resolved: true },
      { 'If-Match': created.headers.etag },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, resolved: response.json?.resolved },
      { status: 200, resolved: true },
    );
  });

  test('DELETE removes the comment and a follow-up GET returns 404', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'gone soon' });
    const deleted = await request(
      server.port, 'DELETE', `${N}/api/comments/${created.json.id}`,
      undefined,
      { 'If-Match': created.headers.etag },
    );
    const fetched = await request(server.port, 'GET', `${N}/api/comments/${created.json.id}`);
    await server.close();
    assert.deepEqual(
      { delete_status: deleted.status, get_status: fetched.status, get_type: fetched.json?.type },
      { delete_status: 204, get_status: 404, get_type: '/errors/not-found' },
    );
  });

  test('PATCH with stale If-Match returns 412 etag-mismatch', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'will conflict' });
    const response = await request(
      server.port, 'PATCH', `${N}/api/comments/${created.json.id}`,
      { body: 'try again' },
      { 'If-Match': 'W/"deadbeef00000000"' },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, type: response.json?.type, has_current: typeof response.json?.current_etag === 'string' },
      { status: 412, type: '/errors/etag-mismatch', has_current: true },
    );
  });

  test('POST with unsupported anchor returns 422 anchor-unsupported', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const response = await request(
      server.port, 'POST', `${N}/api/sections/orders/comments`,
      { body: 'paragraph anchor', anchor: 'paragraph:3' },
    );
    await server.close();
    assert.deepEqual(
      {
        status: response.status,
        type: response.json?.type,
        field: response.json?.errors?.[0]?.field,
        code: response.json?.errors?.[0]?.code,
      },
      { status: 422, type: '/errors/validation', field: 'anchor', code: 'anchor-unsupported' },
    );
  });

  test('POST with empty body returns 422 validation on body', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const response = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: '   ' });
    await server.close();
    assert.deepEqual(
      { status: response.status, field: response.json?.errors?.[0]?.field, code: response.json?.errors?.[0]?.code },
      { status: 422, field: 'body', code: 'validation' },
    );
  });

  test('Idempotency-Key on POST replays the original response without inserting a duplicate', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const first = await request(
      server.port, 'POST', `${N}/api/sections/orders/comments`,
      { body: 'only-once' },
      { 'Idempotency-Key': 'comment-key-1', 'Arch-Author': 'claude' },
    );
    const second = await request(
      server.port, 'POST', `${N}/api/sections/orders/comments`,
      { body: 'only-once' },
      { 'Idempotency-Key': 'comment-key-1', 'Arch-Author': 'claude' },
    );
    const list = await request(server.port, 'GET', `${N}/api/sections/orders/comments`);
    await server.close();
    assert.deepEqual(
      { first_id: first.json?.id, second_id: second.json?.id, total: list.json?.total },
      { first_id: first.json?.id, second_id: first.json?.id, total: 1 },
    );
  });

  test('POST with anchor "p-0" succeeds and returns the anchor value', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const response = await request(
      server.port, 'POST', `${N}/api/sections/orders/comments`,
      { body: 'on paragraph zero', anchor: 'p-0' },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, anchor: response.json?.anchor, body: response.json?.body },
      { status: 201, anchor: 'p-0', body: 'on paragraph zero' },
    );
  });

  test('POST with bogus anchor returns 422 anchor-unsupported', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const response = await request(
      server.port, 'POST', `${N}/api/sections/orders/comments`,
      { body: 'bad anchor', anchor: 'paragraph:3' },
    );
    await server.close();
    assert.deepEqual(
      { status: response.status, field: response.json?.errors?.[0]?.field, code: response.json?.errors?.[0]?.code },
      { status: 422, field: 'anchor', code: 'anchor-unsupported' },
    );
  });

  test('GET ?anchor=p-0 filters the list to that paragraph', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'section level' });
    await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'p-zero', anchor: 'p-0' });
    await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'p-one', anchor: 'p-1' });
    const filtered = await request(server.port, 'GET', `${N}/api/sections/orders/comments?anchor=p-0`);
    await server.close();
    assert.deepEqual(
      {
        total: filtered.json?.total,
        anchors: filtered.json?._embedded?.items?.map((item: { anchor: string }) => item.anchor),
        self_href: filtered.json?._links?.self?.href,
      },
      {
        total: 1,
        anchors: ['p-0'],
        self_href: `${N}/api/sections/orders/comments?anchor=p-0`,
      },
    );
  });

  test('section response carries comment_count for unresolved comments only and exposes _links.comments', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const open = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'open' });
    const resolved = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'will resolve' });
    await request(
      server.port, 'PATCH', `${N}/api/comments/${resolved.json.id}`,
      { resolved: true },
      { 'If-Match': resolved.headers.etag },
    );
    void open;
    const section = await request(server.port, 'GET', `${N}/api/sections/orders`);
    await server.close();
    assert.deepEqual(
      {
        comment_count: section.json?.comment_count,
        comments_href: section.json?._links?.comments?.href,
      },
      {
        comment_count: 1,
        comments_href: `${N}/api/sections/orders/comments`,
      },
    );
  });
});

describe('notebook-level comments', () => {
  const seed_two_sections = async (port: number) => {
    await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
    await request(port, 'POST', `${N}/api/sections`, { slug: 'a', title: 'A', type: 'service' });
    await request(port, 'POST', `${N}/api/sections`, { slug: 'b', title: 'B', type: 'service' });
  };

  test('returns comments from every section with inline section summary', async () => {
    const server = await make_test_server();
    await seed_two_sections(server.port);
    await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: 'first' }, { 'Arch-Author': 'human' });
    await request(server.port, 'POST', `${N}/api/sections/b/comments`, { body: 'second' }, { 'Arch-Author': 'claude' });
    const response = await request(server.port, 'GET', `${N}/api/comments`);
    await server.close();
    const slugs = response.json._embedded.items.map((it: any) => it.section?.slug).sort();
    assert.deepEqual(
      { status: response.status, total: response.json.total, slugs, has_section_title: response.json._embedded.items.every((it: any) => typeof it.section?.title === 'string') },
      { status: 200, total: 2, slugs: ['a', 'b'], has_section_title: true },
    );
  });

  test('filters by ?resolved=false', async () => {
    const server = await make_test_server();
    await seed_two_sections(server.port);
    const create_a = await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: 'open' });
    const open_id = create_a.json.id;
    const open_etag = create_a.headers.etag;
    await request(server.port, 'POST', `${N}/api/sections/b/comments`, { body: 'will-resolve' });
    const create_b = await request(server.port, 'GET', `${N}/api/comments/${open_id}`);
    await request(server.port, 'PATCH', `${N}/api/comments/${open_id}`, { resolved: true }, { 'If-Match': open_etag });
    const open_only = await request(server.port, 'GET', `${N}/api/comments?resolved=false`);
    await server.close();
    void create_b;
    assert.deepEqual({ total: open_only.json.total, all_open: open_only.json._embedded.items.every((it: any) => it.resolved === false) }, { total: 1, all_open: true });
  });

  test('filters by ?author=claude', async () => {
    const server = await make_test_server();
    await seed_two_sections(server.port);
    await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: 'one' }, { 'Arch-Author': 'human' });
    await request(server.port, 'POST', `${N}/api/sections/b/comments`, { body: 'two' }, { 'Arch-Author': 'claude' });
    const response = await request(server.port, 'GET', `${N}/api/comments?author=claude`);
    await server.close();
    assert.deepEqual({ total: response.json.total, only_claude: response.json._embedded.items.every((it: any) => it.author === 'claude') }, { total: 1, only_claude: true });
  });

  test('?since filters to comments created after the timestamp', async () => {
    const server = await make_test_server();
    await seed_two_sections(server.port);
    await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: 'old' });
    const boundary = Math.floor(Date.now() / 1000);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await request(server.port, 'POST', `${N}/api/sections/b/comments`, { body: 'new' });
    const response = await request(server.port, 'GET', `${N}/api/comments?since=${boundary}`);
    await server.close();
    assert.deepEqual({ total: response.json.total, body: response.json._embedded.items[0]?.body }, { total: 1, body: 'new' });
  });

  test('?limit caps the result set', async () => {
    const server = await make_test_server();
    await seed_two_sections(server.port);
    await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: '1' });
    await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: '2' });
    await request(server.port, 'POST', `${N}/api/sections/a/comments`, { body: '3' });
    const response = await request(server.port, 'GET', `${N}/api/comments?limit=2`);
    await server.close();
    assert.deepEqual({ total: response.json.total, limit: response.json.limit }, { total: 2, limit: 2 });
  });

  test('?limit out of range returns 422 validation', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api/comments?limit=9999`);
    await server.close();
    assert.deepEqual({ status: response.status, type: response.json.type, field: response.json.errors?.[0]?.field }, { status: 422, type: '/errors/validation', field: 'limit' });
  });

  test('per-notebook root advertises _links.comments as templated', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api`);
    await server.close();
    const link = response.json._links.comments;
    assert.deepEqual(
      { has_link: typeof link?.href === 'string', templated: link?.templated === true, scoped: typeof link?.href === 'string' && link.href.startsWith(`${N}/api/comments`) },
      { has_link: true, templated: true, scoped: true },
    );
  });
});

