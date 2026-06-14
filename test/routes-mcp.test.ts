import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N, TEST_NOTEBOOK_SLUG } from './_helpers.ts';

type SseEvent = { readonly event: string; readonly data: string };

// Streaming SSE reader. Opens one /mcp/sse connection, exposes a `wait_for`
// helper that resolves the first event matching the predicate.
const open_sse = async (port: number, path: string) => {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (!response.body) throw new Error('SSE response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = '';
  let pending_event = '';
  let pending_data: string[] = [];
  let closed = false;

  const pump = (async () => {
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) { closed = true; break; }
      buffer += decoder.decode(value, { stream: true });
      let newline_index: number;
      while ((newline_index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline_index).replace(/\r$/, '');
        buffer = buffer.slice(newline_index + 1);
        if (line === '') {
          if (pending_event !== '' || pending_data.length > 0) {
            events.push({ event: pending_event || 'message', data: pending_data.join('\n') });
          }
          pending_event = '';
          pending_data = [];
        } else if (line.startsWith(':')) {
          // comment / keep-alive
        } else if (line.startsWith('event:')) {
          pending_event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          pending_data.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
  })().catch(() => { /* aborted */ });

  const wait_for = async (predicate: (e: SseEvent) => boolean, timeout_ms: number): Promise<SseEvent> => {
    const deadline = Date.now() + timeout_ms;
    while (Date.now() < deadline) {
      const hit = events.find(predicate);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`SSE event not received within ${timeout_ms}ms`);
  };

  const close = () => {
    closed = true;
    controller.abort();
    return pump;
  };

  return { events, wait_for, close };
};

const post_rpc = async (port: number, endpoint_path: string, msg: unknown): Promise<number> => {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint_path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  });
  return response.status;
};

describe('mcp sse transport', () => {
  test('initialize → tools/list → tools/call(batch_api) creates a section end-to-end', async () => {
    const server = await make_test_server();
    // Seed a type so the batch op has somewhere to land.
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service', property_schema: { fields: [] } });

    const sse = await open_sse(server.port, '/mcp/sse');
    const endpoint_event = await sse.wait_for((e) => e.event === 'endpoint', 2000);
    const endpoint_path = endpoint_event.data;

    const init_status = await post_rpc(server.port, endpoint_path, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const init_msg = JSON.parse((await sse.wait_for((e) => e.event === 'message' && e.data.includes('"id":1'), 2000)).data);

    const list_status = await post_rpc(server.port, endpoint_path, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const list_msg = JSON.parse((await sse.wait_for((e) => e.event === 'message' && e.data.includes('"id":2'), 2000)).data);

    const call_status = await post_rpc(server.port, endpoint_path, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'batch_api',
        arguments: {
          notebook: TEST_NOTEBOOK_SLUG,
          author: 'mcp-test',
          ops: [
            { id: 's1', method: 'POST', href: '/api/sections',
              body: { type: 'service', title: 'Pricing Service', slug: 'pricing-service' } },
          ],
        },
      },
    });
    const call_msg = JSON.parse((await sse.wait_for((e) => e.event === 'message' && e.data.includes('"id":3'), 3000)).data);

    await sse.close();
    await server.close();

    assert.deepEqual(
      {
        post_status_accepted: { init_status, list_status, call_status },
        init_protocol: init_msg.result?.protocolVersion,
        init_server_name: init_msg.result?.serverInfo?.name,
        tool_name: list_msg.result?.tools?.[0]?.name,
        description_starts_with_frontmatter: typeof list_msg.result?.tools?.[0]?.description === 'string'
          && list_msg.result.tools[0].description.startsWith('---\nname: architecture-notebook'),
        tool_required: list_msg.result?.tools?.[0]?.inputSchema?.required,
        call_is_error: call_msg.result?.isError,
        call_includes_created_slug: typeof call_msg.result?.content?.[0]?.text === 'string'
          && call_msg.result.content[0].text.includes('pricing-service'),
      },
      {
        post_status_accepted: { init_status: 202, list_status: 202, call_status: 202 },
        init_protocol: '2024-11-05',
        init_server_name: 'architecture-notebook',
        tool_name: 'batch_api',
        description_starts_with_frontmatter: true,
        tool_required: ['notebook', 'ops'],
        call_is_error: false,
        call_includes_created_slug: true,
      },
    );
  });

  test('unknown sessionId on POST /mcp/message returns 404', async () => {
    const server = await make_test_server();
    const response = await fetch(`http://127.0.0.1:${server.port}/mcp/message?sessionId=does-not-exist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    await server.close();
    assert.deepEqual({ status: response.status }, { status: 404 });
  });

  test('POST /mcp/message without sessionId returns 400', async () => {
    const server = await make_test_server();
    const response = await fetch(`http://127.0.0.1:${server.port}/mcp/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    await server.close();
    assert.deepEqual({ status: response.status }, { status: 400 });
  });
});
