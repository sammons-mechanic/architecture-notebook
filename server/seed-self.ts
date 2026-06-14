import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SELF_TYPE_SEEDS } from './seed-data/self-types.ts';
import { SELF_SECTION_SEEDS } from './seed-data/self-tree.ts';

const SLUG = process.env.SEED_SELF_SLUG ?? 'architecture-notebook';
const TITLE = process.env.SEED_SELF_TITLE ?? 'Architecture Notebook (self)';

const post_json = async (base: string, path: string, body: object, key?: string): Promise<{ status: number; body: string }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/hal+json' };
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.text() };
};

const fail = (where: string, status: number, body: string): never => {
  console.error(`[seed-self] ${where} failed (${status}):\n${body}`);
  process.exit(1);
};

const summarize = (envelope: string): string => {
  const parsed = JSON.parse(envelope) as { results?: ReadonlyArray<{ id: string; status: number }> };
  if (!parsed.results) return 'no results';
  const failures = parsed.results.filter((op) => op.status < 200 || op.status >= 300);
  const ok = parsed.results.length - failures.length;
  const sample = failures.slice(0, 3).map((f) => `${f.id}=${f.status}`).join(', ');
  return failures.length === 0
    ? `${ok}/${parsed.results.length} ops created`
    : `${ok}/${parsed.results.length} ops created; failures: ${sample}`;
};

const ensure_notebook = async (base: string): Promise<void> => {
  const existing = await fetch(`${base}/api/notebooks/${SLUG}`);
  if (existing.status === 200) {
    console.log(`[seed-self] notebook ${SLUG} already exists; reusing`);
    return;
  }
  const created = await post_json(base, '/api/notebooks', { slug: SLUG, title: TITLE });
  if (created.status !== 201) fail('create notebook', created.status, created.body);
  console.log(`[seed-self] created notebook ${SLUG}`);
};

const build_types_batch = () => ({
  atomic: false,
  ops: SELF_TYPE_SEEDS.map((t) => ({
    id: `t-${t.slug}`,
    method: 'POST',
    href: '/api/types',
    body: { slug: t.slug, name: t.name, color: t.color, description: t.description, property_schema: t.property_schema },
  })),
});

const build_sections_batch = () => ({
  atomic: true,
  ops: SELF_SECTION_SEEDS.map((s) => {
    const body: Record<string, unknown> = { slug: s.slug, title: s.title, type: s.type };
    if (s.parent !== null) body.parent = s.parent;
    if (s.deck !== undefined) body.deck = s.deck;
    if (s.tags !== undefined) body.tags = s.tags;
    if (s.properties !== undefined) body.properties = s.properties;
    if (s.html !== undefined) body.html = s.html;
    return { id: `s-${s.slug}`, method: 'POST', href: '/api/sections', body };
  }),
});

const read_running_url = async (): Promise<string | null> => {
  try {
    const text = (await readFile('data/.port', 'utf8')).trim();
    return text.length > 0 ? text : null;
  } catch { return null; }
};

const main = async (): Promise<void> => {
  const running = await read_running_url();
  if (!running) {
    console.error('[seed-self] no running server detected (data/.port missing). Start `pnpm dev` first.');
    process.exit(1);
  }
  console.log(`[seed-self] seeding into running server at ${running}`);
  const base = running;
  await ensure_notebook(base);
  const nb_path = `/n/${SLUG}/api/batch`;
  const types = await post_json(base, nb_path, build_types_batch(), randomUUID());
  if (types.status !== 200) fail('types batch', types.status, types.body);
  console.log(`[seed-self] types: ${summarize(types.body)}`);
  const sections = await post_json(base, nb_path, build_sections_batch(), randomUUID());
  if (sections.status !== 200) fail('sections batch', sections.status, sections.body);
  console.log(`[seed-self] sections: ${summarize(sections.body)}`);
  console.log(`[seed-self] open ${base}/#/n/${SLUG}`);
};

await main();
