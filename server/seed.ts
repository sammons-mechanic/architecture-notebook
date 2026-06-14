import { randomUUID } from 'node:crypto';
import { start_server } from './index.ts';
import { build_types_batch, build_sections_batch } from './seed-data/build-batches.ts';

const NOTEBOOK_SLUG = process.env.SEED_NOTEBOOK_SLUG ?? 'acme-trading';
const NOTEBOOK_TITLE = process.env.SEED_NOTEBOOK_TITLE ?? 'Acme Trading System';

const post_json = async (base: string, path: string, body: object, key?: string): Promise<{ status: number; body: string }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/hal+json' };
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.text() };
};

const ensure_notebook = async (base: string, slug: string, title: string): Promise<void> => {
  const existing = await fetch(`${base}/api/notebooks/${slug}`);
  if (existing.status === 200) {
    console.log(`[seed] notebook ${slug} already exists`);
    return;
  }
  const created = await post_json(base, '/api/notebooks', { slug, title });
  if (created.status !== 201) {
    console.error(`[seed] failed to create notebook (${created.status}):\n${created.body}`);
    process.exit(1);
  }
  console.log(`[seed] created notebook ${slug}`);
};

const fail = (where: string, status: number, body: string): never => {
  console.error(`[seed] ${where} failed with status ${status}:\n${body}`);
  process.exit(1);
};

const summarize_results = (envelope: string): string => {
  const parsed = JSON.parse(envelope) as { results?: ReadonlyArray<{ id: string; status: number }> };
  if (!parsed.results) return 'no results array';
  const ok = parsed.results.filter((op) => op.status >= 200 && op.status < 300).length;
  return `${ok}/${parsed.results.length} ops created`;
};

const main = async (): Promise<void> => {
  const server = await start_server({});
  const base = `http://${server.host}:${server.port}`;
  const nb_path = `/n/${NOTEBOOK_SLUG}/api/batch`;

  try {
    await ensure_notebook(base, NOTEBOOK_SLUG, NOTEBOOK_TITLE);

    const types_key = randomUUID();
    const types_batch = build_types_batch();
    const first = await post_json(base, nb_path, types_batch, types_key);
    if (first.status !== 200) fail('types batch', first.status, first.body);
    console.log(`[seed] types batch: ${summarize_results(first.body)}`);

    const replay = await post_json(base, nb_path, types_batch, types_key);
    if (replay.status !== first.status || replay.body !== first.body) {
      console.error('[seed] idempotency replay mismatch');
      process.exit(1);
    }
    console.log('[seed] types batch idempotency replay: byte-identical');

    const sections_batch = build_sections_batch();
    const sections_result = await post_json(base, nb_path, sections_batch, randomUUID());
    if (sections_result.status !== 200) fail('sections batch', sections_result.status, sections_result.body);
    console.log(`[seed] sections batch: ${summarize_results(sections_result.body)}`);

    console.log(`[seed] seeded ${NOTEBOOK_SLUG} at ${base}/n/${NOTEBOOK_SLUG}/api`);
  } finally {
    await server.close();
  }
};

await main();
