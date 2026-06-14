# One-Shot Build Prompt — Architecture Notebook

Copy everything below the `---` into a fresh Claude Code session opened in the project root directory. The session should produce a working local app, a passing test suite, and the AI-facing `skill/SKILL.md`.

---

## Your job

Build the Architecture Notebook end-to-end from this directory. Working dir: the project root directory. You have file system access, Bash, and pnpm. Node 24+ must be available; if it isn't, surface that as a blocker before doing anything else.

The full spec is already on disk. You are implementing, not designing.

## Read first (in this exact order)

1. `.claude/skills/dev/SKILL.md` — your dispatcher
2. `.claude/skills/fs-dev/SKILL.md` — design judgment at the seam
3. `.claude/skills/be-dev/SKILL.md` — server rules (incl. the canonical schema)
4. `.claude/skills/ui-dev/SKILL.md` — UI rules
5. `design/api.md` — the API contract (implement faithfully)
6. `design/mockup.html` — the visual (port faithfully)

These are the spec. If your implementation needs to deviate, STOP, update the spec first (run `/fs-dev`'s 7-step checklist), then continue.

## Scope (MVP)

**In scope**:
- Node HTTP server, SQLite-backed, HAL+JSON API per `design/api.md`
- All resources: `/api`, `/api/health`, `/api/types`, `/api/sections`, `/api/refs`, `/api/graph`, `/api/search`, `/api/batch`, `/print`, SPA fallback
- ETag + If-Match (with `PATCH /api` as the documented exception), Idempotency-Key, Problem+JSON errors with `hint`
- HTML + property link scanning into `refs` table
- Section number computation
- Schema-driven validation (PropertySchema)
- Seed data via `/api/batch`: the Acme Trading System tree from the mockup
- UI: Read view (tree + section + glimpse with URL-backed stack), TOC view, Print view (iframe of `/print`)
- `<arch-ref>` web component
- AI-facing skill at `skill/SKILL.md` — completed in lock-step with `design/api.md` updates
- Tests covering every route + every lib module + every error code + contract-shape acceptance

**Out of scope (do not build)**:
- Edit-in-UI (authoring is API-only; do not add contenteditable or edit buttons)
- Cursor pagination (use `total` only)
- Search snippets / fuzzy ranking (use SQL `LIKE`; `snippet` may be empty)
- Programmatic PDF generation (rely on browser Save-as-PDF on `/print`)
- Type CRUD in the UI (API-only)
- Auth (binds 127.0.0.1)
- Foot-meta surfaces (Revisions, Comments) — render as deferred stubs
- UI component unit tests — verification is the manual Phase 4.2 walkthrough

## Hard constraints (never violate)

- Node 24+. ESM. Type-stripping for the server (`--experimental-strip-types`). No transpile for server code.
- Deps: `lit`, `@lit-labs/signals`, `esbuild`, `@types/node`. Pin `packageManager: "pnpm@9.x"`. Commit `pnpm-lock.yaml`. Nothing else without explicit user permission.
- Use only built-ins: `node:http`, `node:sqlite`, `node:test`, `node:assert/strict`, `node:crypto`, `node:fs/promises`, `node:path`, `node:url`.
- Bind explicitly via `server.listen({ host: '127.0.0.1', port })`. Add a test asserting the bound address.
- node:sqlite is **synchronous, single connection**. WAL mode for read-during-write. Never `await` inside `db.transaction(...)`.
- No mocks of SQLite or `fetch` in tests. `:memory:` SQLite + real HTTP, seeded per test from migrations.
- UI: Geist + Geist Mono only. Cobalt `--accent` is the only accent color.
- Section numbers are computed, never stored.
- Slugs are `^[a-z0-9-]+$` only. Enforced on POST with `slug-invalid` 422.
- Glimpse stack lives in the URL: `#/section/<slug>/glimpse/<s1>/<s2>/<sN>?c=<i>` (slash-separated, each segment URL-encoded). Cursor is the URL `c` param; default `len-1`. Not in memory.
- ETags are **stored** on `sections`, `section_types`, and `refs` (see `/be-dev` schema). Format: weak `W/"<hex>"`. Rotated to a fresh random hex on every write of that row. Not derived from updated_at.

## Recommended dispatch via `/dev`

After reading the spec, use the `/dev` skill. Expected path:

- **Phase 0** (bootstrap + skill stub) — main thread, sequential
- **Phase 1** (backend) and **Phase 2** (UI) — **fan out** as two `general-purpose` Agents in a single message; briefs follow `/dev`'s template.
- **Phase 3** (AI-facing skill, completion) — main thread, after Phase 1.
- **Phase 4** (seed via `/api/batch` + acceptance) — main thread, after Phases 1 + 2 reconciled.

If a fan-out child reports the contract must change, STOP the other child, return to `/fs-dev`, update `design/api.md` AND `skill/SKILL.md` (and `design/mockup.html` if visual) in the same edit, then re-brief.

---

## Phase 0 — Bootstrap (main thread)

Use the harness's task/todo tool (`TodoWrite` or equivalent) to track each phase.

1. Verify `node --version` ≥ 24.
2. Create:
   - `package.json` — `"type": "module"`, `"packageManager": "pnpm@9.x"`, scripts:
     - `dev`: `node --watch --experimental-strip-types server/index.ts`
     - `dev:web`: `esbuild web/main.ts --bundle --format=esm --platform=browser --target=es2022 --sourcemap --watch --outfile=web/dist/main.js`
     - `build:web`: `esbuild web/main.ts --bundle --format=esm --platform=browser --target=es2022 --minify --outfile=web/dist/main.js && node scripts/copy-static.mjs`
     - `build`: `node --run build:web`
     - `test`: `node --test --experimental-strip-types test/*.test.ts`
     - `test:watch`: same + `--watch`
     - `seed`: `node --experimental-strip-types server/seed.ts`
   - `tsconfig.json` — `target: "ES2024"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`.
   - `.gitignore` — `node_modules/`, `data/`, `web/dist/`, `.DS_Store`, `*.log`.
   - `scripts/copy-static.mjs` — copies `web/index.html` and `web/styles.css` into `web/dist/`.
   - `data/.gitkeep` — empty file so the dir exists on fresh checkout (the server's port-file write depends on it).
3. `pnpm install`. Commit `pnpm-lock.yaml`.
4. Create `skill/SKILL.md` as a stub (plain Markdown, optional YAML frontmatter). Phase 3 fills it in. Stub exists so Phase 1 fan-out can update it in lock-step on any contract deviation.
5. Smoke: `node --experimental-strip-types -e "console.log('ok')"` exits 0.

---

## Phase 1 — Backend (fan-out child A · `/be-dev`)

Brief the child to load `/be-dev` first, then implement in this order. The canonical schema lives in `/be-dev`'s SKILL — use it verbatim, including `etag` columns on `sections`, `section_types`, and `refs`, and the `response_headers_json` column on `idempotency_keys`.

### 1.1 DB layer
- `server/db.ts` — open sqlite, set `PRAGMA foreign_keys = ON` + `PRAGMA journal_mode = WAL`. Single shared synchronous connection. Ensure `data/` exists via `fs.mkdir(dirname(dbPath), { recursive: true })` before opening.
- `server/migrations/001_init.sql` — schema from `/be-dev §Data model`. Migration files themselves do NOT write to `meta.schema_version` — the runner owns that. The file MUST also seed the notebook config defaults on first apply: `INSERT INTO meta(key,value) VALUES('notebook_title','Untitled Notebook'), ('notebook_revision','0')`.
- Migration runner: on startup, probe `sqlite_master` for the `meta` table. **If `meta` is absent → version `0`. If `meta` exists but the `schema_version` row is absent → version `0`. Otherwise → read the row.** Then run every file with a higher numeric prefix in order. Each migration runs in its own transaction; the runner `INSERT OR REPLACE`s `meta.schema_version` to the file's numeric prefix within that same transaction. Failure rolls back that migration only; prior migrations are never rolled back. Never edit a shipped migration.
- Test: `test/db.migrations.test.ts` — fresh `:memory:`, migrations apply, idempotent on second run, `schema_version` advances and equals filename count.

### 1.2 Lib modules (with tests)
- `server/lib/slug.ts` — normalize (`^[a-z0-9-]+$`), collision suffix `-2`, `-3`, …; reject inputs not matching the pattern with `slug-invalid` 422.
- `server/lib/numbering.ts` — compute `1.2.3` from a tree snapshot; siblings ordered by `(position ASC, id ASC)`; move-cycle detection by ancestor walk of the new parent.
- `server/lib/validate.ts` — `PropertySchema` per `/be-dev §Validation`. Returns `ValidatedBody | Failure` (per `/typescript`):
  - On success: the validated/coerced body object.
  - On failure: `{ readonly error: true; readonly code: 'validation'; readonly message: string; readonly errors: ReadonlyArray<{ field: string; code: string; message: string; hint?: string }> }`.
  - Callers narrow with `is_failure(value)` from `lib/failure.ts` (shared utility — same shape used elsewhere in the server).
  - PATCH semantics: `properties` is shallow-merged by key; explicit `null` deletes a key.
  - Unresolved `ref`/`multi-ref`:
    - **Required** field unresolved → 422 `ref-unresolved` with `hint = "/api/search?q=<value>"`.
    - **Optional** field unresolved → save succeeds; surfaced in response `unresolved_refs[]`.
  - Same rule on POST and PATCH.
  - Keys inside the `properties` object that are not declared in `property_schema.fields` are stripped silently. Top-level body keys outside the resource schema are rejected with `validation` 422.
- `server/lib/links.ts` — scan `html` and walk `properties` for refs.
  - **Relaxed parser** for `<arch-ref>`: accept either attribute order (`to` first or `role` first), either quote style (`"` or `'`), optional whitespace around `=`, both self-closing and paired forms. Reject (422 `arch-ref-malformed`) tags that: lack `to`, have a `to` value not matching `^[a-z0-9-]+$`, or carry any attribute besides `to` and `role`. Match `design/api.md` §5.4.1.
  - All link-scan + diff work inside the same SQLite transaction as the section write.
  - Diff against rows where `from_id = section.id AND source IN ('html','property')`; manual refs untouched.
- `server/lib/log.ts` — logger with levels `error|warn|info|debug` filtered by `LOG_LEVEL` (default `info`). One access-log line per request at `info`: `method path status duration_ms`.

### 1.3 HTTP infrastructure
- `server/router.ts` — method + path matcher with `:slug` / `:id` segments. Default body size cap **1 MiB** (413 `payload-too-large`); `/api/batch` cap is **8 MiB**. Idle timeout 30s; `keepAliveTimeout` 5s.
- `server/hal.ts` — build `{ _links, _actions, _embedded }`.
  - ETag is **read from the row's `etag` column** and wrapped as `W/"<etag>"`. On every mutation of that row, the column is overwritten with `crypto.randomBytes(8).toString('hex')` (16 hex chars). No version_counter, no time-derived value, no `Math.random`.
  - `etag_of(row)` and `check_if_match(req, etag)` helpers. Return is a tagged union with `kind` per `/typescript`: `{ kind: 'ok' } | { kind: 'missing' } | { kind: 'mismatch', current_etag: string }`.
  - `Accept` negotiation: q-value aware. Default `application/hal+json`. Strip hypermedia only when `application/json` strictly outranks `application/hal+json`. If neither can be satisfied → 406 `not-acceptable`.
  - Unknown method on a matched path → 405 `method-not-allowed` with `Allow:` header.
  - `?embed=` (comma-separated relations) populates `_embedded.{rel}`. `?fields=` projects top-level shape.
- `server/problem.ts` — emit `application/problem+json` with `{ type, title, status, detail, instance, errors?, hint? }`. Top-level `hint` for request-level issues; `errors[].hint` for field-level. `instance` = request path + query string. Codes used in the implementation must match the list in `design/api.md` §8 exactly — no inventing new codes without updating `design/api.md` AND `skill/SKILL.md` in the same edit.
- `server/idempotency.ts`:
  - Body-hash: `sha256` over canonical JSON of the parsed body — keys sorted recursively, no insignificant whitespace, hex-encoded.
  - Cache shape: `{ status, headers: { ETag?, Location?, Content-Type? }, body }`. **Persist headers as JSON** in `idempotency_keys.response_headers_json`. For 204 responses (DELETE), `response_headers_json` is the literal `"{}"` (never NULL).
  - Same key + same body-hash → replay cached response verbatim (including the cached ETag — note that ETag may be stale if the resource was mutated by another request since; clients should refetch after replay before chaining a write).
  - Same key + different body-hash → 409 `idempotency-conflict`.
  - TTL 24h. Warm in-memory cache from table on startup; sweep on startup + lazily on access + every 100 writes.
  - Reject `Idempotency-Key` on GET → 400 `idempotency-misplaced`.
  - `POST /api/batch`: envelope `Idempotency-Key` covers the whole batch. Per-op `Idempotency-Key` rejected with 400 `idempotency-misplaced` inside that op's result.

### 1.4 Routes

One file per resource. Each emits HAL+JSON or, under accept negotiation, plain JSON without `_links`/`_actions`/`_embedded`. Honor `?embed=` and `?fields=`.

**File caps:** the `/typescript` skill mandates ≤100-line absolute cap and "split, don't nest." Route files that exceed this MUST extract helpers into sibling `lib/` files. Per-helper exports (signature contracts):
- `lib/failure.ts`:
  - `type Failure = { readonly error: true; readonly code: string; readonly message: string; readonly errors?: ReadonlyArray<{ field: string; code: string; message: string; hint?: string }> }`
  - `const is_failure = (value: unknown): value is Failure`
- Shared types declared in `lib/types.ts`:
  - `type ValidatedBody = Record<string, unknown>` — opaque-but-narrow alias for "the body after validation/coercion."
  - `type RootDoc = { name: string; schema_version: number; notebook: { title: string; revision: number }; _links: Record<string, { href: string; templated?: boolean }> }` — the cached `GET /api` document. (`name: string` is the constant `"Architecture Notebook"`.)
  - `type IdempotencyStore` — re-exported from `server/idempotency.ts` (the canonical declaration lives next to `create_idempotency_store`). `lib/types.ts` does: `export type { IdempotencyStore } from '../idempotency.ts'`.
  - `type Deps = { db: Database; root_doc: RootDoc; idempotency: IdempotencyStore; req_path: string; req_headers: Record<string, string> }` — the **full request-scoped** bag used by routes and route-helpers that perform I/O. Built fresh per request.
  - `type ValidateDeps = { root_doc: RootDoc; resolve_section_slug: (slug: string) => boolean; resolve_section_type_slug: (section_slug: string) => string | null; resolve_type_schema: (type_slug: string) => PropertySchema | null }` — the **narrow** bag used by pure validators. Built from `Deps` by the route just before calling the validator chain. The pure lib/ validator files never touch `Database` directly; they call the resolver closures the route gives them.
    - `resolve_section_slug`: existence check for a `ref`-typed field value (does a section with this slug exist?).
    - `resolve_section_type_slug`: enforces `refType` constraint (look up the type slug of a section, compare).
    - `resolve_type_schema`: fetches a section type's `PropertySchema` by its type slug — used by Mode-2 and Mode-4 schema discovery.
  - `type OpResults = ReadonlyMap<string, { slug?: string; id?: number }>` — the per-op producer outputs threaded into `substitute_tokens`.
- `lib/validate.ts` (pure): `validate_body(body, schema, deps: ValidateDeps) => ValidatedBody | Failure`.
- `lib/validate-fields.ts` (pure): `validate_field(field, value, deps: ValidateDeps) => unknown | Failure`.
- `lib/validate-schemas.ts` (pure): `resolve_schema(action, body, deps: ValidateDeps) => PropertySchema | Failure` where `action: { schema?: PropertySchema; schema_ref?: string }` (exactly one of the two is set) covers all four modes from `design/api.md` §9. Mode-2 and Mode-4 call `deps.resolve_type_schema(type_slug)`; Mode-3 reads from the body or surrounding resource passed in.
- `routes/batch.ts` orchestrates only; logic lives in:
  - `lib/batch-deps.ts` (pure): `analyze_dependencies(ops) => { order: string[]; pre_failures: Map<string, Failure> } | Failure` (envelope `cycle-illegal` returned as outer `Failure`). Only catches unknown opids and cycles.
  - `lib/batch-tokens.ts` (pure): `substitute_tokens(body, results: OpResults) => unknown | Failure` — whole-leaf `^\$<opid>\.<attr>$` only; `.slug` substitutes a string; `.id` substitutes an integer; tokens in larger strings pass through. Returns `Failure` (`backref-unresolved`) if the producer op didn't expose the requested attribute.
  - `server/batch-exec.ts` (route-helper, NOT under lib/): `execute_atomic(deps: Deps, ops)` and `execute_non_atomic(deps: Deps, ops)`. Lives at `server/batch-exec.ts` because it executes SQL through `deps.db` — pure `lib/` files do not import this. Each returns the envelope body with `results[]` and (atomic only) `rolled_back: boolean`.
- Any other route that grows past 100 lines: extract per-concern helpers into `lib/<resource>-*.ts` with explicit exported signatures.

**ETag / Idempotency-Key matrix:**

| Method on … | If-Match | Idempotency-Key |
|---|---|---|
| POST creates — types, sections, refs | n/a | accepted |
| POST `/api/batch` (envelope) | n/a | accepted (per-op rejected) |
| POST `/api/sections/{slug}/move` | required (428 missing, 412 mismatch) | accepted |
| PATCH `/api` (notebook config) | **not required** (single-writer single-row exception) | accepted |
| PATCH — types, sections | required | accepted |
| DELETE — types, sections, refs | required | accepted |
| GET — all | n/a | rejected (400) |

Every mutating route gets tests for: happy path, 422 validation (where applicable), 412 mismatch, 428 missing, 409 idempotency-conflict, and Idempotency-Key replay.

**Per-resource `_links` / `_actions` checklist** — every relation must be emitted, and a test must assert each by name:

- `/api` (root): `_links: self, types, sections, graph, search, batch, print`. `_actions: update-notebook` (no `If-Match`).
- `/api/types/{slug}`: `_etag`. `_links: self, sections`. `_actions: update, delete` (both require `If-Match`).
- `/api/sections/{slug}`: `_etag`. `_links: self, type, parent, children, ancestors, refs, refs.out, refs.in`. `_actions: update, move, delete, add-child, add-ref` — all mutating actions require `If-Match`; `add-child` and `add-ref` are POST creates (no `If-Match`).
- `/api/sections/{slug}/refs`: read-only sub-collection. `_links: self, section`. No `_actions.create` here — creates go through the section's `_actions.add-ref` (which POSTs to `/api/refs`).
- `/api/refs/{id}`: `_etag`. `_links: self, from, to`. `_actions: delete` (requires `If-Match`; non-manual refs return 422 `ref-derived`).
- Collection responses: `_links: self, first, next?`. `_actions: create`.

**`_actions` schema discovery — four modes** (per `design/api.md` §9):
1. Inline `schema: { fields: [...] }` for fixed-shape actions (`move`, `add-ref`).
2. `schema_ref: "/api/types/<slug>#/property_schema"` — static URL pointing at another resource's schema.
3. `schema_ref: "$.type.property_schema"` — sibling interpolation against the parent resource.
4. `schema_ref: "/api/types/{type}#/property_schema"` — **request-body URI-template substitution**; client supplies `type` in the body; server resolves the template against the submitted body before validating. Used by `add-child` and collection `create`.

Add tests that exercise each mode end-to-end.

**Route specifics:**

- `server/routes/root.ts` — `GET /api`, `GET /api/health` (both include `schema_version`), `PATCH /api`. Notebook config is stored in `meta` (`notebook_title`, `notebook_revision`); seeded by `001_init.sql` so values are always present. `GET /api/health` emits `version` read from `package.json` at server startup (cached in memory). PATCH body shape:
  - `{ title?: string, revision?: number }` — both optional.
  - Empty body `{}` → 200, no-op response with current values.
  - Unknown top-level keys → 422 `validation`.
  - `title` non-string or `revision` non-integer → 422 `validation`.
  - Skips `If-Match` by exception (no `_etag`).
- `server/routes/types.ts` — list, create, get, patch, delete. DELETE returns 409 `type-in-use` with `dependent_count` when sections exist. PATCH/DELETE require `If-Match`.
- `server/routes/sections.ts` — list (`?parent=<slug>` → that parent's direct children; absent → roots only; empty `?parent=` → 422), create, get, patch, delete; `GET /api/sections/{slug}/{children|ancestors|refs}`; `POST /api/sections/{slug}/move`. Move requires `If-Match`; tree-cycle → 422 `cycle-illegal`.
- `server/routes/refs.ts` — list, create (server stamps `source='manual'`; client cannot set source), delete. DELETE on `source != 'manual'` → 422 `ref-derived` with `hint = "/api/sections/<from-slug>"` and message `"Edit the referencing section to remove this reference"`.
- `server/routes/graph.ts` — full tree + edges. `edges[].from` and `.to` are slugs (not numeric ids). `edges[].id` is the ref's numeric id (artifact, not target).
- `server/routes/search.ts` — `?q=`, `?types=`, `?limit=` (default 20, max 100). Empty `q` → 422. Bind `q` as a prepared-statement parameter; escape `%`, `_`, `\` and append `ESCAPE '\\'` to the LIKE clause. Pattern is `%q%`. Response per `design/api.md` §5.6: HAL with `_embedded.results[]`, each item carrying `_links.self`; `snippet` may be empty; filter matches against `title` and `slug`, ordered title-prefix → slug-prefix → contains, ties by `updated_at DESC`. If results truncated at `limit`, set `truncated: true` in the response.
- `server/routes/batch.ts`:
  - Atomic and non-atomic modes per `design/api.md` §5.5.
  - **Dependency analysis algorithm** runs once before execution:
    1. Build a set of declared op ids from `ops[].id`.
    2. For each op, walk its `body` recursively (JSON object/array tree). When a leaf string matches `^\$([a-z0-9_-]+)\.(slug|id)$`, record an edge `op → $1`. Same for `if_match` strings.
    3. Unknown opid in any token → that op is marked **pre-execution-failed** with 422 `backref-unresolved` (recorded in results; doesn't abort dependency graph build).
    4. Cycle detection via Kahn's algorithm. Any cycle → envelope 422 `cycle-illegal` with `errors[]` listing the cycle members.
  - **Token substitution semantics**: substitution operates only on whole-leaf strings matching `^\$<opid>\.<attr>$`. Resolved value preserves its native JSON type: `.slug` substitutes the string slug; `.id` substitutes the integer id (not a stringified id). Tokens embedded inside a larger string (e.g. `"prefix-$s1.slug"`) are NOT substituted — they pass through literally.
  - **Atomic mode**:
    - Any pre-execution failure (unknown opid → `backref-unresolved`; cycle → envelope `cycle-illegal`) is reported BEFORE the SQLite transaction opens. The transaction is never opened in this case.
    - For envelope `cycle-illegal`: envelope status 422, no `results[]` (the envelope is malformed).
    - For pre-execution `backref-unresolved`: envelope status 200; the failing op's result carries the error; remaining ops report `{ id, status: 424, body: { type: '/errors/dependency-aborted', ... } }` because atomic-mode short-circuits without running anything.
    - Once the transaction opens, ops execute in topological order. Any in-transaction failure rolls everything back; results[] still reports per-op status for diagnostics (the failing op + all skipped successors marked `424 dependency-aborted`).
  - **Non-atomic mode**:
    - Pre-execution failures reported as above.
    - Ops execute in topological order honoring dependencies; back-refs resolved at the moment their op runs.
    - If A fails at execute time, every transitive dependent of A fails with `424 dependency-aborted`; independent ops continue.
  - Per-op `if_match` field (sibling to `body`) enforced exactly as the direct route would. `if_match` does NOT accept back-ref tokens (no `$opid._etag`); use a separate read step if you need a fresh ETag.
  - Per-op `Idempotency-Key` rejected → `idempotency-misplaced` 400 inside that op's result.
  - Token support by op type: `POST /api/types` → `$opid.slug`, `$opid.id`. `POST /api/sections` → `$opid.slug`, `$opid.id`. `POST /api/refs` → `$opid.id` from a refs op, OR `$opid.slug`/`$opid.id` from a sections/types op. Unsupported (e.g. `$refsop.slug`) → `backref-unresolved` (422 in op result).
  - Envelope status: **200** on success regardless of inner per-op codes; 422 if envelope malformed or has a dependency cycle; 409 on `Idempotency-Key` reuse; 413 if envelope > 8 MiB.
- `server/routes/print.ts` — `GET /print`.
  - Returns `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, no ETag.
  - **Self-contained** HTML document: all CSS inlined in a `<style>` block, zero external requests (no Google Fonts loaded, no JS). Geist not available → fall back to `ui-sans-serif`; note this is a deliberate trade — the canonical PDF artifact uses the system stack to avoid network dependence.
  - **No masthead, no print-bar, no chrome.** Only cover, computed TOC, and sections, each wrapped in `<section class="page">…</section>`.
  - Page order: cover, TOC, sections in tree-order (depth-first by computed numbering).
  - `<style>` includes `@page { size: Letter; margin: 0.75in } @media print { .page { page-break-after: always; break-inside: avoid; } }` and a `@media screen { ... }` block that draws the page card visually so the iframe preview matches the printed result.
  - Footnote scope: **per-section** (browser doesn't guarantee page boundaries). Cross-refs render as superscript `<sup>` numbers; a per-section `<aside class="footnotes">` lists them.
- `server/routes/spa.ts` — fallback when `method === 'GET'`, `Accept` includes `text/html`, and path doesn't start with `/api/` or `/print`. Serve `web/dist/index.html`. Static assets from `web/dist/` with MIME map: `.js → application/javascript`, `.css → text/css`, `.html → text/html`, `.svg → image/svg+xml`, `.woff2 → font/woff2`, `.json → application/json`, `.map → application/json`, `.ico → image/x-icon`; else `application/octet-stream`.

### 1.5 Server bootstrap
- `server/index.ts` — instantiate db, build router, listen via `server.listen({ host: '127.0.0.1', port })`.
- Port from env `PORT`; else let OS assign (`port: 0`) and read `server.address()`.
- Ensure `data/` exists (`fs.mkdir('data', { recursive: true })`) before writing.
- Print `ARCH_URL=http://127.0.0.1:<port>` to stdout AND write `data/.port` with the URL.
- Env surface: `PORT`, `LOG_LEVEL`, `DB_PATH` (default `data/notebook.db`). Nothing else.
- Wire `SIGINT`/`SIGTERM` for clean shutdown.

### 1.6 Verification (BE-side)
- `pnpm test` passes. Target ≥ 60 tests across: db.migrations (3+), slug (4+), numbering (6+), validate (12+), links (8+), hal/etag (4+), idempotency (4+), batch (8+, including back-ref dependency analysis), search (5+), routes per resource (4+ each, including ref-derived DELETE), problem (3+ for each error code's shape).
- `curl /api/health` → `{ ok: true, version, schema_version }`.
- `curl /api` → HAL+JSON with `_links.{self,types,sections,graph,search,batch,print}`.
- ETag round-trip: GET a section → capture `ETag` header → PATCH with stale `If-Match` → 412 with current `_etag` in body.
- Idempotency replay: POST same body + same key twice → identical body + status.
- Batch atomic rollback: insert a deliberately failing op → all rolled back.

Report back: every file touched, tests added, any deviation from `design/api.md` (if any, `design/api.md` AND `skill/SKILL.md` were updated in the same commit).

---

## Phase 2 — UI (fan-out child B · `/ui-dev`)

Brief the child to load `/ui-dev` first, then implement.

### 2.1 Build pipeline
- `web/index.html` — shell. Google Fonts preconnect + Geist/Geist Mono `?display=swap` link. `<link rel="stylesheet" href="/styles.css">`. Mount point `<arch-app></arch-app>`. Loads `/main.js` as module.
- `web/styles.css` — port all tokens, base, and component classes from `design/mockup.html` verbatim. Add a `@media print` block to the parent app: `arch-masthead, arch-tree, arch-glimpse, arch-print-bar, arch-error, arch-foot-meta, arch-tree-filter { display: none } html, body, arch-app, arch-print { background: white } arch-print iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }`.
- Default behavior when porting: if the plan doesn't mention a detail (animation timing, hover state, paper background, page shadow, border-radius), port the mockup's value verbatim.
- `scripts/copy-static.mjs` — copies `web/index.html` and `web/styles.css` into `web/dist/`. Invoked by `build:web` and once at the start of `dev:web`.
- esbuild for `web/main.ts` only: `--bundle --format=esm --platform=browser --target=es2022`. Dev: `--watch --sourcemap`. Prod: `--minify`.

### 2.2 Store (`web/store.ts`)
Module-level `signal()` instances from `@lit-labs/signals`:
- `currentSectionSlug: Signal<string | null>`
- `currentView: Signal<'read' | 'toc' | 'print'>`
- `glimpseStack: Signal<string[]>` (slugs; derived from URL)
- `glimpseCursor: Signal<number>` (-1 when closed; derived from URL `c` param)
- `tree: Signal<GraphNode[]>`
- `treeOpenState: Signal<Set<string>>` — persisted to `localStorage` under `arch:tree-open`; hydrated on boot.
- `graphCache: Signal<Graph | null>` — full `/api/graph` response.
- `rootDoc: Signal<RootDoc | null>` — full `/api` response with `_links`. Source of truth for every URL the UI follows.
- `error: Signal<ProblemJson | null>` — single error consumer; rendered by `arch-error`.
- `currentSection: Signal<Section | null>` — last fully loaded section with `_etag`.

**Hypermedia discipline (enforced by code review and grep tests):**
- All API calls go through `web/lib/hal-fetch.ts`, which takes a HAL link object `{ href, templated? }` from `rootDoc` / `currentSection` / etc., expands RFC 6570 templates against a variables map, and fetches.
- `web/lib/hal-fetch.ts` is the **only** file allowed to contain literal `/api/` or `/print` strings.
- Discipline test: a Node script at `scripts/check-hypermedia.mjs` reads every `*.ts` / `*.html` under `web/` (excluding `web/lib/hal-fetch.ts`), strips comments, and asserts no source contains the substring `/api/` or `/print` in any context — quoted (single, double, backtick), unquoted, in templates, or in concatenations. Run as part of `pnpm test`.

Actions:
- `bootGraph()` — **idempotent**; no-op if `rootDoc` is populated AND no fetch is in-flight. `GET /api` (cache into `rootDoc`), then follow `rootDoc._links.graph`. Both the router and `arch-app.connectedCallback` call it; the no-op guard prevents double-fetch.
- `loadSection(link, embed?)` — follow the section's `_links.self` (or any link object); honor `?embed=`; populate `currentSection`.
- `searchSections(link, q)` — follow `rootDoc._links.search` (templated with `{q}`).
- `printHref()` — return `rootDoc._links.print.href` for the iframe.
- 412 handler (single): set `error` with the conflict + current ETag from the response; UI shows banner "This section changed. Refresh to see the new version and discard your change?" + Refresh button. No silent merge in the UI. (AI clients reading `skill/SKILL.md` MAY merge; the UI does not — note this divergence in §3.)
- 422 handler: set `error`; UI renders code + message + clickable `hint` link.
- 5xx: generic banner.

### 2.3 Router (`web/router.ts`)
Hash router; `popstate` repaints from URL.

Routes:
- `#/` — empty. After `bootGraph()` resolves, `replaceState` to `#/section/<firstRootSlug>`. Until then render a loading skeleton: two `bg-soft` 12px-tall bars (60% width) stacked in the sidebar, one `bg-soft` 32px-tall title bar plus three 14px-tall bars (70% width) stacked in the main column. No animation.
- `#/section/<slug>` — view `read`, current = `<slug>`, glimpse cleared.
- `#/section/<slug>/glimpse/<s1>/<s2>/<sN>?c=<i>` — same plus glimpse stack = decoded slugs, cursor = clamp(`i`, 0, `len-1`) defaulting to `len-1`.
- `#/toc` — view `toc`.
- `#/print` — view `print`.

URL encoding: each glimpse segment is `encodeURIComponent`'d. `decodeURIComponent` on read. Slugs are `^[a-z0-9-]+$` server-side; this is paranoia + robustness.

| Transition | push or replace |
|---|---|
| Navigate to new section | push |
| Glimpse open (first push to stack) | push |
| Glimpse cursor move via in-glimpse back/forward buttons | push (intentionally redundant with browser back/forward; both walk the same history) |
| Glimpse stack-chip jump (cursor set to specific index) | replace |
| Glimpse close | push (so Back returns to the glimpse) |
| View toggle (read/toc/print) | push |
| Initial-load normalization (`#/` → `#/section/<root>`) | replace |
| Malformed URL recovery | replace |
| Cursor clamp (out-of-range) | replace |

Unknown slug → render `arch-not-found` in the main column without changing the route. `currentSectionSlug` is set to the unknown slug; tree-row highlight drops; breadcrumb collapses to a single "Not found" crumb. Malformed URL → `replaceState` to the nearest valid form. Empty glimpse stack on a `/glimpse/...` URL → `replaceState` to drop the suffix.

### 2.4 Components (Lit + `@lit-labs/signals`)
All under `web/components/`. Each extends `SignalWatcher(LitElement)`:
```ts
import { SignalWatcher } from '@lit-labs/signals';
```
Module-level `signal()` instances (not per-render).

Required components:
- `arch-app` — root. Renders masthead + view shell. On mount: `bootGraph()`.
- `arch-masthead` — brand + rev pill + breadcrumb (from `currentSection._links.ancestors`) + view toggle. Toggle buttons carry `aria-pressed`.
- `arch-tree` + `arch-tree-node` — recursive. Chevron toggles `treeOpenState` (persisted); row click navigates to `#/section/<slug>`.
  - ARIA: outer `<ul>` has `role="tree"`; each row has `role="treeitem"`; rows with children have `aria-expanded`; rows have `aria-level` and `aria-posinset` / `aria-setsize`. Single **roving tabindex** — active row `tabindex="0"`, others `-1`.
  - Keyboard: Arrow Up/Down moves focus to next/prev visible row; Right expands or focuses first child; Left collapses or focuses parent; Enter activates; Home/End jump to first/last visible row.
- `arch-tree-filter` — input + `⌘K` shortcut. **Client-side filter** over `graphCache`: case-insensitive substring match against `node.title` and `node.slug`; shows matches + their ancestor chain. Registers a document-level `keydown` listener for `(meta|ctrl)+k` that focuses the input and `preventDefault`s; removed on `disconnectedCallback`.
- `arch-section-view` — section-meta, title, deck, tags, properties, prose body (`unsafeHTML`), edges card, refs grid, foot-meta stub. Composes the next four.
- `arch-properties` — reads `currentSection._embedded.type.property_schema`. One renderer per `field.type` (`string`, `number`, `boolean`, `enum`, `ref`, `multi-ref`, `rich`, `multi-string`, `schema-driven`). **No per-type branching**; field-type-driven only. For `ref`/`multi-ref` fields, render the value as `<arch-ref to="slug">label</arch-ref>` — let `arch-ref` decide live vs broken via its `graphCache` check (single source of truth for the *known* set). When the slug also appears in `currentSection.unresolved_refs[]` (server told us it didn't resolve at save time), pass `broken="true"` as an explicit attribute so `arch-ref` renders `data-broken` even if a stale `graphCache` would otherwise have shown it live. No decorators in the component — declare reactive properties via the static `properties` block (per `/typescript`).
- `arch-edges` — edges card.
- `arch-refs-grid` — references-to / referenced-by. Each grid item renders as `<arch-ref to="slug">label</arch-ref>` so activation shares the inline-ref code path.
- `arch-ref` — inline `<arch-ref to="slug" role? broken?>`:
  - Host: `tabindex="0"`, `role="link"`. Click and `keydown` Enter/Space activate; Space calls `preventDefault` to suppress page scroll.
  - In `read` view: pushes target slug onto URL glimpse stack via the router.
  - In `print` view (when rendered inside the server's `/print` HTML): static superscript number; no JS, no click — the server emits `<sup>n</sup>` in place of the live element. The Lit component is not loaded in the iframe.
  - Broken-ref rule: if `broken` attribute is truthy OR target slug is not in `graphCache`, render as `<span data-broken="true" aria-label="reference target missing">` with muted style; no tabindex, no role, no click handler. `arch-properties` sets `broken` explicitly from `unresolved_refs[]` so server truth beats client cache.
  - Registration: `customElements.define('arch-ref', ...)` MUST run before any `unsafeHTML`-rendered template that may contain `<arch-ref>`. Lit's `html` template path upgrades custom elements via `innerHTML`, so registration order is the only requirement.
  - Trust boundary: section HTML is trusted (local-only, single-user). Do NOT add DOMPurify/sanitizer.
- `arch-glimpse` — side panel; visible when `glimpseCursor >= 0`. Back/forward/close mutate URL via router (push). Stack chips clickable to jump cursor (replace).
  - On open: focus the close button.
  - On close: focus returns to the originating `arch-ref` if still in DOM.
  - Under 1100px: fixed-position drawer with semi-transparent backdrop; click-outside closes; `body.style.overflow='hidden'` while open; focus-trap (basic: Tab cycles within the panel).
- `arch-toc` — TOC view from `graphCache`. Uses computed numbers.
- `arch-print` — view `print`. Renders `<iframe>` whose `src` comes from `printHref()` (NOT a hard-coded `/print`). Tracks the iframe's `load` event in a signal; while unloaded the print button is disabled and the ⌘P interception falls through. On `connectedCallback`, registers a document-level `keydown` listener for `(meta|ctrl)+p` that calls `iframe.contentWindow.print()` and `preventDefault`s ONLY when the iframe has loaded; removed on `disconnectedCallback`. The parent UI's `@media print` rule (in `web/styles.css`, see §2.1) hides interactive chrome and stretches the iframe; so even if the user prints from another view without the interception, output is blank-but-safe (no broken layout).
- `arch-print-bar` — child of `arch-print`. Contains the "Save as PDF" button with the `⌘P` keycap; button is `disabled` until the parent's iframe-loaded signal flips true. Click calls `iframe.contentWindow.print()`.
- `arch-not-found` — minimal stub for unknown slugs.
- `arch-error` — banner consumer of the `error` signal. The ONLY error renderer. Shows code, message, and `hint` as a clickable link if present.
- `arch-foot-meta` — Revisions and Comments sub-blocks; **empty stubs in MVP** with a "Coming soon" muted label. Do not query non-existent endpoints.

Type-color fallback: types beyond the 11 seeded ones render with the `infra` dot. Adding a new color requires editing `web/styles.css` `--type-<slug>` token. State this so it's not a surprise.

### 2.5 Wire-up (`web/main.ts`)
- Import all components (registers custom elements as side effects). **Must include `arch-ref` import** before anything that renders section HTML.
- Initialize router (which calls `bootGraph`).
- No other top-level code.

### 2.6 Verification (UI-side)
- `pnpm build:web` produces `web/dist/main.js`, `web/dist/index.html`, `web/dist/styles.css` without errors.
- With Phase 1 running, open `http://127.0.0.1:<port>/`. Sidebar renders the seeded tree, current section loads, clicking a ref opens glimpse with URL update, browser Back walks the stack, switching to TOC then Print works, the "Save as PDF" button or ⌘P from the print view triggers the iframe's print dialog, the print preview matches `/print` directly.
- Grep test: `grep -rE '"/(api|print)' web/ --exclude=hal-fetch.ts` returns nothing.
- Reload page — `treeOpenState` is restored from `localStorage`.

Report back: every file touched, any spec deviation, any place the mockup didn't carry over cleanly.

---

## Phase 3 — AI-facing skill (main thread, after Phase 1)

Expand `skill/SKILL.md` (stub from Phase 0) into the full AI-client contract. Plain Markdown with optional YAML frontmatter (`name: architecture-notebook`, `description: ...`). Cover **all 7 steps** from `design/api.md` §12 plus contract reminders. The audience is AI clients writing into the API.

Sections, each with at least one full worked example:

1. **Discover the API**: `GET /api` once. Cache the root document. Never construct URLs beyond `_links` expansion.
2. **Boot graph**: `GET /api/graph` once at start of session — derives every reachable slug.
3. **Boot types**: `GET /api/types` once — derives every `property_schema` you'll write against.
4. **Read with everything embedded**: `GET /api/sections/{slug}?embed=type,parent,refs,children` for the full render set in one round-trip.
5. **Multi-resource create**: `POST /api/batch` with `$opid.slug` / `$opid.id` back-references + envelope `Idempotency-Key`. Show a full worked example, including per-op `if_match` if any op mutates an existing resource.
6. **Section edit**: `PATCH` with `If-Match` + `Idempotency-Key`. On 412: refetch, three-way-merge (AI clients MAY auto-merge here; the UI never does), retry with the new ETag.
7. **Error recovery**: 422 carries `errors[].hint` — follow it. 422 `ref-unresolved` → either create the target or `GET /api/search?q=<value>`.

Plus a **Contract corners** subsection enumerating non-obvious surfaces the AI client will hit:

- The four `_actions` schema-discovery modes (inline / `schema_ref` URL / resource-field `$.x` / request-body URI-template) — with the mode-4 resolution algorithm from `design/api.md` §9.
- `_embedded` vs `_links` discipline: `_embedded` is a snapshot; if you intend to write, refetch via `_links` first to get a fresh ETag.
- The `<arch-ref>` authoring form per `design/api.md` §5.4.1 — lenient parser, `to` slug must be `^[a-z0-9-]+$`, only `to` and `role` attributes accepted, both attribute values must be quoted, lowercase attribute names only, no entity decoding.
- **`PATCH /api` exception**: notebook config (`/api`) has no `_etag` and skips `If-Match`.
- **`POST /api/refs`** stamps `source = 'manual'` server-side; clients cannot set `source`.
- **`DELETE /api/refs/{id}`** on a non-manual ref returns 422 `ref-derived`; to remove an html-sourced ref, edit the referencing section's `html` instead (the link scanner will diff it out).
- `unresolved_refs[]`: optional `ref`/`multi-ref` properties and unresolved HTML refs surface here without failing the save; required `ref`-typed properties fail with `ref-unresolved`.
- `?fields=` projects top-level resource shape; useful for stats/listings; does not change response status or `_links`.
- Lean section summary (inside `_embedded.items` of collections) is intentionally narrow — follow `_links.self` for the full resource.
- Per-op `if_match` in batch carries a literal ETag (no back-ref tokens); for chained mutations that need the new ETag, run them as separate batches or follow with a direct PATCH.
- **Batch atomic rollback signal**: on a successful envelope (200) the response may carry `rolled_back: true` at the top level when atomic mode rolled back due to an in-transaction failure. The failing op carries its real error; ops that never ran carry `424 dependency-aborted`; ops that succeeded pre-failure still appear with their would-have-succeeded body (read but discarded).
- **`424 dependency-aborted`**: in batch results when an upstream op failed (atomic or non-atomic). Recovery: locate the failed upstream op in `results[]`, fix the underlying error, resubmit the batch with a new `Idempotency-Key`.
- **Token type preservation in batch**: whole-leaf substitution only — `$opid.slug` substitutes a string, `$opid.id` substitutes an integer. Tokens embedded in larger strings (`"prefix-$s1.slug"`) are NOT substituted.
- **Embeddable relations** per resource (use in `?embed=`):
  - Sections: `type, parent, refs, children, ancestors`.
  - Types: `sections`.
  - Refs: `from, to`.
  Anything else in `embed` is silently ignored.
- **Inner batch op error bodies** use the same `application/problem+json` shape as direct-route errors. A `424 dependency-aborted` body is `{ type: '/errors/dependency-aborted', title, status: 424 }` with no `errors[]`. A `422 validation` body inside a batch op result is identical to the body you'd get from a direct PATCH/POST.
- `unresolved_refs[]` (in section responses) elements have shape `{ slug, source: 'html'|'property', field?, role? }` — see `design/api.md` §5.4.0.
- Slugs are stable identifiers; numbers are computed and never sent in writes.
- Error code list — link to `design/api.md` §8 by section header.

Lock-step rule: if anything in `design/api.md` changed during Phases 1–2, this skill changes in the same commit. Verification: diff `design/api.md` link/action/error tables against the skill's headings; they should match.

---

## Phase 4 — Seed + verify (main thread)

### 4.1 Seed
- `server/seed.ts` — uses **`POST /api/batch`** (not raw SQL, not chained POSTs).
- Two atomic batches:
  1. All section types (with their `property_schema`).
  2. The full Acme Trading System tree using `$opid.slug` back-references for parent links + cross-references in HTML and properties.
- After the type batch, repeat one create with the same `Idempotency-Key` and confirm the response is byte-for-byte identical (smoke-tests replay).
- `pnpm seed` runs it against a fresh DB.

### 4.2 Final acceptance pass

**End-user behavior (manual, in browser):**
1. Tree sidebar matches the mockup's tree.
2. Click `api.acme.com`. Section renders with properties, prose, edges, refs grid.
3. Click an inline `arch-ref`. Glimpse slides in. URL is `#/section/api-acme-com/glimpse/<slug>`.
4. Click a ref inside the glimpse. Stack chips show two. URL updates (push).
5. Browser Back walks the stack.
6. Close glimpse → URL drops the `/glimpse/...` suffix (push).
7. Switch to Contents → TOC view renders.
8. Switch to Print → iframe loads `<iframe src="$rootDoc._links.print.href">`.
9. Click "Save as PDF" in `arch-print-bar` (or ⌘P while in print view) → browser print dialog targets the iframe; preview shows cover + TOC + sections.
10. Reload page. `treeOpenState` is restored from `localStorage`.

**Contract acceptance (via `curl`/`fetch`):**
11. `GET /api` returns `_links.{self,types,sections,graph,search,batch,print}` AND `schema_version` matching the migration version.
12. `GET /api/sections/api-acme-com?embed=type,parent,refs,children` returns EVERY `_link` and `_action` listed in the §1.4 per-resource checklist; `_embedded.{type,parent,refs,children}` all populated; `ETag` header equals `_etag` in body.
13. `PATCH /api/sections/api-acme-com` without `If-Match` → 428 `precondition-required`.
14. `PATCH` with stale `If-Match` → 412 `etag-mismatch` with current `_etag`.
15. `POST /api/sections` twice with same `Idempotency-Key` and same body → identical body + 201 both times.
16. Same key + different body → 409 `idempotency-conflict`.
17. `POST /api/batch` with `$opid.slug` back-reference creating type + sections + refs in one atomic call → 200 envelope with `results[].status = 201` for each op.
18. `POST /api/batch` with a deliberately-failing op in atomic mode → 200 envelope with `rolled_back: true` at the top level; failing op carries its real error body; ops not yet attempted at the moment of failure (dependents AND independents that hadn't started) carry `dependency-aborted` (424); only ops that had committed work *before* the failing op started carry their would-have-succeeded body (the writes are still rolled back; the body is purely diagnostic).
19. `GET /api/search?q=order` → HAL with `_embedded.results[]`, each carrying `_links.self`.
20. `GET /api/refs/{id}` for an html-sourced ref → capture `ETag`. `DELETE /api/refs/{id}` with that `If-Match` → 422 `ref-derived` with `hint` pointing at `/api/sections/<from-slug>`.
21. `_actions.add-child` on a section has `schema_ref: "/api/types/{type}#/property_schema"`. Observe by POST:
    - `POST /api/sections` with `body.type = "ingress"` and a missing required `domain` → 422 `validation` with `errors[0].field = "properties.domain"` (proves ingress schema was resolved).
    - `POST /api/sections` with `body.type` missing → 422 `validation` with `errors[0].field = "type"`.
    - `POST /api/sections` with `body.type = "no-such-type"` → 422 `validation` with `errors[0].code = "ref-unresolved"` and `errors[0].hint = "/api/types"`.

**Test acceptance:**
22. `pnpm test` → all passing, ≥ 60 tests, including: each of the 4 schema-discovery modes exercised by an end-to-end test; the hypermedia-discipline script (`scripts/check-hypermedia.mjs`); tests for the new error codes (405, 406, `ref-derived`, `arch-ref-malformed`, `backref-unresolved`, `cycle-illegal` batch variant, `idempotency-misplaced`, `dependency-aborted`); a batch token-type test asserting `.slug` substitutes a string and `.id` substitutes an integer; an `/api` fresh-DB test asserting `notebook.title === 'Untitled Notebook'` and `revision === 0` without any seed.
23. `node scripts/check-hypermedia.mjs` exits 0.
24. Server bound address is `127.0.0.1` (verified by test).

### 4.3 Hand-off
End-of-turn summary (≤ 5 lines):
- What's running and where (URL).
- Number of tests passing.
- Anything punted (must be empty unless explicitly approved).
- Suggested next iteration (edit-in-UI, comment threads, AI write-back loop).

Do **not** commit. The user will review the diff first.

---

## Failure protocol

- A test won't pass after 3 attempts → STOP, surface the diagnosis, ask for direction.
- A spec ambiguity → STOP, ask the user.
- A discrepancy between `design/api.md` and what you're implementing → STOP. Run the `/fs-dev` "before any API change" 7-step checklist. Reconcile `design/api.md` AND `skill/SKILL.md` AND `design/mockup.html` (if visual) in the same commit before continuing.
- A request to add a dep not listed under hard constraints → refuse and find a built-in way; only escalate if genuinely impossible.
- A fan-out child reports the contract must change → stop the other child, return to design, restart the fan-out from the updated brief.

## Style

- No comments that restate the code.
- No README / ARCHITECTURE.md / changelog files unless asked.
- No fallback paths for code that hasn't shipped yet.
- No backwards-compat shims.
- One sentence per turn update during work; one short paragraph per side at the end.
- Trust but verify: when a fan-out child reports done, read its diff before believing it.
