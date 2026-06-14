import { randomUUID } from 'node:crypto';
import type { ServerResponse, IncomingMessage } from 'node:http';
import { SKILL_MD } from '../skill-doc.ts';

// The full AI-facing skill is bundled into the tool's description so any MCP
// client (Claude Desktop, inspector, etc.) gets the entire authoring contract
// at tool discovery time — no out-of-band docs required. The same SKILL_MD also
// backs the HTTP GET /skill endpoint so the two surfaces never drift.

const protocol_version = '2024-11-05';
const server_info = Object.freeze({ name: 'architecture-notebook', version: '0.1.0' } as const);

type JsonRpcRequest = {
  readonly jsonrpc?: string;
  readonly id?: number | string | null;
  readonly method?: string;
  readonly params?: unknown;
};

type Session = {
  readonly id: string;
  readonly res: ServerResponse;
  readonly ping_handle: NodeJS.Timeout;
};

const sessions = new Map<string, Session>();

const write_sse_endpoint = (res: ServerResponse, endpoint_url: string): void => {
  res.write(`event: endpoint\n`);
  res.write(`data: ${endpoint_url}\n\n`);
};

const write_sse_message = (res: ServerResponse, payload: unknown): void => {
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const tool_definition = () => ({
  name: 'batch_api',
  description: SKILL_MD,
  inputSchema: {
    type: 'object',
    properties: {
      notebook: {
        type: 'string',
        description: 'Notebook slug (must already exist).',
      },
      atomic: {
        type: 'boolean',
        description: 'If false, ops run best-effort with no rollback. Defaults to true.',
        default: true,
      },
      idempotency_key: {
        type: 'string',
        description: 'UUIDv4 or any stable identifier. A new UUID is generated if omitted.',
      },
      author: {
        type: 'string',
        description: 'Value of the Arch-Author header stamped on revisions/comments. Defaults to "mcp-client".',
      },
      ops: {
        type: 'array',
        description: 'Batch operations. Each op: { id, method, href, body?, if_match? }. See the description for the full contract, the $opid.slug / $opid.id back-reference grammar, and the atomic rollback signal.',
        items: { type: 'object' },
      },
    },
    required: ['notebook', 'ops'],
  },
});

export type McpDeps = {
  readonly base_url: string;
};

const handle_initialize = (msg: JsonRpcRequest) => ({
  jsonrpc: '2.0',
  id: msg.id ?? null,
  result: {
    protocolVersion: protocol_version,
    capabilities: { tools: {} },
    serverInfo: server_info,
  },
});

const handle_tools_list = (msg: JsonRpcRequest) => ({
  jsonrpc: '2.0',
  id: msg.id ?? null,
  result: { tools: [tool_definition()] },
});

const handle_ping = (msg: JsonRpcRequest) => ({
  jsonrpc: '2.0',
  id: msg.id ?? null,
  result: {},
});

const error_response = (id: number | string | null | undefined, code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

const tool_result_text = (id: number | string | null | undefined, text: string, is_error = false) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  result: {
    content: [{ type: 'text', text }],
    isError: is_error,
  },
});

const handle_tools_call = async (msg: JsonRpcRequest, deps: McpDeps) => {
  const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
  if (params.name !== 'batch_api') {
    return error_response(msg.id, -32602, `Unknown tool: ${String(params.name)}`);
  }
  const args = params.arguments ?? {};
  const notebook = args.notebook;
  if (typeof notebook !== 'string' || notebook.length === 0) {
    return tool_result_text(msg.id, 'Missing required argument: notebook', true);
  }
  if (!Array.isArray(args.ops)) {
    return tool_result_text(msg.id, 'Missing required argument: ops (must be an array)', true);
  }
  const idempotency_key = typeof args.idempotency_key === 'string' && args.idempotency_key.length > 0
    ? args.idempotency_key
    : randomUUID();
  const author = typeof args.author === 'string' && args.author.length > 0 ? args.author : 'mcp-client';
  const payload = {
    atomic: args.atomic !== false,
    ops: args.ops,
  };
  const url = `${deps.base_url}/n/${encodeURIComponent(notebook)}/api/batch`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/hal+json',
        'Idempotency-Key': idempotency_key,
        'Arch-Author': author,
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    const is_error = response.status >= 400;
    const body_preview = `HTTP ${response.status} ${response.statusText}\n${text}`;
    return tool_result_text(msg.id, body_preview, is_error);
  } catch (err) {
    return tool_result_text(msg.id, `fetch failed: ${(err as Error).message}`, true);
  }
};

const dispatch_rpc = async (msg: JsonRpcRequest, deps: McpDeps): Promise<unknown | null> => {
  if (msg.method === 'initialize') return handle_initialize(msg);
  if (msg.method === 'notifications/initialized') return null;
  if (msg.method === 'tools/list') return handle_tools_list(msg);
  if (msg.method === 'tools/call') return await handle_tools_call(msg, deps);
  if (msg.method === 'ping') return handle_ping(msg);
  if (msg.method?.startsWith('notifications/')) return null;
  return error_response(msg.id, -32601, `Method not found: ${msg.method ?? '(none)'}`);
};

export const mcp_sse_handler = (req: IncomingMessage, res: ServerResponse): void => {
  const session_id = randomUUID();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  write_sse_endpoint(res, `/mcp/message?sessionId=${session_id}`);
  const ping_handle = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);
  ping_handle.unref?.();
  sessions.set(session_id, { id: session_id, res, ping_handle });
  const cleanup = () => {
    clearInterval(ping_handle);
    sessions.delete(session_id);
  };
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
};

export const mcp_message_handler = (deps: McpDeps) => async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parsed_body: unknown,
): Promise<void> => {
  const session_id = url.searchParams.get('sessionId');
  if (!session_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'sessionId query parameter is required' }));
    return;
  }
  const session = sessions.get(session_id);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `unknown session ${session_id}` }));
    return;
  }
  res.writeHead(202);
  res.end();
  const msg = (parsed_body ?? {}) as JsonRpcRequest;
  if (msg.jsonrpc !== '2.0') {
    write_sse_message(session.res, error_response(msg.id, -32600, 'jsonrpc must be "2.0"'));
    return;
  }
  const response = await dispatch_rpc(msg, deps);
  if (response !== null) write_sse_message(session.res, response);
};

export const close_all_sessions = (): void => {
  for (const session of sessions.values()) {
    clearInterval(session.ping_handle);
    try { session.res.end(); } catch { /* already closed */ }
  }
  sessions.clear();
};
