import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N } from './_helpers.ts';

const seed_section = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
  const created = await request(port, 'POST', `${N}/api/sections`, { slug: 'orders', title: 'Orders', type: 'service' });
  return { section: created.json, etag: created.headers.etag as string };
};

describe('batch PATCH', () => {
  test('atomic propose-and-resolve: PATCH section + PATCH comment in one envelope', async () => {
    const server = await make_test_server();
    const { etag: section_etag } = await seed_section(server.port);
    const comment_post = await request(server.port, 'POST', `${N}/api/sections/orders/comments`, { body: 'mention WAF rate limits' });
    const comment_etag = comment_post.headers.etag as string;
    const comment_id = comment_post.json.id;

    const envelope = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'edit', method: 'PATCH', href: `${N}/api/sections/orders`,
          if_match: section_etag,
          body: { title: 'Orders v2', revision_message: 'address feedback' }},
        { id: 'resolve', method: 'PATCH', href: `${N}/api/comments/${comment_id}`,
          if_match: comment_etag,
          body: { resolved: true }},
      ],
    }, { 'Arch-Author': 'claude' });
    await server.close();
    const ed = envelope.json.results.find((r: any) => r.id === 'edit');
    const rs = envelope.json.results.find((r: any) => r.id === 'resolve');
    assert.deepEqual(
      { env: envelope.status, edit_status: ed.status, edit_title: ed.body.title, resolve_status: rs.status, resolved: rs.body.resolved, edit_author: ed.body.revision_count > 0 },
      { env: 200, edit_status: 200, edit_title: 'Orders v2', resolve_status: 200, resolved: true, edit_author: true },
    );
  });

  test('PATCH section in batch propagates Arch-Author into the new revision', async () => {
    const server = await make_test_server();
    const { etag } = await seed_section(server.port);
    await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [{ id: 'p', method: 'PATCH', href: `${N}/api/sections/orders`, if_match: etag, body: { title: 'Renamed', revision_message: 'rebrand' } }],
    }, { 'Arch-Author': 'claude' });
    const revs = await request(server.port, 'GET', `${N}/api/sections/orders/revisions`);
    await server.close();
    const top = revs.json._embedded.items[0];
    assert.deepEqual(
      { author: top.author, message: top.message, total: revs.json.total },
      { author: 'claude', message: 'rebrand', total: 2 },
    );
  });

  test('PATCH without if_match in batch → 428 precondition-required (op-level)', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const envelope = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [{ id: 'p', method: 'PATCH', href: `${N}/api/sections/orders`, body: { title: 'x' } }],
    });
    await server.close();
    const r = envelope.json.results[0];
    assert.deepEqual(
      { env: envelope.status, rolled_back: envelope.json.rolled_back, status: r.status, type: r.body.type },
      { env: 200, rolled_back: true, status: 428, type: '/errors/precondition-required' },
    );
  });

  test('PATCH with stale if_match in batch → 412 with current_etag + atomic rollback', async () => {
    const server = await make_test_server();
    await seed_section(server.port);
    const envelope = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [{ id: 'p', method: 'PATCH', href: `${N}/api/sections/orders`, if_match: 'W/"stale0000000000"', body: { title: 'x' } }],
    });
    await server.close();
    const r = envelope.json.results[0];
    assert.deepEqual(
      { env: envelope.status, rolled_back: envelope.json.rolled_back, status: r.status, type: r.body.type, has_current: typeof r.body.current_etag === 'string' },
      { env: 200, rolled_back: true, status: 412, type: '/errors/etag-mismatch', has_current: true },
    );
  });

  test('atomic rollback: PATCH section succeeds but later op fails → both rolled back', async () => {
    const server = await make_test_server();
    const { etag } = await seed_section(server.port);
    const envelope = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'a', method: 'PATCH', href: `${N}/api/sections/orders`, if_match: etag, body: { title: 'temp' } },
        { id: 'b', method: 'PATCH', href: `${N}/api/comments/9999`, if_match: 'W/"none0000000000"', body: { resolved: true } },
      ],
    });
    const after = await request(server.port, 'GET', `${N}/api/sections/orders`);
    await server.close();
    assert.deepEqual(
      { rolled_back: envelope.json.rolled_back, title_unchanged: after.json.title, b_status: envelope.json.results[1].status },
      { rolled_back: true, title_unchanged: 'Orders', b_status: 404 },
    );
  });

  test('PATCH type in batch updates name + rotates etag', async () => {
    const server = await make_test_server();
    const created = await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
    const type_etag = created.headers.etag as string;
    const envelope = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [{ id: 't', method: 'PATCH', href: `${N}/api/types/service`, if_match: type_etag, body: { name: 'Backend Service' } }],
    });
    await server.close();
    const r = envelope.json.results[0];
    assert.deepEqual(
      { status: r.status, name: r.body.name, etag_rotated: r.body._etag !== type_etag },
      { status: 200, name: 'Backend Service', etag_rotated: true },
    );
  });
});
