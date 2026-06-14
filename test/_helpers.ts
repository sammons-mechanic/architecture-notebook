import { start_server, type StartedServer } from '../server/index.ts';
import { open_database, run_migrations } from '../server/db.ts';
import { create_idempotency_store } from '../server/idempotency.ts';
import { fresh_etag } from '../server/hal.ts';

export const TEST_NOTEBOOK_SLUG = 'test';
export const N = `/n/${TEST_NOTEBOOK_SLUG}`;

export type TestServer = StartedServer;

export const make_test_server = async (): Promise<TestServer> => {
  const server = await start_server({ data_dir: ':memory:', port: 0, log_level: 'error' });
  await fetch(`http://127.0.0.1:${server.port}/api/notebooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: TEST_NOTEBOOK_SLUG, title: 'Untitled Notebook' }),
  });
  return server;
};

export type TestResponse = {
  status: number;
  json: any;
  headers: Record<string, string>;
  text: string;
};

export const request = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<TestResponse> => {
  const url = `http://127.0.0.1:${port}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/hal+json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  };
  const response = await fetch(url, init);
  const text = await response.text();
  let json: any = undefined;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      json = undefined;
    }
  }
  const out: Record<string, string> = {};
  for (const [name, value] of response.headers.entries()) {
    out[name] = value;
  }
  return { status: response.status, json, headers: out, text };
};

export const make_memory_db = () => {
  const db = open_database(':memory:');
  run_migrations(db);
  return db;
};

export const seed_type = (db: ReturnType<typeof open_database>, slug: string, name: string, schema_fields: ReadonlyArray<unknown> = []) => {
  const etag = fresh_etag();
  db.prepare('INSERT INTO section_types(slug, name, property_schema_json, etag) VALUES (?, ?, ?, ?)').run(slug, name, JSON.stringify({ fields: schema_fields }), etag);
  return db.prepare('SELECT * FROM section_types WHERE slug = ?').get(slug) as { id: number; slug: string; etag: string };
};

export const seed_section = (
  db: ReturnType<typeof open_database>,
  slug: string,
  type_id: number,
  options: { parent_id?: number | null; title?: string; position?: number; html?: string; properties?: Record<string, unknown>; tags?: string[] } = {},
) => {
  const etag = fresh_etag();
  db.prepare('INSERT INTO sections(slug, type_id, parent_id, title, position, html, properties_json, tags_json, etag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    slug,
    type_id,
    options.parent_id ?? null,
    options.title ?? slug,
    options.position ?? 0,
    options.html ?? '',
    JSON.stringify(options.properties ?? {}),
    JSON.stringify(options.tags ?? []),
    etag,
  );
  return db.prepare('SELECT * FROM sections WHERE slug = ?').get(slug) as { id: number; slug: string; etag: string };
};

export { create_idempotency_store };
