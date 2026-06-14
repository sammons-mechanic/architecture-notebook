import type { ServerResponse } from 'node:http';
import { negotiate_accept, strip_hypermedia, type NegotiationResult } from './hal.ts';
import { build_problem } from './problem.ts';
import type { FieldError } from './lib/failure.ts';

export type ResponseEnvelope = {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
};

export const send_response = (
  res: ServerResponse,
  envelope: ResponseEnvelope,
  accept: NegotiationResult
): void => {
  if (envelope.status === 204) {
    if (envelope.headers) {
      for (const [name, value] of Object.entries(envelope.headers)) {
        res.setHeader(name, value);
      }
    }
    res.writeHead(204);
    res.end();
    return;
  }
  const projected = accept.kind === 'json' ? strip_hypermedia(envelope.body) : envelope.body;
  const content_type = envelope.headers?.['Content-Type']
    ?? (accept.kind === 'json' ? 'application/json' : 'application/hal+json');
  const headers: Record<string, string> = {
    'Content-Type': content_type,
    'Cache-Control': 'no-store',
    ...(envelope.headers ?? {}),
    'Content-Type-Override': content_type,
  };
  delete headers['Content-Type-Override'];
  headers['Content-Type'] = content_type;
  const body_text = JSON.stringify(projected);
  res.writeHead(envelope.status, headers);
  res.end(body_text);
};

export const send_problem = (
  res: ServerResponse,
  status: number,
  code: string,
  detail: string,
  instance: string,
  extras?: { hint?: string; errors?: ReadonlyArray<FieldError>; headers?: Record<string, string>; [key: string]: unknown }
): void => {
  const { headers, ...rest } = extras ?? {};
  const body = build_problem(code, status, detail, instance, rest);
  const merged: Record<string, string> = {
    'Content-Type': 'application/problem+json',
    'Cache-Control': 'no-store',
    ...(headers ?? {}),
  };
  res.writeHead(status, merged);
  res.end(JSON.stringify(body));
};

export const negotiate = negotiate_accept;
