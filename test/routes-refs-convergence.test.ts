import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, make_memory_db, seed_type as direct_seed_type, seed_section as direct_seed_section, N } from './_helpers.ts';
import { backfill_unresolved_refs, load_unresolved_refs } from '../server/refs-sync.ts';

const seed_type = async (port: number) => {
  await request(port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });
};

describe('ref convergence', () => {
  test('atomic batch: html ref to a later-created sibling converges to a resolved edge by end-of-batch', async () => {
    // Per-op responses are snapshots from when the op ran; intra-batch refs
    // converge at COMMIT and become visible on subsequent reads.
    const server = await make_test_server();
    await seed_type(server.port);
    const batch = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'x', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="y">Y</arch-ref>' } },
        { id: 'y', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'Y', slug: 'y' } },
      ],
    });
    const get_x = await request(server.port, 'GET', `${N}/api/sections/x`);
    const refs = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const html_out = refs.json._embedded.items.filter((entry: any) => entry.source === 'html' && entry.to === 'y');
    assert.deepEqual(
      {
        envelope: batch.status,
        get_status: get_x.status,
        unresolved_at_read: get_x.json.unresolved_refs,
        resolved_edges_to_y: html_out.length,
      },
      {
        envelope: 200,
        get_status: 200,
        unresolved_at_read: [],
        resolved_edges_to_y: 1,
      },
    );
  });

  test('atomic batch: html ref to a never-existing slug is persisted and surfaced on GET', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'x', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="never-exists">N</arch-ref>' } },
      ],
    });
    const get_x = await request(server.port, 'GET', `${N}/api/sections/x`);
    await server.close();
    assert.deepEqual(
      {
        get_status: get_x.status,
        unresolved: get_x.json.unresolved_refs,
      },
      {
        get_status: 200,
        unresolved: [{ slug: 'never-exists', source: 'html' }],
      },
    );
  });

  test('cross-batch: a later-created target re-resolves earlier unresolved refs', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    // Batch 1: create X with unresolved html ref to y.
    const first = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="y">Y</arch-ref>',
    });
    const before_y = await request(server.port, 'GET', `${N}/api/sections/x`);
    // Batch 2: create Y. X's previously-unresolved ref should resolve.
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Y', slug: 'y' });
    const after_y = await request(server.port, 'GET', `${N}/api/sections/x`);
    const refs = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const html_to_y = refs.json._embedded.items.filter((entry: any) => entry.source === 'html' && entry.to === 'y');
    assert.deepEqual(
      {
        first_status: first.status,
        unresolved_before_y: before_y.json.unresolved_refs,
        unresolved_after_y: after_y.json.unresolved_refs,
        resolved_edges_to_y: html_to_y.length,
      },
      {
        first_status: 201,
        unresolved_before_y: [{ slug: 'y', source: 'html' }],
        unresolved_after_y: [],
        resolved_edges_to_y: 1,
      },
    );
  });

  test('PATCH that removes an unresolved ref clears it from the persisted list', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    const created = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="ghost">G</arch-ref>',
    });
    const before = await request(server.port, 'GET', `${N}/api/sections/x`);
    await request(server.port, 'PATCH', `${N}/api/sections/x`, { html: '<p>no refs here</p>' }, { 'If-Match': created.headers['etag'] });
    const after = await request(server.port, 'GET', `${N}/api/sections/x`);
    await server.close();
    assert.deepEqual(
      {
        before: before.json.unresolved_refs,
        after: after.json.unresolved_refs,
      },
      {
        before: [{ slug: 'ghost', source: 'html' }],
        after: [],
      },
    );
  });

  test('atomic batch: rolling back a failed op also rolls back persisted unresolved_refs', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    const response = await request(server.port, 'POST', `${N}/api/batch`, {
      atomic: true,
      ops: [
        { id: 'x', method: 'POST', href: `${N}/api/sections`, body: { type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="ghost">G</arch-ref>' } },
        { id: 'y', method: 'POST', href: `${N}/api/sections`, body: { type: 'nope', title: 'Y' } },
      ],
    });
    const get_x = await request(server.port, 'GET', `${N}/api/sections/x`);
    await server.close();
    assert.deepEqual(
      {
        rolled_back: response.json.rolled_back,
        get_status: get_x.status,
      },
      {
        rolled_back: true,
        get_status: 404,
      },
    );
  });

  test('cross-batch: re-resolution preserves unrelated unresolved entries', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="y">Y</arch-ref><arch-ref to="never">N</arch-ref>',
    });
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Y', slug: 'y' });
    const after = await request(server.port, 'GET', `${N}/api/sections/x`);
    await server.close();
    assert.deepEqual(
      {
        unresolved: after.json.unresolved_refs,
      },
      {
        unresolved: [{ slug: 'never', source: 'html' }],
      },
    );
  });

  test('deleting a target surfaces an unresolved entry on referrers', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Y', slug: 'y' });
    const x_create = await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="y" role="uses">Y</arch-ref>',
    });
    const x_before = await request(server.port, 'GET', `${N}/api/sections/x`);
    const y_get = await request(server.port, 'GET', `${N}/api/sections/y`);
    await request(server.port, 'DELETE', `${N}/api/sections/y`, undefined, { 'If-Match': y_get.headers['etag'] });
    const x_after = await request(server.port, 'GET', `${N}/api/sections/x`);
    void x_create;
    await server.close();
    assert.deepEqual(
      {
        unresolved_before_delete: x_before.json.unresolved_refs,
        unresolved_after_delete: x_after.json.unresolved_refs,
      },
      {
        unresolved_before_delete: [],
        unresolved_after_delete: [{ slug: 'y', source: 'html', role: 'uses' }],
      },
    );
  });

  test('recreating a deleted target re-resolves the surfaced unresolved entry', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Y', slug: 'y' });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'X', slug: 'x', html: '<arch-ref to="y">Y</arch-ref>',
    });
    const y_first = await request(server.port, 'GET', `${N}/api/sections/y`);
    await request(server.port, 'DELETE', `${N}/api/sections/y`, undefined, { 'If-Match': y_first.headers['etag'] });
    const between = await request(server.port, 'GET', `${N}/api/sections/x`);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Y reborn', slug: 'y' });
    const after = await request(server.port, 'GET', `${N}/api/sections/x`);
    const refs = await request(server.port, 'GET', `${N}/api/sections/x/refs`);
    await server.close();
    const html_to_y = refs.json._embedded.items.filter((entry: any) => entry.source === 'html' && entry.to === 'y');
    assert.deepEqual(
      {
        between_delete_and_recreate: between.json.unresolved_refs,
        after_recreate: after.json.unresolved_refs,
        resolved_edges_to_y: html_to_y.length,
      },
      {
        between_delete_and_recreate: [{ slug: 'y', source: 'html' }],
        after_recreate: [],
        resolved_edges_to_y: 1,
      },
    );
  });

  test('deleting a parent surfaces unresolved for inbound refs from outside the cascade subtree', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Parent', slug: 'parent' });
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'Child', slug: 'child', parent: 'parent' });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'Outside', slug: 'outside', html: '<arch-ref to="child">C</arch-ref>',
    });
    const parent_get = await request(server.port, 'GET', `${N}/api/sections/parent`);
    await request(server.port, 'DELETE', `${N}/api/sections/parent`, undefined, { 'If-Match': parent_get.headers['etag'] });
    const outside_after = await request(server.port, 'GET', `${N}/api/sections/outside`);
    await server.close();
    assert.deepEqual(
      {
        unresolved: outside_after.json.unresolved_refs,
      },
      {
        unresolved: [{ slug: 'child', source: 'html' }],
      },
    );
  });

  test('backfill: stale unresolved_refs is recomputed from html on first open', () => {
    const db = make_memory_db();
    const type = direct_seed_type(db, 'service', 'Service');
    direct_seed_section(db, 'x', type.id, { html: '<arch-ref to="never">N</arch-ref>' });
    // Simulate pre-migration state: unresolved_refs_json defaulted to '[]' even
    // though the html has an unresolved ref. Also wipe the backfill flag so
    // the function runs (the existing helpers leave it unset on fresh DBs).
    db.prepare("UPDATE sections SET unresolved_refs_json = '[]' WHERE slug = 'x'").run();
    db.prepare("DELETE FROM meta WHERE key = 'unresolved_refs_backfilled'").run();
    const ran = backfill_unresolved_refs(db);
    const x_row = db.prepare("SELECT id FROM sections WHERE slug = 'x'").get() as { id: number };
    const second = backfill_unresolved_refs(db);
    assert.deepEqual(
      {
        ran_first: ran,
        unresolved: load_unresolved_refs(db, x_row.id),
        ran_second: second,
      },
      {
        ran_first: true,
        unresolved: [{ slug: 'never', source: 'html' }],
        ran_second: false,
      },
    );
  });

  test('deleting a section with no inbound refs leaves other sections unaffected', async () => {
    const server = await make_test_server();
    await seed_type(server.port);
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'A', slug: 'a' });
    await request(server.port, 'POST', `${N}/api/sections`, {
      type: 'service', title: 'B', slug: 'b', html: '<arch-ref to="never">N</arch-ref>',
    });
    const a_get = await request(server.port, 'GET', `${N}/api/sections/a`);
    await request(server.port, 'DELETE', `${N}/api/sections/a`, undefined, { 'If-Match': a_get.headers['etag'] });
    const b_after = await request(server.port, 'GET', `${N}/api/sections/b`);
    await server.close();
    assert.deepEqual(
      {
        b_unresolved: b_after.json.unresolved_refs,
      },
      {
        b_unresolved: [{ slug: 'never', source: 'html' }],
      },
    );
  });
});
