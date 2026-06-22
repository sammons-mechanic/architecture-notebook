import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create_notebook_manager } from '../server/notebook-manager.ts';

const with_tmp_dir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), 'arch-nb-'));
  try { await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
};

test('list() picks up a notebook created out-of-band after startup', async () => {
  await with_tmp_dir(async (dir) => {
    const server_view = await create_notebook_manager({ data_dir: dir, version: '0.0.0-test' });
    assert.deepEqual(await server_view.list(), []);

    // A second manager over the same dir stands in for another process — e.g. a
    // seed script that opens its own server and writes <slug>.db into the dir.
    const seeder = await create_notebook_manager({ data_dir: dir, version: '0.0.0-test' });
    seeder.create('acme', 'Acme');
    await seeder.close_all();

    const slugs = (await server_view.list()).map((n) => n.slug);
    assert.deepEqual(slugs, ['acme']);
    await server_view.close_all();
  });
});

test('get()/exists() lazily adopt an on-disk notebook never listed', async () => {
  await with_tmp_dir(async (dir) => {
    const server_view = await create_notebook_manager({ data_dir: dir, version: '0.0.0-test' });

    const seeder = await create_notebook_manager({ data_dir: dir, version: '0.0.0-test' });
    seeder.create('beta', 'Beta');
    await seeder.close_all();

    // No list() call first — get() must find the file on disk itself.
    assert.equal(server_view.exists('beta'), true);
    assert.notEqual(server_view.get('beta'), null);
    assert.equal(server_view.summary('beta')?.title, 'Beta');
    await server_view.close_all();
  });
});

test('get() returns null for a slug with no db file', async () => {
  await with_tmp_dir(async (dir) => {
    const manager = await create_notebook_manager({ data_dir: dir, version: '0.0.0-test' });
    assert.equal(manager.get('missing'), null);
    assert.equal(manager.exists('missing'), false);
    await manager.close_all();
  });
});
