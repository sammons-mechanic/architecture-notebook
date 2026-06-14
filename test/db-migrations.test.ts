import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { open_database, run_migrations, schema_version } from '../server/db.ts';

describe('db migrations', () => {
  test('fresh in-memory database applies all migrations to expected version', () => {
    const db = open_database(':memory:');
    const result = run_migrations(db);
    assert.deepEqual(
      { version: result, schema_version: schema_version(db) },
      { version: 7, schema_version: 7 },
    );
  });

  test('running migrations twice is a no-op', () => {
    const db = open_database(':memory:');
    run_migrations(db);
    const second = run_migrations(db);
    assert.deepEqual({ version: second, schema_version: schema_version(db) }, { version: 7, schema_version: 7 });
  });

  test('migration seeds the notebook config defaults', () => {
    const db = open_database(':memory:');
    run_migrations(db);
    const title = (db.prepare("SELECT value FROM meta WHERE key='notebook_title'").get() as { value: string }).value;
    const major = (db.prepare("SELECT value FROM meta WHERE key='notebook_major'").get() as { value: string }).value;
    const minor = (db.prepare("SELECT value FROM meta WHERE key='notebook_minor'").get() as { value: string }).value;
    assert.deepEqual({ title, major, minor }, { title: 'Untitled Notebook', major: '0', minor: '0' });
  });

  test('schema_version reports 0 before migrations run', () => {
    const db = open_database(':memory:');
    assert.deepEqual({ version: schema_version(db) }, { version: 0 });
  });
});
