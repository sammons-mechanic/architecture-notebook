import type { SectionSeed } from './tree.ts';

export const SELF_SECTION_SEEDS: ReadonlyArray<SectionSeed> = [
  { slug: 'overview', title: 'Architecture Notebook', type: 'overview', parent: null,
    deck: 'A locally-hosted, AI-driven documentation tool for system architectures.',
    tags: ['app', 'local-first'],
    html: '<p>The Architecture Notebook is a single-user local app for recording how systems work. It ships with three big surfaces: a <arch-ref to="backend">HAL+JSON backend</arch-ref> built on Node 24 + node:sqlite, a <arch-ref to="ui">Lit + signals UI</arch-ref>, and a <arch-ref to="ai-skill">skill</arch-ref> for AI clients that write into the API.</p><p>Authoring is API-driven: humans navigate, AI fills in. Cross-references are first-class — every section links via <arch-ref to="ref-system">arch-ref tags</arch-ref>, and the UI surfaces them as inline glimpses that can cycle without losing context.</p>' },

  { slug: 'backend', title: 'Backend', type: 'service', parent: null,
    deck: 'Three-layer Node 24 server, node:sqlite, single connection per notebook, no transpile.',
    tags: ['node24', 'esm', 'no-transpile'],
    properties: { file: 'server/', kind: 'orchestrator' },
    html: '<p>The backend runs as <code>node --experimental-strip-types server/index.ts</code>, with no build step. It uses only node:* built-ins plus the dependencies listed in <arch-ref to="dep-policy">the dep policy</arch-ref>.</p><p>Top-level: <arch-ref to="http-layer">HTTP layer</arch-ref> dispatches to either the <arch-ref to="catalog-routes">catalog router</arch-ref> or one of the per-<arch-ref to="notebook-manager">notebook routers</arch-ref>, with <arch-ref to="response-rewriter">response paths rewritten</arch-ref> so per-notebook URLs become <code>/n/&lt;slug&gt;/api/...</code>.</p>' },

  { slug: 'http-layer', title: 'HTTP Layer', type: 'service', parent: 'backend',
    deck: 'Pattern router + request pipeline + catalog/notebook dispatch.',
    properties: { file: 'server/http-handler.ts', kind: 'orchestrator' },
    html: '<p>The HTTP layer wraps <code>node:http</code> with a tiny <arch-ref to="router">pattern router</arch-ref>, reads request bodies up to a per-route cap (1 MiB default, 8 MiB for batch), enforces <arch-ref to="idempotency">Idempotency-Key</arch-ref> semantics, and runs the matched route handler.</p><p>It dispatches between the <arch-ref to="catalog-routes">catalog routes</arch-ref> and per-notebook routes via a URL-prefix check, then installs a <arch-ref to="response-rewriter">response-time href rewriter</arch-ref> for per-notebook requests.</p>' },

  { slug: 'router', title: 'Router', type: 'service', parent: 'http-layer',
    properties: { file: 'server/router.ts', kind: 'lib' },
    html: '<p>Compiles route patterns like <code>/api/sections/:slug</code> into anchored regexes. Resolves params into a plain object. Returns one of three kinds: <code>match</code>, <code>method-not-allowed</code> (with an Allow list), or <code>not-found</code>. Fully synchronous and stateless.</p>' },

  { slug: 'catalog-routes', title: 'Catalog Routes', type: 'service', parent: 'http-layer',
    deck: 'Top-level endpoints: /api, /api/health, /api/notebooks/*.',
    properties: { file: 'server/wire-catalog.ts', kind: 'route' },
    html: '<p>The catalog router lives outside any notebook. <code>GET /api</code> returns hypermedia links to <code>notebooks</code> and the templated <code>/n/{notebook}/api</code> entry. <code>POST /api/notebooks</code> creates a new notebook by calling <arch-ref to="notebook-manager">the manager</arch-ref> and seeding its metadata.</p>' },

  { slug: 'response-rewriter', title: 'Response Prefix Rewriter', type: 'service', parent: 'http-layer',
    deck: 'Surgical JSON path rewrite so serializers stay notebook-agnostic.',
    properties: { file: 'server/rewrite-prefix.ts', kind: 'lib' },
    html: '<p>Routes emit hrefs like <code>/api/sections/foo</code> verbatim. When a request comes in under <code>/n/&lt;slug&gt;</code>, the handler installs a wrapper around <code>res.end</code> that regex-replaces the values of <code>href</code>, <code>hint</code>, <code>instance</code>, and <code>schema_ref</code> keys (plus the <code>Location</code> header) to prepend the notebook prefix.</p><p>Why not thread a prefix through every serializer? The regex is one place, surgical, and only touches values immediately after the known key names — so user-authored HTML containing literal "/api/" text is left alone.</p>' },

  { slug: 'database', title: 'Database', type: 'service', parent: 'backend',
    deck: 'One SQLite file per notebook under data/notebooks/. Single sync connection, WAL.',
    tags: ['sqlite', 'wal'],
    properties: { file: 'server/db.ts', kind: 'adapter' },
    html: '<p>Each notebook is its own <code>data/notebooks/&lt;slug&gt;.db</code> file. Connections are synchronous (<arch-ref to="dep-policy">node:sqlite</arch-ref>) and shared per notebook. WAL mode is enabled so reads aren\'t blocked by writes during long batches.</p><p>The <arch-ref to="notebook-manager">notebook manager</arch-ref> holds an entry per notebook with its own connection, idempotency store, and router. <arch-ref to="migrations">Migrations</arch-ref> run on first open.</p>' },

  { slug: 'sqlite-schema', title: 'SQLite Schema', type: 'infra', parent: 'database',
    properties: { kind: 'protocol' },
    html: '<p>Five tables per notebook: <code>meta</code> (notebook title/version + schema_version), <code>section_types</code> (slug, property_schema_json, etag), <code>sections</code> (slug, type_id, parent_id, position, html, properties_json, tags_json, etag), <code>refs</code> (from_id, to_id, role, source, etag), and <code>idempotency_keys</code> (key, body_hash, status, response_headers_json, body, expires_at).</p><p>Section numbers (1.2.3) are computed, never stored. ETags are stored as opaque hex on every mutable row and rotated on every write.</p>' },

  { slug: 'migrations', title: 'Migrations', type: 'infra', parent: 'database',
    properties: { kind: 'pipeline' },
    html: '<p>Migration files live under <code>server/migrations/</code> with numeric prefixes (<code>001_init.sql</code>). On startup the runner probes <code>sqlite_master</code> for <code>meta</code>; if absent, version is 0. It applies every file whose prefix is higher than the stored version, each in its own transaction. Failures roll back only that migration. Shipped migrations are never edited.</p>' },

  { slug: 'notebook-manager', title: 'Notebook Manager', type: 'service', parent: 'database',
    deck: 'Owns per-notebook DBs, routers, and idempotency stores.',
    properties: { file: 'server/notebook-manager.ts', kind: 'orchestrator' },
    html: '<p>At startup, the manager scans <code>data/notebooks/*.db</code> and opens each one (running <arch-ref to="migrations">migrations</arch-ref>, creating an <arch-ref to="idempotency">idempotency store</arch-ref>, and registering all <arch-ref to="catalog-routes">per-notebook routes</arch-ref> against a fresh <arch-ref to="router">router</arch-ref>).</p><p><code>create(slug, title)</code> validates the slug, refuses duplicates, opens a new DB, runs migrations, sets the title in <code>meta</code>, and registers the notebook in-memory. <code>remove(slug)</code> closes the connection and unlinks the file.</p>' },

  { slug: 'validation', title: 'Validation', type: 'service', parent: 'backend',
    deck: 'Pure functions in lib/ with closure resolvers; never touch the DB directly.',
    properties: { file: 'server/lib/', kind: 'lib' },
    html: '<p>Validators take a narrow <code>ValidateDeps</code> bag with three closure resolvers: <code>resolve_section_slug</code> (existence check), <code>resolve_section_type_slug</code> (type lookup for refType constraints), and <code>resolve_type_schema</code> (for <arch-ref to="schema-discovery">Mode 2 and 4 schema discovery</arch-ref>). The resolvers are built per request from <code>Deps.db</code>; the pure lib never sees a SQLite handle.</p>' },

  { slug: 'schema-discovery', title: 'Schema Discovery — 4 Modes', type: 'service', parent: 'validation',
    deck: 'Inline, static schema_ref, sibling $.x, request-body URI template.',
    properties: { file: 'server/lib/validate-schemas.ts', kind: 'lib' },
    html: '<p>Every <code>_action</code> declares its body shape via one of four discovery modes: (1) inline <code>schema:</code> for fixed actions like move; (2) static <code>schema_ref</code> pointing at another resource\'s schema fragment; (3) sibling interpolation <code>$.x</code> against the enclosing resource; (4) request-body URI-template <code>{type}</code> that the server expands against the submitted body before fetching.</p><p>Mode 4 is the powerful one — it lets <code>POST /api/sections</code> reuse the section type\'s property schema based on the <code>type</code> field the client just provided. Missing template variables surface as <code>422 validation</code> against that exact field name.</p>' },

  { slug: 'slug-numbering', title: 'Slug & Numbering', type: 'service', parent: 'validation',
    properties: { file: 'server/lib/{slug,numbering}.ts', kind: 'lib' },
    html: '<p>Slugs match <code>^[a-z0-9-]+$</code>. Collisions auto-suffix (<code>-2</code>, <code>-3</code>, …). Section numbers (1.2.3) are computed on read from a tree snapshot, siblings ordered by <code>(position ASC, id ASC)</code>. Move operations walk ancestors to detect cycles, returning <code>422 cycle-illegal</code>.</p>' },

  { slug: 'link-scanner', title: 'Link Scanner', type: 'service', parent: 'validation',
    deck: 'Lenient arch-ref parser; HTML and properties both feed the refs table.',
    properties: { file: 'server/lib/links.ts', kind: 'lib' },
    html: '<p>On every section save the scanner walks the <code>html</code> field looking for <code>&lt;arch-ref to="slug" role="..."&gt;</code> tags and the section\'s <code>properties</code> looking for ref-typed fields. Unresolved targets don\'t fail the save — they surface in <code>unresolved_refs[]</code>, which the UI uses to render broken-ref styles.</p><p>The parser tolerates either attribute order, either quote style, and both self-closing or paired forms. Malformed tags (extra attributes, invalid slug) raise <code>422 arch-ref-malformed</code>.</p>' },

  { slug: 'idempotency', title: 'Idempotency', type: 'service', parent: 'backend',
    deck: 'sha256-of-body keyed by Idempotency-Key, 24h TTL, persisted in SQLite.',
    properties: { file: 'server/idempotency.ts', kind: 'adapter' },
    html: '<p>Every mutating request that carries <code>Idempotency-Key</code> hashes its canonical-JSON body and stores <code>(key, body_hash, status, headers_json, body)</code> in the <code>idempotency_keys</code> table. Replay with the same body returns the cached response byte-for-byte. Replay with a different body returns 409 <code>idempotency-conflict</code>.</p><p>The cache is warmed in-memory on startup and swept lazily. For the <arch-ref to="batch-engine">batch route</arch-ref> the envelope owns the key — per-op keys are rejected with <code>idempotency-misplaced</code>.</p>' },

  { slug: 'hal-json', title: 'HAL+JSON', type: 'service', parent: 'backend',
    deck: '_links, _actions, _embedded with ETag and accept negotiation.',
    properties: { file: 'server/hal.ts', kind: 'lib' },
    html: '<p>Responses default to <code>application/hal+json</code>. Q-value-aware accept negotiation falls back to plain <code>application/json</code> (strips <code>_links</code> / <code>_actions</code>) only when the client explicitly prefers it.</p><p>ETags are weak (<code>W/"&lt;hex&gt;"</code>) and rotated to <code>crypto.randomBytes(8).toString("hex")</code> on every write. <code>check_if_match</code> returns a <arch-ref to="discriminated-unions">kind-tagged union</arch-ref> — <code>ok</code> | <code>missing</code> | <code>mismatch</code> — that the route layer maps to 428 / 412 / continue.</p>' },

  { slug: 'problem-json', title: 'Problem+JSON', type: 'service', parent: 'backend',
    deck: 'RFC 7807 with hint URLs that point at the path that helps you recover.',
    properties: { file: 'server/problem.ts', kind: 'lib' },
    html: '<p>Errors emit <code>application/problem+json</code> with <code>type: "/errors/&lt;code&gt;"</code>, <code>title</code>, <code>status</code>, <code>detail</code>, <code>instance</code>, optional <code>errors[]</code> for field-level issues, and an optional top-level <code>hint</code> URL the client can follow to recover.</p><p>For example, a missing required ref returns <code>errors[0].hint = "/api/search?q=&lt;value&gt;"</code>. A delete on an html-sourced ref returns <code>hint = "/api/sections/&lt;from&gt;"</code> with the message "Edit the referencing section to remove this reference."</p>' },

  { slug: 'batch-engine', title: 'Batch Engine', type: 'service', parent: 'backend',
    deck: 'Atomic & non-atomic POST /api/batch with $opid back-references.',
    properties: { file: 'server/routes/batch.ts', kind: 'route' },
    html: '<p>Clients can submit up to 8 MiB of ops in one envelope. The engine performs <arch-ref to="dep-analysis">dependency analysis</arch-ref> first (catching unknown opids and cycles before any transaction opens), then runs ops in topological order, performing <arch-ref to="token-substitution">token substitution</arch-ref> at the moment each op runs.</p><p>Atomic-mode in-transaction failures roll back everything and mark not-yet-attempted ops as <code>424 dependency-aborted</code>. Non-atomic mode continues past failures for independent ops; transitive dependents of a failing op still get 424.</p>' },

  { slug: 'dep-analysis', title: 'Dependency Analysis', type: 'service', parent: 'batch-engine',
    properties: { file: 'server/lib/batch-deps.ts', kind: 'lib' },
    html: '<p>Walks each op\'s body recursively, treating any leaf string matching <code>^\\$([a-z0-9_-]+)\\.(slug|id)$</code> as an edge to opid <code>$1</code>. Unknown opids are marked as pre-execution failures; the rest go through Kahn\'s algorithm for topological order. Any cycle returns envelope <code>422 cycle-illegal</code> with the cycle members listed.</p>' },

  { slug: 'token-substitution', title: 'Token Substitution', type: 'service', parent: 'batch-engine',
    properties: { file: 'server/lib/batch-tokens.ts', kind: 'lib' },
    html: '<p>Whole-leaf substitution only: <code>$opid.slug</code> → the producer\'s slug as a string; <code>$opid.id</code> → the integer id. Tokens embedded in larger strings (<code>"prefix-$s1.slug"</code>) are not substituted — they pass through literally. Mis-typed producers (<code>$refs.slug</code> where the producer was a ref) raise <code>backref-unresolved</code> 422 inside that op\'s result.</p>' },

  { slug: 'ui', title: 'UI', type: 'ui', parent: null,
    deck: 'Lit + @lit-labs/signals. One esbuild bundle, no framework deps.',
    tags: ['lit', 'signals', 'esbuild'],
    properties: { file: 'web/', kind: 'component' },
    html: '<p>The UI is one esbuild bundle (~60 kB) of Lit components extending <code>SignalWatcher(LitElement)</code> from <arch-ref to="dep-policy">@lit-labs/signals</arch-ref>. There are no decorators — reactive properties are declared via the static <code>properties</code> block and elements are registered with <code>customElements.define()</code>.</p><p>Surfaces: a <arch-ref to="notebook-catalog">catalog landing</arch-ref>, the in-notebook read view (tree + section + <arch-ref to="glimpse-stack">glimpse</arch-ref>), a TOC, and a <arch-ref to="print-iframe">print iframe</arch-ref> view. Visual language is governed by <arch-ref to="design-tokens">a small token set</arch-ref>.</p>' },

  { slug: 'design-tokens', title: 'Design Tokens', type: 'ui', parent: 'ui',
    deck: 'One sans family, one accent, warm-neutral surfaces. No second accent.',
    tags: ['tokens', 'aesthetic'],
    properties: { file: 'web/styles.css', kind: 'lib' },
    html: '<p>The visual system is a deliberately small CSS variable set in <code>:root</code>. Body is Geist sans, code is Geist Mono, single cobalt accent (<code>#1d4ed8</code>) used only for refs, current sidebar rows, active toggles, and primary CTAs. Surfaces are stone-warm neutrals — no pure black or white, no blue-grays.</p><p>Each section type gets a single colored dot from a fixed palette (<code>--type-overview</code>, <code>--type-service</code>, etc.). Type colors appear only as tree-row dots, type pills, and edge target lines — never as decoration. Discipline matters: a second accent or a swapped sans would dilute the aesthetic instantly.</p>' },

  { slug: 'hash-router', title: 'Hash Router', type: 'ui', parent: 'ui',
    properties: { file: 'web/router.ts', kind: 'router' },
    html: '<p>Routes are parsed from <code>location.hash</code>: <code>#/</code> for the landing, <code>#/n/&lt;slug&gt;</code> for a notebook home, <code>#/n/&lt;slug&gt;/section/&lt;section-slug&gt;/glimpse/&lt;s1&gt;/&lt;s2&gt;?c=&lt;i&gt;</code> for in-notebook navigation, <code>#/n/&lt;slug&gt;/toc</code>, and <code>#/n/&lt;slug&gt;/print</code>.</p><p>The <arch-ref to="glimpse-stack">glimpse stack</arch-ref> lives entirely in the URL — there is no in-memory glimpse history. Browser Back walks it for free.</p>' },

  { slug: 'hypermedia-discipline', title: 'Hypermedia Discipline', type: 'ui', parent: 'ui',
    deck: 'Only web/lib/hal-fetch.ts may contain literal /api or /print strings.',
    properties: { file: 'web/lib/hal-fetch.ts', kind: 'lib' },
    html: '<p>The UI never constructs API URLs. <code>hal_fetch</code> takes a HAL link object <code>{ href, templated? }</code> from the cached <code>rootDoc</code>, expands RFC 6570 templates against a variables map, and fetches.</p><p>Enforcement: <code>scripts/check-hypermedia.mjs</code> reads every <code>*.ts</code> and <code>*.html</code> under <code>web/</code> (excluding <code>hal-fetch.ts</code> and the build output), strips comments, and asserts no source contains <code>/api/</code> or <code>/print</code>. Wired into <code>pnpm test</code>.</p>' },

  { slug: 'notebook-catalog', title: 'Notebook Catalog', type: 'ui', parent: 'ui',
    deck: 'Landing screen with notebook cards + New Notebook modal.',
    properties: { file: 'web/components/arch-landing.ts', kind: 'component' },
    html: '<p>The landing fetches <arch-ref to="catalog-routes">/api/notebooks</arch-ref> and renders one card per notebook (title, version, section count, last-updated). A dashed "New Notebook" tile opens a modal that POSTs to <code>/api/notebooks</code> using <code>catalogRoot._links.notebooks</code>, then navigates to <code>#/n/&lt;new-slug&gt;</code>.</p>' },

  { slug: 'glimpse-stack', title: 'Glimpse Stack', type: 'ui', parent: 'ui',
    deck: 'Inline reference viewer with URL-backed history; cycles allowed.',
    properties: { file: 'web/components/arch-glimpse.ts', kind: 'component' },
    html: '<p>Clicking a <arch-ref to="ref-system">arch-ref</arch-ref> pushes its target onto the URL\'s glimpse segment and opens the side panel. The cursor (URL param <code>c</code>) tracks which entry is showing; in-glimpse back/forward buttons walk it. Clicking a stack chip jumps with <code>replaceState</code>.</p><p>Cycles are allowed — refs that point back to the current section are treated as legitimate edges, not errors. Below 1100px the panel becomes a fixed drawer with click-outside-to-close and a focus trap.</p>' },

  { slug: 'print-iframe', title: 'Print Iframe', type: 'ui', parent: 'ui',
    deck: 'iframe of a self-contained /print HTML; browser Save-as-PDF.',
    properties: { file: 'web/components/arch-print.ts', kind: 'component' },
    html: '<p>The print view embeds an <code>&lt;iframe&gt;</code> whose src is <code>rootDoc._links.print.href</code>. The server\'s <code>/print</code> handler returns a self-contained HTML document with inlined CSS and zero external requests (Geist falls back to the system stack).</p><p>⌘P intercepts when the iframe has loaded, calling <code>iframe.contentWindow.print()</code>. The parent UI hides its chrome via <code>@media print</code> so even printing from another view produces a clean result.</p>' },

  { slug: 'ref-system', title: 'The arch-ref Element', type: 'infra', parent: null,
    deck: 'Inline cross-references with broken-ref fallback driven by server truth.',
    tags: ['authoring'],
    properties: { kind: 'protocol' },
    html: '<p>Authors write <code>&lt;arch-ref to="slug" role="uses"&gt;label&lt;/arch-ref&gt;</code> inside section HTML. The <arch-ref to="link-scanner">link scanner</arch-ref> diffs these against the <code>refs</code> table on every save; the UI renders them as <arch-ref to="hypermedia-discipline">hypermedia-driven</arch-ref> cobalt links.</p><p>If a target is missing, the server emits the section\'s <code>unresolved_refs[]</code> and the UI renders strike-through muted text — server truth always wins over the client\'s graph cache.</p>' },

  { slug: 'dep-policy', title: 'Dependency Policy', type: 'infra', parent: null,
    deck: 'Near-zero deps. Node 24+ stripping. node:* built-ins everywhere else.',
    properties: { kind: 'convention' },
    html: '<p>Allowed dependencies: <code>lit</code>, <code>@lit-labs/signals</code>, <code>esbuild</code>, <code>@types/node</code>. Everything else is a <code>node:*</code> built-in: <code>node:sqlite</code>, <code>node:http</code>, <code>node:test</code>, <code>node:crypto</code>, <code>node:fs/promises</code>.</p><p>No transpile for server code — Node 24 runs TypeScript directly with <code>--experimental-strip-types</code>. esbuild only bundles the browser-side <arch-ref to="ui">UI</arch-ref>.</p>' },

  { slug: 'code-style', title: 'Code Style', type: 'infra', parent: null,
    deck: 'snake_case vars/functions, PascalCase types, ≤100-line files, T | Failure.',
    tags: ['style'],
    properties: { kind: 'convention' },
    html: '<p>Variables and functions are <code>snake_case</code>; types are <code>PascalCase</code>; files are <code>kebab-case</code>. Full words always: <code>result</code>, not <code>r</code>; <code>error</code>, not <code>e</code>.</p><p>Files cap at 100 lines absolute (Lit <code>html`…`</code> template bodies are exempt — split sub-templates into pure render helpers in sibling files instead of fighting the cap). Failures are returned as <arch-ref to="discriminated-unions">discriminated <code>T | Failure</code></arch-ref> rather than boxed Result types or thrown exceptions; <code>throw</code> is reserved for programmer errors.</p>' },

  { slug: 'discriminated-unions', title: 'Discriminated Unions', type: 'infra', parent: 'code-style',
    properties: { kind: 'convention' },
    html: '<p>Internal TypeScript unions discriminate on <code>kind</code>. Not <code>type</code>, not <code>_t</code>. The wire-protocol API uses its own domain discriminators (<code>role</code> on refs, <code>type</code> on sections, <code>code</code> on field errors); they should not be confused.</p><p>Example: <code>check_if_match</code> returns <code>{ kind: "ok" } | { kind: "missing" } | { kind: "mismatch", current_etag: string }</code>.</p>' },

  { slug: 'testing', title: 'Testing', type: 'service', parent: null,
    deck: 'node:test + :memory: SQLite + real HTTP. 113 tests, no mocks.',
    tags: ['node:test', 'sqlite'],
    properties: { file: 'test/', kind: 'lib' },
    html: '<p>Tests use <code>node:test</code> with <code>node:assert/strict</code>. The <code>make_test_server()</code> helper spins up a real HTTP server backed by an in-memory SQLite manager and auto-creates a <code>test</code> notebook so per-notebook calls go to <code>/n/test/api/...</code>.</p><p>No mocks of SQLite or fetch — the goal is to catch contract drift at the seam where serializers, validators, and the database meet. The <arch-ref to="hypermedia-check">hypermedia discipline check</arch-ref> runs as part of the suite.</p>' },

  { slug: 'hypermedia-check', title: 'Hypermedia Check', type: 'service', parent: 'testing',
    properties: { file: 'scripts/check-hypermedia.mjs', kind: 'lib' },
    html: '<p>A small Node script that fails the build if any UI source file (outside <arch-ref to="hypermedia-discipline">hal-fetch.ts</arch-ref>) contains a literal <code>/api/</code> or <code>/print</code> string. Excludes the bundled <code>web/dist/</code> output since the bundler inlines the constant intentionally.</p>' },

  { slug: 'seed-flow', title: 'Seed Flow', type: 'service', parent: null,
    deck: 'pnpm seed creates a notebook and submits two atomic batches.',
    properties: { file: 'server/seed.ts', kind: 'orchestrator' },
    html: '<p>The seed script demonstrates the canonical AI-client flow: <code>POST /api/notebooks</code> to create the notebook, then two atomic <code>/n/&lt;slug&gt;/api/batch</code> calls — types first, then sections with <code>$opid.slug</code> back-references for parent links and cross-references.</p><p>After the first batch the script re-POSTs with the same <code>Idempotency-Key</code> and asserts the response is byte-identical — a smoke test for the <arch-ref to="idempotency">idempotency cache</arch-ref>.</p>' },

  { slug: 'ai-skill', title: 'AI-Facing Skill', type: 'infra', parent: null,
    deck: 'skill/SKILL.md teaches AI clients how to write into the API.',
    properties: { kind: 'protocol' },
    html: '<p><code>skill/SKILL.md</code> is the AI-author skill — a Markdown file teaching Claude (or any AI client) how to discover the API, boot the graph and types, read with embedded relations, batch-create with back-references, edit with If-Match + Idempotency-Key, and recover from errors using the <code>hint</code> URL.</p><p>It also documents non-obvious contract corners: the four <arch-ref to="schema-discovery">schema-discovery modes</arch-ref>, the <arch-ref to="ref-system">arch-ref parser</arch-ref> rules, <code>ref-derived</code> deletes, <code>424 dependency-aborted</code> recovery, and the <code>PATCH /api</code> If-Match exemption.</p><p>The same file is itself discoverable over HTTP: every root carries <code>_links.service-doc</code> → <code>GET /skill</code> (plus a <code>Link: rel="service-doc"</code> header), so an HTTP client re-fetches the contract the same way the <arch-ref to="batch-api-tool">batch_api MCP tool</arch-ref> ships it as the tool description. One source of truth, two surfaces.</p>' },

  // ──────────────────────────────────────────────────────────────────────
  // Surface-area additions: command palette + dark mode under UI; full-text
  // search + continuous-PDF print + MCP under the backend chapter.
  // ──────────────────────────────────────────────────────────────────────

  { slug: 'command-palette', title: 'Command Palette', type: 'ui', parent: 'ui',
    deck: '⌘F intercepts the browser find; modal over <arch-ref to="full-text-search">full-content search</arch-ref>.',
    properties: { file: 'web/components/arch-command-palette.ts', kind: 'component' },
    html: '<p>A Lit component mounted at the app shell that intercepts ⌘F (or Ctrl+F) at the document level and toggles a centered modal. The modal hosts an input with debounced live results, arrow-key navigation, Enter to jump, Esc to close.</p><p>Results come from <arch-ref to="full-text-search">/api/search</arch-ref> with snippet rendering — the server returns HTML-escaped context with a <code>&lt;mark&gt;</code> wrapper around the hit; the component renders via <code>unsafeHTML</code>. Result rows show the section number, title, type pill, snippet, and a "in &lt;field&gt;" tag so the user can see which field matched.</p>' },

  { slug: 'dark-mode', title: 'Dark Mode', type: 'ui', parent: 'design-tokens',
    deck: 'System-detected via prefers-color-scheme; pure CSS token override, no JS.',
    properties: { file: 'web/styles.css', kind: 'lib' },
    html: '<p>An <code>@media (prefers-color-scheme: dark)</code> block overrides every token in <code>:root</code> with a warm stone-dark palette (<code>--bg #1c1917</code>, <code>--bg-pane #232020</code>, <code>--text #f5f5f4</code>). Lifted cobalt accent (<code>#60a5fa</code>) for legibility; lifted type dots so per-section indicators stay visible.</p><p>Promoted three hardcoded literals to tokens so they flip cleanly: <code>--danger</code>/<code>--danger-bg</code>/<code>--danger-edge</code>, <code>--scrim</code>/<code>--scrim-strong</code>, <code>--shadow-card</code>/<code>--shadow-pop</code>. Wireframe embeds in section bodies pick up dark tokens automatically because they author against <code>var(--…)</code>. <arch-ref to="print-continuous">Print stays light intentionally</arch-ref>.</p>' },

  { slug: 'full-text-search', title: 'Full-Content Search', type: 'service', parent: 'backend',
    deck: 'Matches title + slug + deck + body HTML + properties + tags. Marked snippets.',
    properties: { file: 'server/routes/search.ts', kind: 'route' },
    html: '<p>GET <code>/api/search?q=…&types=…&limit=…</code>. Substring match, case-insensitive, LIKE wildcards escaped server-side. Body HTML has tags stripped for both matching and snippet generation; property JSON values are flattened and concatenated before matching.</p><p>Results are re-ranked in-memory: title-prefix &gt; slug-prefix &gt; title-contains &gt; slug-contains &gt; deck &gt; body &gt; properties/tags, tie-broken by <code>updated_at</code> desc. Each result carries <code>snippet</code> (~140 chars of context with <code>&lt;mark&gt;</code> around the hit, HTML-escaped elsewhere) and <code>snippet_field</code> naming which field matched. The <arch-ref to="command-palette">command palette</arch-ref> is the primary consumer.</p>' },

  { slug: 'print-continuous', title: 'Continuous-PDF Print', type: 'service', parent: 'backend',
    deck: 'One tall PDF page sized to content. TOC anchors stay clickable.',
    properties: { file: 'server/print-html.ts', kind: 'route' },
    html: '<p>GET <code>/n/&lt;notebook&gt;/print</code> emits one continuous-flow document instead of paginated letter sheets. A runtime <code>beforeprint</code> hook measures the rendered document height and writes an <code>@page { size: 8.5in &lt;h&gt;in }</code> rule before <code>window.print()</code>, so headless Chrome exports a single tall page sized to the content (capped at Chrome\'s 200in limit).</p><p>TOC entries are <code>&lt;a href="#section-{slug}"&gt;</code> with depth-based indent; the matching <code>id="section-{slug}"</code> sits on each rendered section. Chrome\'s "Save as PDF" preserves them as PDF named-destination links.</p><p>The print stylesheet inlines the design tokens from <arch-ref to="design-tokens">web/styles.css</arch-ref> so inline-styled wireframe embeds (which reference <code>var(--accent)</code>, <code>var(--bg-pane)</code>, <code>var(--type-*)</code>) render faithfully. A universal <code>* { box-sizing: border-box; margin: 0; padding: 0 }</code> reset matches the web shell so fixed-width grid layouts in the embeds hold their column contracts.</p>' },

  { slug: 'mcp-transport', title: 'MCP SSE Transport', type: 'integration', parent: 'backend',
    deck: 'Hand-rolled MCP server: GET /mcp/sse + POST /mcp/message JSON-RPC.',
    properties: { file: 'server/routes/mcp.ts', kind: 'transport' },
    html: '<p>JSON-RPC 2.0 over MCP\'s SSE transport, no SDK. <code>GET /mcp/sse</code> opens an event stream and immediately emits <code>event: endpoint</code> with the per-session POST URL plus 25s keep-alive comments. <code>POST /mcp/message?sessionId=…</code> is the JSON-RPC inbox: returns <code>202</code> immediately, pushes the response back through the SSE stream as <code>event: message</code>.</p><p>Implements <code>initialize</code>, <code>notifications/initialized</code>, <code>tools/list</code>, <code>tools/call</code>, <code>ping</code>. <arch-ref to="http-layer">handle_request</arch-ref> short-circuits <code>/mcp/sse</code> and <code>/mcp/message</code> ahead of HAL Accept negotiation and the body-rewriting wrapper, which would otherwise 406 on <code>text/event-stream</code> and buffer streaming responses into oblivion.</p><p>Exposes <arch-ref to="batch-api-tool">one tool: batch_api</arch-ref>.</p>' },

  { slug: 'batch-api-tool', title: 'batch_api MCP Tool', type: 'integration', parent: 'mcp-transport',
    deck: 'Single tool wrapping POST /api/batch; description = the full SKILL.md.',
    properties: { file: 'server/routes/mcp.ts', kind: 'protocol' },
    html: '<p>The MCP tool description is the entire <arch-ref to="ai-skill">skill/SKILL.md</arch-ref> read once at boot — so any MCP client (Claude Desktop, inspector, etc.) gets the full authoring contract at tool-discovery time, no out-of-band docs required.</p><p>Input schema: <code>{ notebook, atomic?, idempotency_key?, author?, ops }</code>. Execution loopback-fetches <code>/n/&lt;notebook&gt;/api/batch</code> using the bound listening port, so every byte of the existing <arch-ref to="batch-engine">batch contract</arch-ref> — validation, idempotency cache, ETag handling, atomic rollback — applies unchanged.</p>' },

  // ──────────────────────────────────────────────────────────────────────
  // New chapter: containerization + container deployment + CI; plus integration
  // tests as a child of the existing testing chapter.
  // ──────────────────────────────────────────────────────────────────────

  { slug: 'integration-tests', title: 'Integration Test Suite', type: 'service', parent: 'testing',
    deck: 'Zero-dep container-driven suite. _container.ts builds + runs; _sse.ts reads MCP.',
    properties: { file: 'test/integration/', kind: 'lib' },
    html: '<p>Three modules: <code>_container.ts</code> shells out to <code>docker</code> to build the image, run a container with a randomly-published host port, poll <code>/api/health</code> until ready, and capture <code>docker logs</code> on timeout; <code>_sse.ts</code> is a small streaming SSE client (<code>wait_for(predicate, timeout_ms)</code>); <code>container.test.ts</code> hosts 9 tests across three <code>describe</code> groups (catalog, per-notebook API, MCP SSE).</p><p>Skips cleanly when Docker is absent. Reuses the unit test\'s zero-dep philosophy: only node-test + node:child_process + global fetch.</p>' },

  { slug: 'containerization', title: 'Containerization', type: 'infra', parent: null,
    deck: 'Two-stage Dockerfile on node:24-slim; no runtime npm install.',
    tags: ['docker'],
    properties: { kind: 'pipeline' },
    html: '<p>Stage 1 (<em>web-builder</em>) runs <code>pnpm install --frozen-lockfile</code> + <code>pnpm build:web</code>. Stage 2 (<em>runtime</em>) copies only <code>server/</code>, <code>skill/</code>, <code>design/</code>, <code>web/dist/</code>, and <code>package.json</code>. No runtime npm install — the server uses only <code>node:*</code> built-ins, and the browser deps are already bundled into <code>web/dist/main.js</code>.</p><p>Defaults: <code>HOST=0.0.0.0</code>, <code>PORT=8787</code>, <code>DATA_DIR=/data</code>, volume on <code>/data</code>. Inline healthcheck via <code>fetch(\'/api/health\')</code>. The header comment warns about the no-auth trust model — only expose behind a network gate or an auth proxy.</p><p>The <arch-ref to="compose-deployment">compose deployment</arch-ref> builds from this Dockerfile via docker-compose.</p>' },

  { slug: 'compose-deployment', title: 'Compose Deployment', type: 'infra', parent: 'containerization',
    deck: 'docker-compose with a tailscale sidecar fronting the app on notebook.your-tailnet.ts.net.',
    properties: { file: '~/architecture-notebook/docker-compose.yml', kind: 'pipeline' },
    html: '<p>On the host, <code>~/architecture-notebook/</code> is a git checkout. The compose file declares two services:</p><ul><li><strong>notebook-ts</strong>: tailscale sidecar (image <code>tailscale/tailscale:latest</code>). Owns the network namespace, advertises hostname <code>notebook</code> in the tailnet, serves TLS at <code>https://notebook.your-tailnet.ts.net</code> via a static <code>serve.json</code>, proxies 443 → <code>127.0.0.1:8787</code>.</li><li><strong>notebook</strong>: the app, built from the repo\'s <arch-ref to="containerization">Dockerfile</arch-ref>. <code>network_mode: service:notebook-ts</code> so it listens on the sidecar\'s loopback. Bind-mounts <code>$PWD/data</code> → <code>/data</code> so per-notebook SQLite files survive container recreates.</li></ul><p>Deploy = <code>git pull --ff-only origin main → docker compose build notebook → docker compose up -d notebook</code>. Sidecar restart is normally unnecessary.</p>' },

  { slug: 'ci-pipeline', title: 'CI Pipeline', type: 'infra', parent: 'containerization',
    deck: 'Gitea Actions runs pnpm test + integration tests on a self-hosted runner.',
    properties: { file: '.gitea/workflows/ci.yml', kind: 'pipeline' },
    html: '<p>Two jobs on push-to-main and on every PR: <em>Unit tests + web bundle</em> runs <code>pnpm install --frozen-lockfile</code> → <code>pnpm build:web</code> → <code>pnpm test</code>; <em>Integration tests (Docker container)</em> verifies <code>docker version</code> then runs <code>pnpm test:integration</code> which builds the production image and exercises the full surface (catalog, per-notebook API, MCP, search, print) against the live container.</p><p>Runner is a self-hosted Gitea Actions runner. Image cache survives between runs; first build is ~30s, incremental ~3s.</p>' },
];
