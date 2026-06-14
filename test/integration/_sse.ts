// Tiny zero-dep SSE client used by the integration tests. Opens a stream,
// buffers events as they arrive, exposes a wait_for() that resolves the first
// event matching a predicate.

export type SseEvent = { readonly event: string; readonly data: string };

export type SseClient = {
  readonly events: ReadonlyArray<SseEvent>;
  readonly wait_for: (predicate: (e: SseEvent) => boolean, timeout_ms: number) => Promise<SseEvent>;
  readonly close: () => Promise<void>;
};

export const open_sse = async (url: string): Promise<SseClient> => {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (!response.body) throw new Error(`SSE response has no body (status ${response.status})`);
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
      let nl_index: number;
      while ((nl_index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl_index).replace(/\r$/, '');
        buffer = buffer.slice(nl_index + 1);
        if (line === '') {
          if (pending_event !== '' || pending_data.length > 0) {
            events.push({ event: pending_event || 'message', data: pending_data.join('\n') });
          }
          pending_event = '';
          pending_data = [];
        } else if (line.startsWith(':')) {
          // keep-alive comment
        } else if (line.startsWith('event:')) {
          pending_event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          pending_data.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
  })().catch(() => { /* aborted */ });

  return {
    get events() { return events; },
    wait_for: async (predicate, timeout_ms) => {
      const deadline = Date.now() + timeout_ms;
      while (Date.now() < deadline) {
        const hit = events.find(predicate);
        if (hit) return hit;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`SSE event not received within ${timeout_ms}ms`);
    },
    close: async () => {
      closed = true;
      controller.abort();
      await pump;
    },
  };
};
