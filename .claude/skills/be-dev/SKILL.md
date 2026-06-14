---
name: be-dev
description: Backend implementation reference for the Architecture Notebook — Node 24 type-stripped server, node:sqlite schema, HAL+JSON HTTP API, validation, link scanning, migrations, PDF strategy, and node:test conventions. Load when building, editing, or reviewing any code under server/, test/, migrations/, or the AI-facing skill/SKILL.md.
---

# Architecture Notebook — Backend

Canonical artifacts:
- **API spec → `design/api.md`** (HAL+JSON, schematic, walkthroughs)
- **AI-facing skill → `skill/SKILL.md`** (contract for AI clients consuming the API)
- **Code style → `/typescript` skill** — naming (`snake_case` vars/functions, `PascalCase` types, `kebab-case` files, full words), three-layer module split (lib/adapters/routes), `T | Failure` for validation, single-`assert.deepEqual` tests, no enums/namespaces/decorators. Load it alongside this skill whenever you write or review `.ts`.

Keep both in sync with code: any route, schema, or error change touches `design/api.md` and `skill/SKILL.md` in the same commit.

## Stack
- **Node 24+** runs `.ts` files directly via type-stripping. No transpile for the server.
- **node:sqlite** for storage. WAL mode. All writes inside transactions.
- **node:http** — no Express, no framework.
- **node:test** + `node:assert/strict` for tests.
- **esbuild** only for bundling `web/main.ts` → `web/dist/main.js`. Served by the same Node server.
- **pnpm** for the handful of deps: `lit`, `@lit-labs/signals`, `esbuild`, `@types/node`. Add nothing else without a hard reason.
- `"type":"module"`. ESM everywhere.
- Bind server to `127.0.0.1` only. Unauthenticated.

## Layout
```
server/
  index.ts          # http server, route table, body/json helpers
  db.ts             # sqlite open, WAL, migration runner
  router.ts         # method+path matcher; templated link emitter
  hal.ts            # _links / _actions / _embedded builders, ETag helpers
  problem.ts        # RFC 7807 problem-details responses
  idempotency.ts    # Idempotency-Key store (in-memory, 24h TTL)
  migrations/
    001_init.sql, 002_*.sql, ...
  routes/
    root.ts         # GET /api, /api/health
    types.ts        # /api/types[/{slug}[/sections]]
    sections.ts     # /api/sections[/{slug}[/{children|ancestors|refs|move}]]
    refs.ts         # /api/refs[/{id}]
    graph.ts        # /api/graph
    search.ts       # /api/search
    batch.ts        # /api/batch
    print.ts        # /print
    spa.ts          # / and /* (non-/api/) → web/dist/
  batch-exec.ts     # execute_atomic(deps: Deps, ops) and execute_non_atomic(deps: Deps, ops) — route-helper for batch; lives outside lib/ because it executes SQL via deps.db
  lib/              # pure — no I/O, no DB, no fetch
    types.ts        # ValidatedBody, RootDoc, Deps, ValidateDeps, OpResults; re-exports IdempotencyStore from ../idempotency.ts (canonical declaration there)
    failure.ts      # Failure type + is_failure guard (shape per /typescript)
    validate.ts     # validate_body(body, schema, deps: ValidateDeps) => ValidatedBody | Failure
    validate-fields.ts  # validate_field(field, value, deps: ValidateDeps) => unknown | Failure
    validate-schemas.ts # resolve_schema(action, body, deps: ValidateDeps) => PropertySchema | Failure (modes 1–4); action is { schema?: PropertySchema; schema_ref?: string } (exactly one set)
    links.ts        # scan HTML + properties for <arch-ref>, diff edges (DB writes happen in the route's transaction, callers pass a pure-data diff result)
    numbering.ts    # compute 1.2.3 from tree position
    slug.ts         # slug normalize + collision suffix
    render.ts       # server-side HTML render for /print
    log.ts          # tiny logger
    batch-deps.ts   # analyze_dependencies(ops) => { order: string[]; pre_failures: Map<string, Failure> } | Failure
    batch-tokens.ts # substitute_tokens(body, results) => unknown | Failure (whole-leaf only, types preserved; producer-op-type check here)
test/
  _helpers.ts       # makeServer, seed, req
  *.test.ts
data/notebook.db    # gitignored
skill/SKILL.md      # AI-facing API skill (separate from .claude skills)
```

## Run
- `pnpm dev` → `node --watch --experimental-strip-types server/index.ts`
- `pnpm build:web` → `esbuild web/main.ts --bundle --format=esm --outfile=web/dist/main.js`
- `pnpm dev:web` → same with `--watch`
- `pnpm test` → `node --test --experimental-strip-types test/*.test.ts`
- `pnpm test:watch` → add `--watch`
- Prefer `node --run <script>` from `package.json` scripts (Node 22+; faster than `npm run`).

## Data model
```sql
-- 001_init.sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE section_types (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,                       -- hex; drives --type-<slug>
  property_schema_json TEXT NOT NULL DEFAULT '{"fields":[]}',
  etag TEXT NOT NULL,                 -- weak etag, rotated on every write
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  type_id INTEGER NOT NULL REFERENCES section_types(id) ON DELETE RESTRICT,
  parent_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deck TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  properties_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  html TEXT NOT NULL DEFAULT '',
  etag TEXT NOT NULL,                 -- weak etag, rotated on every write
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX sections_parent_pos ON sections(parent_id, position);

CREATE TABLE refs (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  to_id   INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  role TEXT,
  source TEXT NOT NULL DEFAULT 'html',  -- 'html'|'property'|'manual'
  payload_json TEXT,
  etag TEXT NOT NULL,                   -- weak etag, rotated on every write
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(from_id, to_id, role, source)
);
CREATE INDEX refs_from ON refs(from_id);
CREATE INDEX refs_to   ON refs(to_id);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  body_hash TEXT NOT NULL,             -- sha256 hex of canonical-JSON body
  response_status INTEGER NOT NULL,
  response_headers_json TEXT NOT NULL, -- JSON map of {ETag, Location, Content-Type, ...}
  response_body TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- meta keys used: 'schema_version' (numeric), 'notebook_title', 'notebook_revision'.
-- The notebook config lives here and has no etag — PATCH /api skips If-Match (single-writer).
```

Cycles in `refs` are valid. Self-refs are valid. Tree cycles (via `parent_id`) are illegal — enforced in the move/create paths by walking ancestors. Numbering (`1.2.3`) is **computed**, never stored. ETags are stored on `sections`, `section_types`, and `refs`; rotated to a fresh hex string on every write of that row.

## API
See **`design/api.md`** for the full specification, schematic, and walkthroughs. Quick reference:

- HAL+JSON with `_links`, `_actions`, `_embedded`. Plain `application/json` strips hypermedia.
- ETag + `If-Match` on PATCH, DELETE, and POST `move` for resources that expose `_etag` (sections, types, refs). **Exception**: `PATCH /api` (notebook config) has no `_etag` and does not require `If-Match` (single-row single-writer).
- ETag value is rotated on every write to that row: `crypto.randomBytes(8).toString('hex')`. Returned as a weak ETag `W/"<hex>"`.
- `Idempotency-Key` on POST/PATCH/DELETE (rejected on GET and on inner batch ops with `idempotency-misplaced` 400). 24h replay including cached headers; 409 on key reuse with different body. For 204 responses, `response_headers_json` is `{}`.
- Errors: `application/problem+json` (RFC 7807) with a project-specific `hint` field pointing at a follow-link.
- `?embed=type,parent,refs,children` opts into inlined resources. `?fields=` projects shape.
- `POST /api/batch` runs ops in a single SQLite transaction with `$opid.slug`/`$opid.id` back-references. Per-op `if_match` allowed. Envelope status is always 200 on a well-formed envelope.

Statuses: 200 / 201 / 204 / 400 / 404 / 405 / 406 / 409 / 412 / 413 / 422 / 428 / 500.

## Validation (`lib/validate.ts`)
PropertySchema lives on `section_types.property_schema_json`:
```ts
type PropertySchema = {
  fields: Array<{
    key: string;
    type: 'string'|'number'|'boolean'|'enum'|'ref'|'multi-ref'|'rich'|'multi-string'|'schema-driven';
    required?: boolean;
    enum?: string[];            // for type='enum'
    refType?: string;           // type slug constraint for type='ref'/'multi-ref'
    placeholder?: string;
    schema_ref?: string;        // for type='schema-driven'
  }>;
};
```
Behavior: unknown keys stripped (not errored). Missing required → 422 with `errors[]`. Type mismatch → 422. `ref` validity checked against `sections.slug`; `refType` (if set) checked against that section's type slug. Errors include a `hint` link (e.g. `/api/search?q=<value>`).

## Link scanning (`lib/links.ts`)
Inside the same transaction as any section save:

1. From `html`: tokenize each `<arch-ref ...>` (or self-closing) opening tag per the lenient parser in `design/api.md` §5.4.1. For each well-formed tag, emit `{ to, role, source: 'html' }`. Malformed → 422 `arch-ref-malformed` aborting the save.
2. From `properties_json`: walk every field declared `type:'ref'`/`'multi-ref'` → `{ to: value, role: field.key, source: 'property' }`.
3. Delete existing rows where `from_id = section.id AND source IN ('html','property')`. Bulk-insert the new set. Manual refs (`source='manual'`) untouched.
4. Unresolved `to` slugs do **not** fail the save. Returned in the response as `unresolved_refs: [{to, role, source}]`. Required `ref`-typed *properties* that are unresolved DO fail with `ref-unresolved` (422).

Hand-roll the parser: iterate over `<arch-ref` occurrences, read up to the closing `>` or `/>`, split attributes on whitespace, strict-match `key='value'` or `key="value"` (no entity decoding, no unquoted values, no duplicate keys, only `to` and `role`). Same rules in api.md §5.4.1 — do not diverge.

## Numbering (`lib/numbering.ts`)
Recompute on every read. Walk the tree top-down assigning `1, 2, 3, ...` at each level by `position`. Cache per-request: never store. Tree-cycle protection in move/create: walk ancestors of the new parent; if `target.id` appears, reject with `cycle-illegal` 422.

## PDF
Default: browser Save-as-PDF on `GET /print`. Renders cover + computed TOC + every section in tree order with print CSS. Cross-references render as `name<sup>n</sup>` with per-page footnote list mapping `n → section.number, p. NN`. Page numbers via CSS `@page` counters where the browser supports it; otherwise let the browser supply them.

Do **not** add Puppeteer/Playwright as a dep unless asked for programmatic export.

## Migrations (`server/db.ts`)
- Files in `server/migrations/NNN_*.sql`. Numeric prefix is the version.
- On startup: `SELECT value FROM meta WHERE key='schema_version'`. Apply every higher-numbered file in order, one transaction per file. Update `meta.schema_version` after each.
- Never edit a shipped migration. Add a new one.

## Idempotency store (`server/idempotency.ts`)
In-memory `Map<key, {body_hash, status, body, expires_at}>` (also persisted in `idempotency_keys` table for crash recovery). On POST/PATCH/DELETE with `Idempotency-Key`:
- Same key + same body hash → replay cached response (same status, same body, same ETag).
- Same key + different body → 409 `idempotency-conflict`.
- New key → execute; cache result before responding.
- TTL 24h. Sweep on startup and lazily on access.

## Testing (`node:test`)

**Principles**
- Real SQLite, never mocked. Each test uses `:memory:` seeded by running all migrations. Mock SQLite has burned the team before; don't.
- Test through the HTTP boundary for routes. Test pure functions (validate, links, slug, render, numbering) directly.
- One behavior per `test()` block. Use `describe()` for grouping.
- Tests must not depend on order or shared state.

**Helpers (`test/_helpers.ts`)**
```ts
export async function makeServer(): Promise<{
  port: number;
  db: Database;
  close: () => Promise<void>;
}>;
export async function seed(db: Database, fixtures: { types?, sections?, refs? }): Promise<void>;
export async function req(port: number, method: string, path: string, body?: unknown, headers?: Record<string,string>): Promise<{ status: number; json?: any; headers: Record<string,string> }>;
```

**File naming**
`test/<area>.test.ts` — e.g. `routes.sections.test.ts`, `lib.links.test.ts`, `db.migrations.test.ts`, `hal.actions.test.ts`.

**What to cover**
- Every route: happy path + 1–2 representative errors (404, 422, 412).
- ETag: PATCH without `If-Match` → 428 (required) or 412 (mismatched). Successful PATCH bumps `_etag`.
- Idempotency: replay returns identical body; key reuse with different body → 409.
- `lib/links.ts`: one ref, many, role variants, cycles, self-ref, missing role, unresolved slug, manual refs left alone.
- `lib/validate.ts`: each property type, required, enum, ref/refType resolution, unknown-key stripping.
- `lib/numbering.ts`: deep nesting, reorder, reparent, tree-cycle rejection.
- `routes/batch.ts`: atomic rollback on mid-op failure; `$opid.slug` resolution; non-atomic best-effort.
- `db.ts`: migrations idempotent, version advances correctly.

**Avoid**
- Snapshot tests of HTML or HAL bodies (brittle — assert specific fields).
- Sleeps. Use awaits.
- Filesystem outside `:memory:` and a tmp dir.
- Mocking `fetch` in route tests — hit the server.

## Don'ts
- No ORM. No query builder. Hand-write SQL through prepared statements.
- No mocking the database. No mocking `fetch` in route tests.
- No third-party HTTP frameworks, validators (zod/ajv), or schema libraries.
- No Puppeteer/Playwright unless asked.
- No `unknown` blobs in tables that should be typed columns. JSON columns only for genuinely free-form data (`properties_json`, `payload_json`, `tags_json`).
- No async I/O during transactions. `node:sqlite` is sync; keep DB work synchronous inside `db.transaction(...)` and only await outside.
- No bare `console.log` in shipped code. Use `lib/log.ts`.
- No `try/catch` that swallows. Either handle or rethrow with context.
- No URL templates exposed to clients — they follow `_links`. Server may use templates internally.

## When extending
1. **Schema change** → new migration file, never edit a shipped one. Update validators, `design/api.md`, and `skill/SKILL.md` in the same change.
2. **New endpoint** → add a route module, register in `server/index.ts`, add `_links`/`_actions` wherever it becomes legal to follow, add tests covering happy path + 422/404, update `design/api.md` and `skill/SKILL.md`.
3. **New PropertySchema field kind** → extend `lib/validate.ts` and the `PropertySchema` union. The UI (`/ui-dev`) needs a matching renderer.
4. **New ref source** (e.g. scanning a new field) → extend `lib/links.ts`, add the new `source` value, add tests for the diff behavior.
5. **New error code** → register in `server/problem.ts`, document under `design/api.md` §8, ensure it carries a `hint` link where possible.
