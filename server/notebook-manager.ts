import { mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { open_database, run_migrations, schema_version, type Database } from './db.ts';
import { backfill_unresolved_refs } from './refs-sync.ts';
import { broadcast_notebook_created, broadcast_notebook_deleted } from './broadcasts.ts';
import { create_idempotency_store, type IdempotencyStore } from './idempotency.ts';
import { create_router, type Router } from './router.ts';
import { register_routes } from './wire-routes.ts';
import { build_root_doc_for } from './notebook-root-doc.ts';
import { read_notebook_version } from './repo-notebook-meta.ts';
import type { Deps, NotebookVersion } from './lib/types.ts';

const SLUG_REGEX = /^[a-z0-9-]+$/;

export type NotebookEntry = {
  readonly slug: string;
  readonly db: Database;
  readonly idempotency: IdempotencyStore;
  readonly router: Router;
};

export type NotebookSummary = {
  readonly slug: string;
  readonly title: string;
  readonly version: NotebookVersion;
  readonly schema_version: number;
  readonly section_count: number;
  readonly updated_at: number | null;
};

export type ManagerOptions = {
  readonly data_dir: string;
  readonly version: string;
};

export type NotebookManager = {
  readonly list: () => Promise<ReadonlyArray<NotebookSummary>>;
  readonly summary: (slug: string) => NotebookSummary | null;
  readonly get: (slug: string) => NotebookEntry | null;
  readonly create: (slug: string, title: string) => NotebookSummary;
  readonly remove: (slug: string) => Promise<boolean>;
  readonly exists: (slug: string) => boolean;
  readonly close_all: () => Promise<void>;
  readonly data_dir: string;
};

const path_for = (data_dir: string, slug: string) => join(data_dir, `${slug}.db`);

const build_summary = (slug: string, db: Database, path: string | null): NotebookSummary => {
  const title_row = db.prepare("SELECT value FROM meta WHERE key = 'notebook_title'").get() as { value?: string } | undefined;
  const count_row = db.prepare('SELECT COUNT(*) AS n FROM sections').get() as { n: number };
  const updated_row = db.prepare('SELECT MAX(updated_at) AS t FROM sections').get() as { t: number | null };
  return {
    slug,
    title: title_row?.value ?? '',
    version: read_notebook_version(db),
    schema_version: schema_version(db),
    section_count: count_row?.n ?? 0,
    updated_at: updated_row?.t ?? null,
  };
};

export const create_notebook_manager = async (options: ManagerOptions): Promise<NotebookManager> => {
  const entries = new Map<string, NotebookEntry>();
  const summaries = new Map<string, NotebookSummary>();
  const in_memory = options.data_dir === ':memory:';
  if (!in_memory) await mkdir(options.data_dir, { recursive: true });

  const get_peer_db = (notebook_slug: string): Database | null => {
    const entry = entries.get(notebook_slug);
    return entry ? entry.db : null;
  };

  const peers_as_dbs = (): Iterable<readonly [string, Database]> => {
    const out: Array<readonly [string, Database]> = [];
    for (const [slug, entry] of entries) out.push([slug, entry.db] as const);
    return out;
  };

  const open_entry = (slug: string, db_path: string): NotebookEntry => {
    const db = open_database(db_path);
    run_migrations(db);
    backfill_unresolved_refs(db);
    const idempotency = create_idempotency_store(db);
    const router = create_router();
    const root_doc = build_root_doc_for(db);
    const deps: Deps = {
      db,
      root_doc,
      idempotency,
      version: options.version,
      req_path: '/',
      get_peer_db,
      notebook_slug: slug,
    };
    register_routes(router, deps);
    return { slug, db, idempotency, router };
  };

  // Open the on-disk db for `slug` and register it in the live set.
  const load_entry = (slug: string): NotebookEntry => {
    const entry = open_entry(slug, path_for(options.data_dir, slug));
    entries.set(slug, entry);
    summaries.set(slug, build_summary(slug, entry.db, path_for(options.data_dir, slug)));
    return entry;
  };

  // Pick up any `<slug>.db` files on disk that aren't open yet. Run at startup
  // and again on every list() so a notebook created out-of-band — a seed
  // script, another process, a restored backup — surfaces without a restart.
  const scan_disk = async (): Promise<void> => {
    if (in_memory || !existsSync(options.data_dir)) return;
    const files = await readdir(options.data_dir);
    for (const file of files) {
      if (!file.endsWith('.db')) continue;
      const slug = file.slice(0, -3);
      if (!SLUG_REGEX.test(slug) || entries.has(slug)) continue;
      load_entry(slug);
    }
  };

  // Lazily adopt a single notebook whose db file exists on disk but isn't open
  // yet. Synchronous so get()/exists()/summary() stay sync on the request path.
  const ensure_loaded = (slug: string): NotebookEntry | null => {
    const open = entries.get(slug);
    if (open) return open;
    if (in_memory || !SLUG_REGEX.test(slug)) return null;
    if (!existsSync(path_for(options.data_dir, slug))) return null;
    return load_entry(slug);
  };

  await scan_disk();

  const list = async () => {
    await scan_disk();
    const out: NotebookSummary[] = [];
    for (const [slug, entry] of entries) {
      out.push(build_summary(slug, entry.db, in_memory ? null : path_for(options.data_dir, slug)));
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
  };

  const get = (slug: string) => ensure_loaded(slug);
  const summary = (slug: string) => {
    const entry = ensure_loaded(slug);
    return entry ? build_summary(slug, entry.db, in_memory ? null : path_for(options.data_dir, slug)) : null;
  };
  const exists = (slug: string) => ensure_loaded(slug) !== null;

  const create = (slug: string, title: string): NotebookSummary => {
    if (!SLUG_REGEX.test(slug)) throw new Error('slug-invalid');
    const conflict = in_memory ? entries.has(slug) : ensure_loaded(slug) !== null;
    if (conflict) throw new Error('slug-conflict');
    const db_path = in_memory ? ':memory:' : path_for(options.data_dir, slug);
    const entry = open_entry(slug, db_path);
    entry.db.prepare("UPDATE meta SET value = ? WHERE key = 'notebook_title'").run(title);
    entries.set(slug, entry);
    broadcast_notebook_created(peers_as_dbs(), slug);
    return build_summary(slug, entry.db, in_memory ? null : db_path);
  };

  const remove = async (slug: string): Promise<boolean> => {
    const entry = ensure_loaded(slug);
    if (!entry) return false;
    // Sweep peer refs FIRST while the notebook is still registered; the
    // peers don't need the doomed DB for the sweep (their refs table
    // alone tells them what to demote).
    broadcast_notebook_deleted(peers_as_dbs(), slug);
    entry.db.close();
    entries.delete(slug);
    summaries.delete(slug);
    if (!in_memory) {
      const file = path_for(options.data_dir, slug);
      try { await unlink(file); } catch { /* ignore */ }
    }
    return true;
  };

  const close_all = async () => {
    for (const entry of entries.values()) entry.db.close();
    entries.clear();
    summaries.clear();
  };

  return { list, summary, get, create, remove, exists, close_all, data_dir: options.data_dir };
};

export type { Database };
