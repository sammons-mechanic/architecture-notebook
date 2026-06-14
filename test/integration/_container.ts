import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

const IMAGE_TAG = 'architecture-notebook:integration';
const CONTAINER_PORT = 8787;

const run_cmd = async (
  cmd: string,
  args: ReadonlyArray<string>,
  options: { stdin?: string; timeout_ms?: number } = {},
): Promise<{ status: number; stdout: string; stderr: string }> => {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args as string[], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    let timer: NodeJS.Timeout | undefined;
    if (options.timeout_ms) {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${cmd} ${args.join(' ')} timed out after ${options.timeout_ms}ms`));
      }, options.timeout_ms);
    }
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ status: code ?? -1, stdout, stderr });
    });
    if (options.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
};

export const docker_available = async (): Promise<boolean> => {
  try {
    const result = await run_cmd('docker', ['version', '--format', '{{.Server.Version}}'], { timeout_ms: 5000 });
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
};

export type Container = {
  readonly base_url: string;
  readonly id: string;
  readonly stop: () => Promise<void>;
};

export const build_image = async (cwd: string): Promise<void> => {
  const result = await run_cmd('docker', ['build', '--quiet', '-t', IMAGE_TAG, '-f', 'Dockerfile', cwd], { timeout_ms: 180000 });
  if (result.status !== 0) {
    throw new Error(`docker build failed (${result.status}):\n${result.stderr}`);
  }
};

const wait_for_health = async (base_url: string, deadline: number): Promise<void> => {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base_url}/api/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  throw new Error(`container never returned 200 on /api/health before deadline`);
};

export const start_container = async (cwd: string): Promise<Container> => {
  const name = `arch-nb-it-${randomUUID().slice(0, 8)}`;
  // -p 0:CONTAINER_PORT publishes to a random host port we discover via `docker port`.
  const run = await run_cmd('docker', [
    'run', '-d', '--rm',
    '--name', name,
    '-p', `127.0.0.1::${CONTAINER_PORT}`,
    IMAGE_TAG,
  ], { timeout_ms: 30000 });
  if (run.status !== 0) {
    throw new Error(`docker run failed:\n${run.stderr}`);
  }
  const id = run.stdout.trim();
  // Discover the host-side published port.
  const port_lookup = await run_cmd('docker', ['port', id, `${CONTAINER_PORT}/tcp`], { timeout_ms: 5000 });
  if (port_lookup.status !== 0) {
    await stop(id);
    throw new Error(`docker port lookup failed:\n${port_lookup.stderr}`);
  }
  // Output looks like "127.0.0.1:54321\n" (possibly multiple lines for v4/v6).
  const first_line = port_lookup.stdout.split('\n').find((line) => line.trim().length > 0) ?? '';
  const match = /:(\d+)/.exec(first_line);
  if (!match) {
    await stop(id);
    throw new Error(`could not parse host port from: ${port_lookup.stdout}`);
  }
  const host_port = Number(match[1]);
  const base_url = `http://127.0.0.1:${host_port}`;
  try {
    await wait_for_health(base_url, Date.now() + 30000);
  } catch (err) {
    const logs = await run_cmd('docker', ['logs', id], { timeout_ms: 5000 }).catch(() => null);
    await stop(id);
    const tail = logs?.stdout?.split('\n').slice(-20).join('\n') ?? '(no logs)';
    throw new Error(`${(err as Error).message}\nrecent container logs:\n${tail}`);
  }
  return {
    base_url,
    id,
    stop: () => stop(id),
  };
};

const stop = async (id: string): Promise<void> => {
  await run_cmd('docker', ['stop', '-t', '2', id], { timeout_ms: 10000 }).catch(() => null);
};
