import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build_image, start_container, docker_available, type Container } from './_container.ts';
import { open_sse } from './_sse.ts';

const NOTEBOOK = 'integration';

const json_fetch = async (
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; headers: Record<string, string>; json: any; text: string }> => {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/hal+json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined
      ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }
      : {}),
  };
  const response = await fetch(url, init);
  const text = await response.text();
  let json: any;
  try { json = text.length > 0 ? JSON.parse(text) : undefined; } catch { json = undefined; }
  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers.entries()) headers[name] = value;
  return { status: response.status, headers, json, text };
};

let container: Container | null = null;
let skip_reason: string | null = null;

before(async () => {
  if (!(await docker_available())) {
    skip_reason = 'docker is not available on this host';
    return;
  }
  await build_image(process.cwd());
  container = await start_container(process.cwd());
  // Seed a notebook for the rest of the suite.
  const create = await json_fetch(`${container.base_url}/api/notebooks`, {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: { slug: NOTEBOOK, title: 'Integration test notebook' },
  });
  if (create.status !== 201 && create.status !== 200) {
    throw new Error(`failed to seed notebook: ${create.status} ${create.text}`);
  }
});

after(async () => {
  if (container) await container.stop();
});

const skip_if_no_docker = () => {
  if (skip_reason) throw new Error(`integration tests skipped: ${skip_reason}`);
};

describe('container :: catalog routes', () => {
  test('GET /api/health returns ok', async () => {
    skip_if_no_docker();
    const response = await json_fetch(`${container!.base_url}/api/health`);
    assert.deepEqual({ status: response.status, ok: response.json?.ok }, { status: 200, ok: true });
  });

  test('GET /api lists the notebooks link', async () => {
    skip_if_no_docker();
    const response = await json_fetch(`${container!.base_url}/api`);
    assert.deepEqual(
      { status: response.status, has_notebooks_link: typeof response.json?._links?.notebooks?.href === 'string' },
      { status: 200, has_notebooks_link: true },
    );
  });

  test('GET /api/notebooks includes the seeded notebook', async () => {
    skip_if_no_docker();
    const response = await json_fetch(`${container!.base_url}/api/notebooks`);
    const slugs = (response.json?._embedded?.items ?? []).map((item: any) => item.slug);
    assert.deepEqual({ status: response.status, includes: slugs.includes(NOTEBOOK) }, { status: 200, includes: true });
  });
});

describe('container :: per-notebook API', () => {
  test('POST /api/types then POST /api/sections then PATCH with If-Match round-trips correctly', async () => {
    skip_if_no_docker();
    const base = `${container!.base_url}/n/${NOTEBOOK}/api`;

    const type_create = await json_fetch(`${base}/types`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID(), 'Arch-Author': 'integration' },
      body: { slug: 'service', name: 'Service', property_schema: { fields: [{ key: 'language', type: 'string' }] } },
    });

    const section_create = await json_fetch(`${base}/sections`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID(), 'Arch-Author': 'integration' },
      body: { type: 'service', title: 'Order Engine', slug: 'order-engine', properties: { language: 'Go' } },
    });
    const etag = section_create.headers['etag'];

    const patch = await json_fetch(`${base}/sections/order-engine`, {
      method: 'PATCH',
      headers: {
        'Idempotency-Key': randomUUID(),
        'Arch-Author': 'integration',
        'If-Match': etag,
      },
      body: { title: 'Order Engine (v2)' },
    });

    const fresh = await json_fetch(`${base}/sections/order-engine`);

    assert.deepEqual(
      {
        type_created: type_create.status,
        section_created: section_create.status,
        had_etag: typeof etag === 'string' && etag.startsWith('W/'),
        patch_status: patch.status,
        final_title: fresh.json?.title,
      },
      {
        type_created: 201,
        section_created: 201,
        had_etag: true,
        patch_status: 200,
        final_title: 'Order Engine (v2)',
      },
    );
  });

  test('PATCH without If-Match returns 428 precondition-required', async () => {
    skip_if_no_docker();
    const base = `${container!.base_url}/n/${NOTEBOOK}/api`;
    const response = await json_fetch(`${base}/sections/order-engine`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': randomUUID(), 'Arch-Author': 'integration' },
      body: { title: 'should be rejected' },
    });
    assert.deepEqual(
      { status: response.status, type: response.json?.type },
      { status: 428, type: '/errors/precondition-required' },
    );
  });

  test('POST /api/batch with $opid back-ref creates linked sections atomically', async () => {
    skip_if_no_docker();
    const base = `${container!.base_url}/n/${NOTEBOOK}/api`;
    const response = await json_fetch(`${base}/batch`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID(), 'Arch-Author': 'integration' },
      body: {
        atomic: true,
        ops: [
          { id: 's1', method: 'POST', href: '/api/sections',
            body: { type: 'service', title: 'Pricing', slug: 'pricing' } },
          { id: 's2', method: 'POST', href: '/api/sections',
            body: { type: 'service', title: 'Settlement', slug: 'settlement' } },
          { id: 'r1', method: 'POST', href: '/api/refs',
            body: { from: '$s1.slug', to: '$s2.slug', role: 'uses' } },
        ],
      },
    });
    const results = response.json?.results ?? [];
    assert.deepEqual(
      {
        status: response.status,
        // `rolled_back` is only emitted when rollback actually happened.
        rolled_back_signaled: response.json?.rolled_back === true,
        s1_status: results[0]?.status,
        s2_status: results[1]?.status,
        ref_status: results[2]?.status,
      },
      {
        status: 200,
        rolled_back_signaled: false,
        s1_status: 201,
        s2_status: 201,
        ref_status: 201,
      },
    );
  });

  test('GET /api/search?q= matches body content and returns a marked snippet', async () => {
    skip_if_no_docker();
    const base = `${container!.base_url}/n/${NOTEBOOK}/api`;
    // Sentinel lives only in the body, not in the slug or title — proves the
    // search actually walked the HTML, not just the metadata.
    const sentinel = `bodyonly${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const slug = `body-search-${randomUUID().slice(0, 8)}`;
    const created = await json_fetch(`${base}/sections`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID(), 'Arch-Author': 'integration' },
      body: { type: 'service', title: 'Body search target', slug,
              html: `<p>Hidden inside the body: the marker ${sentinel} should be findable.</p>` },
    });
    const search = await json_fetch(`${base}/search?q=${sentinel}`);
    const first = search.json?._embedded?.results?.[0];
    assert.deepEqual(
      {
        section_created: created.status,
        first_slug: first?.slug,
        snippet_field: first?.snippet_field,
        snippet_has_mark: typeof first?.snippet === 'string' && first.snippet.includes(`<mark>${sentinel}</mark>`),
      },
      {
        section_created: 201,
        first_slug: slug,
        snippet_field: 'body',
        snippet_has_mark: true,
      },
    );
  });

  test('GET /print emits one continuous PDF-ready document with TOC anchors', async () => {
    skip_if_no_docker();
    const response = await fetch(`${container!.base_url}/n/${NOTEBOOK}/print`);
    const html = await response.text();
    assert.deepEqual(
      {
        status: response.status,
        has_design_tokens: html.includes('--accent:'),
        has_toc_anchor: /href="#section-[a-z0-9-]+"/.test(html),
        no_hard_page_breaks: !html.includes('break-before: page'),
      },
      { status: 200, has_design_tokens: true, has_toc_anchor: true, no_hard_page_breaks: true },
    );
  });
});

describe('container :: MCP SSE transport', () => {
  test('SSE handshake → tools/list → tools/call(batch_api) creates a section through the loopback', async () => {
    skip_if_no_docker();
    const sse = await open_sse(`${container!.base_url}/mcp/sse`);
    const endpoint_event = await sse.wait_for((e) => e.event === 'endpoint', 5000);
    const endpoint_path = endpoint_event.data;

    const post_rpc = async (msg: unknown): Promise<number> => {
      const response = await fetch(`${container!.base_url}${endpoint_path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      return response.status;
    };

    const init_status = await post_rpc({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'integration', version: '0' } },
    });
    const init = JSON.parse((await sse.wait_for((e) => e.event === 'message' && e.data.includes('"id":1'), 3000)).data);

    const list_status = await post_rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const list = JSON.parse((await sse.wait_for((e) => e.event === 'message' && e.data.includes('"id":2'), 3000)).data);

    const created_slug = `mcp-section-${randomUUID().slice(0, 8)}`;
    const call_status = await post_rpc({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'batch_api',
        arguments: {
          notebook: NOTEBOOK,
          author: 'mcp-integration',
          ops: [
            { id: 's', method: 'POST', href: '/api/sections',
              body: { type: 'service', title: 'MCP-created', slug: created_slug } },
          ],
        },
      },
    });
    const call = JSON.parse((await sse.wait_for((e) => e.event === 'message' && e.data.includes('"id":3'), 5000)).data);

    // Also verify the section actually exists via the HTTP API.
    const verify = await json_fetch(`${container!.base_url}/n/${NOTEBOOK}/api/sections/${created_slug}`);

    await sse.close();

    assert.deepEqual(
      {
        statuses: { init_status, list_status, call_status },
        init_proto: init.result?.protocolVersion,
        init_server_name: init.result?.serverInfo?.name,
        tool_name: list.result?.tools?.[0]?.name,
        description_carries_skill: typeof list.result?.tools?.[0]?.description === 'string'
          && list.result.tools[0].description.startsWith('---\nname: architecture-notebook'),
        call_is_error: call.result?.isError,
        call_text_mentions_slug: typeof call.result?.content?.[0]?.text === 'string'
          && call.result.content[0].text.includes(created_slug),
        section_now_exists: verify.status,
      },
      {
        statuses: { init_status: 202, list_status: 202, call_status: 202 },
        init_proto: '2024-11-05',
        init_server_name: 'architecture-notebook',
        tool_name: 'batch_api',
        description_carries_skill: true,
        call_is_error: false,
        call_text_mentions_slug: true,
        section_now_exists: 200,
      },
    );
  });
});
