import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open_database, run_migrations } from './db.ts';
import { create_router } from './router.ts';
import { create_idempotency_store } from './idempotency.ts';
import { create_logger, type LogLevel } from './lib/log.ts';
import { handle_request, type ServerContext } from './http-handler.ts';
import { send_problem } from './response.ts';
import { register_catalog_routes } from './wire-catalog.ts';
import { create_notebook_manager } from './notebook-manager.ts';
import { close_all_sessions as close_mcp_sessions } from './routes/mcp.ts';

export type StartedServer = {
  readonly port: number;
  readonly host: string;
  readonly close: () => Promise<void>;
};

const here = dirname(fileURLToPath(import.meta.url));

const read_version = async (): Promise<string> => {
  const pkg = JSON.parse(await readFile(join(here, '..', 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
};

export type StartOptions = {
  readonly db_path?: string;
  readonly data_dir?: string;
  readonly port?: number;
  readonly host?: string;
  readonly log_level?: 'error' | 'warn' | 'info' | 'debug';
};

export const start_server = async (options: StartOptions = {}): Promise<StartedServer> => {
  const data_dir = options.data_dir ?? options.db_path ?? process.env.DATA_DIR ?? join(process.cwd(), 'data', 'notebooks');
  const version = await read_version();
  if (data_dir !== ':memory:') await mkdir(data_dir, { recursive: true });
  const manager = await create_notebook_manager({ data_dir, version });
  const catalog_db = open_database(':memory:');
  run_migrations(catalog_db);
  const catalog_idempotency = create_idempotency_store(catalog_db);
  const catalog_router = create_router();
  register_catalog_routes(catalog_router, manager, version);
  const logger = create_logger(options.log_level ?? (process.env.LOG_LEVEL as any) ?? 'info');
  // Bound port isn't known until listen() resolves; the MCP tool needs it for
  // its loopback fetch into /n/{notebook}/api/batch. We use a mutable holder
  // and fill it in after listen() returns.
  const mcp_holder = { base_url: '' };
  const server_context: ServerContext = { catalog_router, catalog_idempotency, manager, logger, mcp: mcp_holder };
  const server = createServer((req, res) => {
    // A rejection out of handle_request would otherwise be an unhandled
    // rejection that takes the whole process down (there is no orchestrator
    // restart under `docker run --rm`). Convert it to a 500 if nothing was sent
    // yet, otherwise just close the socket.
    handle_request(req, res, server_context).catch((error) => {
      logger.error('request handler failed', {
        request: `${req.method ?? '?'} ${req.url ?? ''}`,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        send_problem(res, 500, 'internal', 'Internal server error', req.url ?? '');
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });
  server.keepAliveTimeout = 5000;
  server.requestTimeout = 30000;
  const desired_port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 0);
  // Default to loopback because the server has no auth. Containers and
  // explicit deployments override to 0.0.0.0 via HOST.
  const desired_host = options.host ?? process.env.HOST ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: desired_host, port: desired_port }, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('server.address() did not return an AddressInfo object');
  }
  const port = address.port;
  mcp_holder.base_url = `http://127.0.0.1:${port}`;
  if (data_dir !== ':memory:') {
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    await writeFile(join(process.cwd(), 'data', '.port'), `http://127.0.0.1:${port}\n`, 'utf8');
  }
  process.stdout.write(`ARCH_URL=http://127.0.0.1:${port}\n`);
  return {
    port,
    host: address.address,
    close: () => new Promise<void>((resolve) => {
      close_mcp_sessions();
      server.close(async () => {
        await manager.close_all();
        catalog_db.close();
        resolve();
      });
    }),
  };
};

const is_main_module = () => {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === process.argv[1];
};

if (is_main_module()) {
  // Last-resort logging so a stray rejection or throw outside the request path
  // is recorded instead of silently killing the process. Installed only for the
  // standalone server, never for the in-process test harness (which would
  // accumulate listeners across many start_server calls and could swallow test
  // failures). The per-request .catch above already converts request-path
  // errors to a 500, so this should rarely fire.
  const process_logger = create_logger((process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info');
  // Deliberately log-and-continue rather than the fail-fast Node usually
  // recommends: the request path is already covered by the per-request .catch,
  // there is no orchestrator to restart us under `docker run --rm`, and for a
  // single-user notebook staying up beats dying on a stray non-request throw.
  process.on('uncaughtException', (error) => {
    process_logger.error('uncaughtException', { message: error.message, stack: error.stack });
  });
  process.on('unhandledRejection', (reason) => {
    process_logger.error('unhandledRejection', { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  const started = await start_server();
  const stop = async () => {
    await started.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
