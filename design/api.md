# Architecture Notebook — API Design

A hypermedia REST API designed for AI clients to discover and drive the architecture without hard-coded knowledge of URLs, schemas, or workflows. Media type: **HAL+JSON** with a custom `_actions` extension (HAL-FORMS-style) for write operations.

A client that knows only `/api` can do everything.

---

## 1. Principles

1. **Discovery over convention.** Every response embeds the links and actions that are currently legal. Clients follow links; they do not construct URLs.
2. **Schemas travel with the resource.** Section types carry `property_schema` inline. Write actions point to the schema that applies to their input.
3. **State is the response.** ETags, concurrency, and embedded sub-resources are part of the body. A single GET can return everything the UI or AI needs to render the page and its glimpse panel.
4. **Optimistic concurrency.** Mutable resources that expose `_etag` require `If-Match` on PATCH/DELETE/POST-modifying actions. 412 on conflict, 428 when missing. The notebook config at `PATCH /api` is the documented exception — it's a single-row single-writer resource with no `_etag` (see §3).
5. **Idempotent writes.** Mutations accept `Idempotency-Key`. Same key + same body → cached response for 24h. Same key + different body → 409.
6. **Batches are first-class.** AI often writes a dozen sections + edges at once. `POST /api/batch` runs them in a single SQLite transaction with shared identity (correlation ids).
7. **Errors follow RFC 7807** (`application/problem+json`).
8. **No surprises.** All collection endpoints use the same shape. All single-resource endpoints use the same shape. All write actions look the same regardless of resource.
9. **Self-documenting.** The authoring guide (`skill/SKILL.md`) is itself a discoverable resource. Every root carries `_links.service-doc` → `GET /skill`, and a `Link: </skill>; rel="service-doc"` header advertises it to clients that don't parse the body. An agent that knows only `/api` can fetch the full contract; one that lost it can re-fetch.

---

## 2. The schematic

```
                                  GET /api  ⇐ start here
                                    │
        ┌───────────┬───────────────┼─────────────────┬───────────────┐
        ▼           ▼               ▼                 ▼               ▼
    types/      sections/        graph              search          batch
        │           │
        │           ├── /{slug}
        │           │      │
        │           │      ├── _links.type      → /api/types/{type}
        │           │      ├── _links.parent    → /api/sections/{p}
        │           │      ├── _links.children  → /api/sections/{slug}/children
        │           │      ├── _links.refs      → /api/sections/{slug}/refs
        │           │      ├── _links.ancestors → /api/sections/{slug}/ancestors
        │           │      ├── _actions.update  (PATCH self, If-Match)
        │           │      ├── _actions.move    (POST self/move)
        │           │      ├── _actions.delete  (DELETE self)
        │           │      ├── _actions.add-child (POST /api/sections, parent preset)
        │           │      └── _actions.add-ref   (POST /api/refs, from preset)
        │           │
        │           └── (collection) _actions.create
        │
        └── /{slug}
                │
                ├── property_schema           (the contract for sections of this type)
                ├── _links.sections           → /api/types/{slug}/sections
                └── _actions.update / .delete
```

A client navigates by reading `_links.*` and choosing the relation it wants. It never builds a URL from a template.

---

## 3. Media type and headers

- **Request**: `Accept: application/hal+json` (default). Clients that don't care about hypermedia can send `Accept: application/json` and get the same body without `_links` / `_actions` / `_embedded`.
- **Base-URL discovery**: `GET /` is content-negotiated. A browser (Accept includes `text/html`, is empty, or is `*/*`) gets the SPA shell; an agent that asks for `application/hal+json` / `application/json` gets the catalog root document — so the first hop is discoverable, not an opaque HTML shell. Both responses carry a `Link: </skill>; rel="service-doc"` header, the SPA's `<head>` carries `<link rel="service-doc">` + `<link rel="alternate" type="application/hal+json">`, and `GET /llms.txt` is a plaintext signpost. An agent handed only the base URL can orient via any of these without guessing URLs.
- **Response**: `application/hal+json`. Includes `ETag` header on every resource. `Cache-Control: no-store` (local app, no caching layer).
- **Conditional writes**: `If-Match: <etag>` required for PATCH, DELETE, POST `move`, and POST `revisions/{n}/restore` on resources that expose an `_etag` (sections, types, refs). `PATCH /api` (the notebook config) is the **one exception** — it's a single-writer single-row resource on a local app and skips `If-Match`. Missing required `If-Match` → 428 `precondition-required`; mismatch → 412 `etag-mismatch`.
- **Idempotency**: `Idempotency-Key: <ulid>` on POST/PATCH/DELETE. Server keys results for 24h.
- **Authorship**: `Arch-Author: <free-form string ≤128 bytes>` (optional) on any mutating request. **Informational metadata only — there is no auth system; callers self-declare and the server trusts them**. The value is stamped onto the row in `revisions` / `comments` so downstream readers can attribute "who did this." Bad actors can lie about who they are; we don't care. Header absent → stored as `null`. Header longer than 128 bytes → 422 `header-invalid`.
- **Revision message**: PATCH / POST bodies on sections may include `revision_message: string` (optional, ≤256 bytes). Stamped onto the new revision row alongside `Arch-Author`.
- **Embedding**: `?embed=type,parent,refs,children` to inline related resources under `_embedded`. Default response is lean (links only).
- **Selection**: `?fields=slug,title,type` to project the response shape. Default returns the full resource.

---

## 4. Resource hierarchy

| URL                                             | Resource                         |
|-------------------------------------------------|----------------------------------|
| `/`                                             | Base URL — SPA for browsers, catalog root document for agents (content-negotiated) |
| `/skill`                                        | AI authoring guide (`text/markdown`, or HAL wrapper) |
| `/llms.txt`                                     | Plaintext discovery signpost (llmstxt.org) |
| `/api`                                          | Root — entry point + capabilities|
| `/api/health`                                   | `{ ok, version, schema_version }`|
| `/api/types`                                    | Collection of section types      |
| `/api/types/{slug}`                             | Single type + property schema    |
| `/api/types/{slug}/sections`                    | Sections of this type            |
| `/api/sections`                                 | Roots collection (or filterable) |
| `/api/sections/{slug}`                          | Single section                   |
| `/api/sections/{slug}/children`                 | Direct children                  |
| `/api/sections/{slug}/ancestors`                | Path from root to this section   |
| `/api/sections/{slug}/refs`                     | Edges where this section is from or to |
| `/api/sections/{slug}/revisions`                | Revision history (collection)    |
| `/api/sections/{slug}/revisions/{n}`            | Full snapshot at revision N      |
| `/api/sections/{slug}/revisions/{n}/restore`    | Action — restore section to revision N |
| `/api/sections/{slug}/comments`                 | Comments on this section (collection) |
| `/api/sections/{slug}/move`                     | Action endpoint                  |
| `/api/refs`                                     | Edge collection                  |
| `/api/refs/{id}`                                | Single edge                      |
| `/api/comments/{id}`                            | Single comment                   |
| `/api/history`                                  | Notebook change timeline (all section revisions) |
| `/api/graph`                                    | Compact tree + edges snapshot    |
| `/api/search?q=...`                             | Fuzzy search                     |
| `/api/batch`                                    | Transactional batch              |

**Computed fields**: `number` (e.g. `5.1.1.1.1`) is computed from tree position at read time — never sent in writes.

---

## 5. Walkthroughs

### 5.1 Onboarding from zero

```http
GET /api
```
```json
{
  "name": "Architecture Notebook",
  "schema_version": 4,
  "notebook": { "title": "Acme Trading System", "version": { "major": 14, "minor": 3 } },
  "_links": {
    "self":     { "href": "/api" },
    "types":    { "href": "/api/types" },
    "sections": { "href": "/api/sections", "title": "Root sections" },
    "graph":    { "href": "/api/graph" },
    "search":   { "href": "/api/search?q={q}", "templated": true },
    "batch":    { "href": "/api/batch" },
    "print":    { "href": "/print" },
    "service-doc": { "href": "/skill", "type": "text/markdown", "title": "AI authoring guide" }
  },
  "_actions": {
    "update-notebook": {
      "method": "PATCH",
      "href": "/api",
      "title": "Update notebook title; bump the major version (resets minor to 0)",
      "schema": {
        "fields": [
          { "key": "title", "type": "string", "required": false },
          { "key": "major", "type": "number", "required": false }
        ]
      }
    }
  }
}
```

From here, an AI client knows every other thing it can do. It chooses a link.

**Notebook version.** `notebook.version` is `{ major, minor }`. **Minor auto-increments by one on every content-mutating request** — section/type/ref create, edit, delete, move, revision-restore, and a `POST /api/batch` (a batch bumps once, not once per op). Comments do not bump it (neither the direct comment routes nor a comment op inside a batch), and a request that fails does not bump it. **Major is human-controlled**: `PATCH /api` with `{ "major": N }` sets it and resets minor to 0 — the way to mark a milestone. So agent edits move the minor; you cut a major. The version is read-only on every other response.

### 5.1.1 Fetch the authoring guide — `GET /skill`

`_links.service-doc` points at `GET /skill`, which serves `skill/SKILL.md` — the full contract for driving this API. It's the same document bundled into the MCP tool's description, so HTTP and MCP clients read one source.

```http
GET /skill
Accept: text/markdown
```

- Default response is the raw markdown (`Content-Type: text/markdown`), so `curl /skill` and any agent that just wants the guide gets readable text. This endpoint is exempt from the API-wide hal/json `Accept` gate — a narrow `Accept: text/markdown` is honored, not rejected with 406.
- `Accept: application/hal+json` returns a HAL wrapper instead: `{ "media_type": "text/markdown", "_links": { "self": { "href": "/skill" } }, "content": "<markdown>" }`. `Accept: application/json` returns the same without `_links`.
- The path is top-level and notebook-agnostic (the guide is identical for every notebook), so the per-notebook root advertises `/skill` unprefixed even though its sibling links carry the `/n/{notebook}` prefix.
- Every root also sends a `Link: </skill>; rel="service-doc"; type="text/markdown"` header, so a client that never parses the HAL body still discovers the guide.

### 5.2 Read a section with everything it needs to render

```http
GET /api/sections/api-acme-com?embed=type,parent,refs,children
Accept: application/hal+json
```
```json
{
  "slug": "api-acme-com",
  "number": "5.1.1.1.1",
  "title": "api.acme.com",
  "deck": "The public HTTPS entrypoint for the Acme trading API.",
  "type": "ingress",
  "tags": ["prod", "us-east-1", "public", "tier-0"],
  "properties": {
    "protocol": "HTTPS, TLS 1.3 only",
    "domain":   { "$ref": "domain-acme-com" },
    "upstream": { "$ref": "service-order-engine" },
    "auth":     { "$ref": "auth-jwt" },
    "rate_limit": "240 req/min/key, burst 600"
  },
  "html": "<p>Public HTTPS entry point ...</p>",
  "unresolved_refs": [],
  "updated_at": 1715958000,
  "_etag": "W/\"7a2c\"",
  "_links": {
    "self":      { "href": "/api/sections/api-acme-com" },
    "type":      { "href": "/api/types/ingress", "title": "HTTPS Ingress" },
    "parent":    { "href": "/api/sections/ingresses" },
    "children":  { "href": "/api/sections/api-acme-com/children" },
    "ancestors": { "href": "/api/sections/api-acme-com/ancestors" },
    "refs":      { "href": "/api/sections/api-acme-com/refs" },
    "refs.out":  { "href": "/api/sections/api-acme-com/refs?dir=out" },
    "refs.in":   { "href": "/api/sections/api-acme-com/refs?dir=in" }
  },
  "_actions": {
    "update":    { "method": "PATCH",  "href": "/api/sections/api-acme-com",
                   "headers": { "If-Match": "<_etag>" },
                   "schema_ref": "/api/types/ingress#/property_schema" },
    "move":      { "method": "POST",   "href": "/api/sections/api-acme-com/move",
                   "schema": { "fields": [
                     { "key": "parent",   "type": "ref",    "required": false },
                     { "key": "position", "type": "number", "required": false }
                   ]}},
    "delete":    { "method": "DELETE", "href": "/api/sections/api-acme-com",
                   "headers": { "If-Match": "<_etag>" } },
    "add-child": { "method": "POST",   "href": "/api/sections",
                   "title": "Create a child under this section",
                   "body_preset": { "parent": "api-acme-com" },
                   "schema_ref": "/api/types/{type}#/property_schema" },
    "add-ref":   { "method": "POST",   "href": "/api/refs",
                   "body_preset": { "from": "api-acme-com" },
                   "schema": { "fields": [
                     { "key": "to",   "type": "ref",    "required": true },
                     { "key": "role", "type": "string", "required": false }
                   ]}}
  },
  "_embedded": {
    "type": { "slug": "ingress", "name": "HTTPS Ingress", "property_schema": { ... } },
    "parent": { "slug": "ingresses", "title": "Ingresses", "_links": { "self": {...} } },
    "children": { "_embedded": { "items": [] } },
    "refs": {
      "out": [
        { "to":   { "slug": "domain-acme-com", "title": "acme.com",     "type": "domain"  },
          "role": "uses",  "source": "html",     "_links": { "self": { "href": "/api/refs/41" } } },
        { "to":   { "slug": "service-order-engine", "title": "Order Engine", "type": "service" },
          "role": "routes-to", "source": "property", "_links": { "self": { "href": "/api/refs/42" } } }
      ],
      "in": [
        { "from": { "slug": "uptime-alarm", "title": "API uptime alarm", "type": "monitor" },
          "role": "monitors", "source": "html",   "_links": { "self": { "href": "/api/refs/93" } } }
      ]
    }
  }
}
```

One round-trip and the section view + glimpse stack initial state + edit form are fully driveable.

### 5.3 Update a section (concurrency-safe)

```http
PATCH /api/sections/api-acme-com
If-Match: W/"7a2c"
Content-Type: application/json
Idempotency-Key: 01HXY9...
```
```json
{ "properties": { "rate_limit": "120 req/min/key, burst 300" } }
```
- 200 → new resource representation with bumped `_etag` and `updated_at`.
- 412 → ETag mismatch. The client refetches, merges, retries.
- 422 → validation problem, with `errors[]` pointing at the failing field.

### 5.4 Create a section by following the type's schema

```http
GET /api/types/ingress
```
```json
{
  "slug": "ingress",
  "name": "HTTPS Ingress",
  "color": "#dc2626",
  "property_schema": {
    "fields": [
      { "key": "protocol",   "type": "enum",   "enum": ["HTTPS","HTTP"], "required": true },
      { "key": "domain",     "type": "ref",    "refType": "domain", "required": true },
      { "key": "upstream",   "type": "ref",    "refType": "service" },
      { "key": "auth",       "type": "ref",    "refType": "auth" },
      { "key": "rate_limit", "type": "string" }
    ]
  },
  "_links": {
    "self":     { "href": "/api/types/ingress" },
    "sections": { "href": "/api/types/ingress/sections" }
  }
}
```

Then:
```http
POST /api/sections
Idempotency-Key: 01HXYA...
```
```json
{
  "type": "ingress",
  "parent": "ingresses",
  "title": "app.acme.com",
  "deck": "Customer portal ingress.",
  "properties": {
    "protocol": "HTTPS",
    "domain":   "acme-com",
    "upstream": "service-portal"
  },
  "tags": ["prod"],
  "html": "<p>Fronts the customer portal at <arch-ref to=\"service-portal\">Customer Portal</arch-ref>.</p>"
}
```
- 201 + `Location: /api/sections/app-acme-com`. Body is the new resource. Server has already scanned the HTML, inserted edges, and computed the new `number`.
- 422 if the type's `property_schema` rejects the props or any **required** `ref` value is unresolved. Optional `ref` values that fail to resolve surface in the response's `unresolved_refs[]` (see §5.4.0) without failing the save.
- 409 if the slug collides without an override.

### 5.4.0 Unresolved refs

Section responses (§5.2) carry an `unresolved_refs` array listing `<arch-ref>` and property-ref targets that don't resolve to a known slug. Shape:

```ts
type UnresolvedRef = {
  slug: string;              // the target that couldn't be resolved
  source: 'html' | 'property';
  field?: string;            // present when source='property' — the property field key
  role?: string;             // present when source='html' — the role attribute on <arch-ref>
};
```

UI clients render properties whose value matches an entry in this array with the same muted/broken treatment as a dangling inline `<arch-ref>`. Optional `ref`/`multi-ref` properties never fail saves; required ones fail with `ref-unresolved` (422). Empty array on a clean section.

### 5.4.1 Authoring `<arch-ref>` in HTML bodies

Anywhere a section's `html` may contain cross-references, AI clients author them as a custom element. The parser is lenient about syntax but strict about content.

**Accepted forms:**
- Either attribute order: `<arch-ref to="X" role="Y">` or `<arch-ref role="Y" to="X">`.
- Either quote style: `"` or `'`. **Both attribute values must use a quote** — bare/unquoted values are rejected.
- Optional whitespace around `=` and arbitrary whitespace between attributes.
- Self-closing `<arch-ref to="X"/>` or paired `<arch-ref to="X">label</arch-ref>`.

**Rejected (422 `arch-ref-malformed`):**
- Missing `to` attribute.
- `to` value not matching `^[a-z0-9-]+$`.
- Any attribute other than `to` and `role`.
- Attribute name in any case other than lowercase (`to`, `role` only; `To`, `ROLE` rejected).
- Unquoted attribute values (`<arch-ref to=foo>`).
- Duplicate attribute names (`<arch-ref to="a" to="b">`).
- HTML-entity-encoded attribute values are **not decoded**; the literal byte sequence between the quotes is the slug (so `to="foo&#45;bar"` fails the `^[a-z0-9-]+$` check because of the `&`).

**Save behavior:**
The diff against `refs` (where `source IN ('html','property')`) happens in the same transaction as the section save. Unresolved `to` slugs do NOT fail the save — they surface as `unresolved_refs[]` on the response (see §5.2). Required `ref`-typed *properties* that are unresolved DO fail the save with `ref-unresolved` (422).

**Paragraph anchor stamping:**
Before the ref scan, the same transaction stamps `data-anchor="p-N"` on every top-level `<p>` tag in document order (N is 0-indexed). "Top-level" means directly under the body fragment — `<p>` tags nested inside `<blockquote>`, `<li>`, `<details>`, or any other open element are not stamped. Existing `data-anchor` values on top-level `<p>` tags are renumbered to the new sequential index, so editing paragraph 2 keeps paragraph 3 as `p-2`/`p-3` as long as nothing is reordered. Stamping is idempotent: running it on already-stamped html produces the same html. The stamped html is what gets stored on the section and what `GET /api/sections/{slug}` returns. Other tags (`<h2>`, `<ul>`, `<pre>`, etc.) are not stamped. Comments (§5.9) reference these anchors via the `anchor` field.

### 5.5 Batch — the most-used AI path

```http
POST /api/batch
Idempotency-Key: 01HXYB...
```
```json
{
  "atomic": true,
  "ops": [
    { "id": "t1", "method": "POST", "href": "/api/types",
      "body": { "slug": "queue", "name": "Message Queue", "color": "#0ea5e9",
                "property_schema": { "fields": [ {"key":"engine","type":"enum","enum":["sqs","sns"],"required":true} ] } } },
    { "id": "s1", "method": "POST", "href": "/api/sections",
      "body": { "type": "queue", "parent": "infra-prod", "title": "orders-events",
                "properties": { "engine": "sqs" } } },
    { "id": "s2", "method": "POST", "href": "/api/sections",
      "body": { "type": "queue", "parent": "infra-prod", "title": "settlement-events",
                "properties": { "engine": "sqs" } } },
    { "id": "r1", "method": "POST", "href": "/api/refs",
      "body": { "from": "service-order-engine", "to": "$s1.slug", "role": "publishes" } },
    { "id": "r2", "method": "POST", "href": "/api/refs",
      "body": { "from": "service-settlement",   "to": "$s2.slug", "role": "consumes" } }
  ]
}
```

- `$s1.slug` is a back-reference token: resolved server-side after `s1` succeeds. This lets the AI link freshly-created sections without a second round-trip.
- Token support describes what each op TYPE produces; any op may consume any producer's exposed tokens wherever a string appears in its body. `POST /api/types` exposes `$opid.slug`, `$opid.id`. `POST /api/sections` exposes `$opid.slug`, `$opid.id`. `POST /api/refs` exposes `$opid.id`. Unsupported token (e.g. `$refsop.slug`) → `backref-unresolved` (422 inside that op's result).
- Token substitution is whole-leaf only (`^\$<opid>\.<attr>$`). Type is preserved: `.slug` → string, `.id` → integer. Tokens embedded in larger strings (`"prefix-$s1.slug"`) are not substituted.
- Dependency model: before execution, the server scans each op's serialized body for `$<other-opid>.` tokens; if op B references op A, B is dependent on A. In `atomic: false` mode, when A fails, B and every transitive dependent fails with `backref-unresolved`; independent ops continue.
- Per-op `If-Match`: ops that mutate an existing resource (PATCH, DELETE, POST move) carry an `if_match` field in the op envelope (sibling to `body`); the server enforces it exactly as the direct route would. `if_match` is opaque to back-ref tokens — write the literal ETag string. (For chained mutations that need a freshly-rotated ETag, finish the first batch and issue a second one.)
- **Op methods + targets supported**:
  - `POST /api/types` — create a section type
  - `POST /api/sections` — create a section
  - `POST /api/refs` — create a manual ref
  - `PATCH /api/types/{slug}` — update name / description / color / property_schema
  - `PATCH /api/sections/{slug}` — update title / deck / tags / html / properties / revision_message; runs the same validators + link scanner + revision-stamp as the direct route
  - `PATCH /api/comments/{id}` — update body / resolved
  - Anything else (DELETE, POST move, POST notebooks, etc.) → `400 Unsupported batch op` inside that op's result. Run those as direct calls.
- **`Arch-Author`** on the batch envelope is the author for every mutating op in that batch. Per-op author override is not supported — one envelope, one act, one author.
- Per-op `Idempotency-Key`: rejected with `idempotency-misplaced` (400 inside the op result). The envelope `Idempotency-Key` covers the whole batch.
- Envelope status code: **200** on success or atomic rollback (regardless of inner per-op codes); **422** if the envelope itself is malformed or has a dependency cycle; **409** if envelope-level `Idempotency-Key` reuse conflicts; **413** if envelope exceeds 8 MiB.
- Atomic rollback signal: on `atomic: true` with an in-transaction failure, the envelope still returns 200 with `rolled_back: true` at the top level; the failing op's result carries its real error; ops that never ran carry `dependency-aborted` (424); ops that succeeded before the failure carry their would-have-succeeded body (read but discarded).
- Pre-execution failures (unknown opid → `backref-unresolved`) in atomic mode return envelope 200 with `rolled_back: false` (no transaction opened); the failing op carries the error and all other ops carry `dependency-aborted` (424).
- In atomic mode with an in-transaction failure, **every op that had not completed at the moment of failure** — whether transitively dependent on the failing op or not — carries `dependency-aborted` (424). Only ops that had committed work *before* the failing op started receive their would-have-succeeded body (the transaction still rolls those writes back; the body is purely diagnostic).

Example rollback envelope:
```json
{
  "atomic": true,
  "rolled_back": true,
  "results": [
    { "id": "t1", "status": 201, "body": { "slug": "queue", "..." : "..." } },
    { "id": "s1", "status": 422, "body": {
        "type": "/errors/validation", "title": "Validation failed", "status": 422,
        "errors": [{ "field": "properties.engine", "code": "validation", "message": "..." }]
    }},
    { "id": "s2", "status": 424, "body": {
        "type": "/errors/dependency-aborted", "title": "Dependency aborted", "status": 424
    }}
  ]
}
```
- `atomic: true` → entire batch in one SQLite transaction; any failure rolls everything back. `atomic: false` → best-effort, report per-op result.
- Response:
```json
{
  "atomic": true,
  "results": [
    { "id": "t1", "status": 201, "body": { "slug": "queue", ... } },
    { "id": "s1", "status": 201, "body": { "slug": "orders-events", "number": "5.1.1.8.1", ... } },
    { "id": "s2", "status": 201, "body": { "slug": "settlement-events", "number": "5.1.1.8.2", ... } },
    { "id": "r1", "status": 201, "body": { "id": 207, ... } },
    { "id": "r2", "status": 201, "body": { "id": 208, ... } }
  ]
}
```

### 5.6 Search

Matches against **every indexed field**: `title`, `slug`, `deck`, body `html` (with tags stripped for matching and snippet generation), `properties_json` (string values flattened), and `tags_json`. Substring match, case-insensitive, LIKE wildcards in `q` are escaped.

Results are re-ranked in this order (best first), tie-broken by most recently updated:

| Rank | Source |
|---|---|
| 0 | title prefix match |
| 1 | slug prefix match |
| 2 | title contains |
| 3 | slug contains |
| 4 | deck contains |
| 5 | body HTML contains |
| 6 | properties or tags contains |

Each result carries `snippet` (~140 chars of context around the first hit, with `<mark>…</mark>` around the matched span, HTML-escaped around it) and `snippet_field` (`title`/`slug`/`deck`/`body`/`properties`/`tags`) so clients can render the hit and label its source.

```http
GET /api/search?q=RS256&limit=5
```
```json
{
  "query": "RS256",
  "_links": { "self": { "href": "/api/search?q=RS256&limit=5" } },
  "_embedded": {
    "results": [
      { "slug": "rs256-signer", "title": "RS256 signing service", "type": "auth", "number": "7.1",
        "snippet": "<mark>RS256</mark> signing service",
        "snippet_field": "title",
        "_links": { "self": { "href": "/api/sections/rs256-signer" } } },
      { "slug": "service-order-engine", "title": "Order Engine", "type": "service", "number": "3.1",
        "snippet": "…All inbound requests carry a JWT issued by Auth0 <mark>RS256</mark>.",
        "snippet_field": "body",
        "_links": { "self": { "href": "/api/sections/service-order-engine" } } }
    ]
  }
}
```

### 5.7 Graph snapshot (sidebar / TOC bootstrap)

```http
GET /api/graph
```
```json
{
  "nodes": [
    { "id": 1, "slug": "system-overview", "title": "System Overview", "type": "overview",
      "parent": null, "position": 0, "number": "1" },
    { "id": 2, "slug": "user-interfaces", "title": "User Interfaces",  "type": "ui",
      "parent": null, "position": 1, "number": "2" },
    /* ... */
  ],
  "edges": [
    { "id": 41, "from": "api-acme-com", "to": "domain-acme-com", "role": "uses", "source": "html" },
    /* ... */
  ],
  "_links": { "self": { "href": "/api/graph" } }
}
```

Sized for thousands of sections; not paginated because the UI needs the full tree to render the sidebar.

### 5.8 Revisions

Every create and PATCH on a section appends a row to that section's `revisions` table — a POST-snapshot capturing the section's state AFTER the change, with the `Arch-Author` value, the optional `revision_message`, and a server-assigned timestamp. Revision numbers are monotonic per section starting at 1.

```http
GET /api/sections/api-acme-com/revisions
Accept: application/hal+json
```
```json
{
  "total": 3,
  "_embedded": {
    "items": [
      { "revision": 3, "author": "claude",  "message": "Document TLS cert rotation",
        "created_at": 1779372207,
        "_links": { "self": { "href": "/api/sections/api-acme-com/revisions/3" },
                    "section": { "href": "/api/sections/api-acme-com" } }},
      { "revision": 2, "author": "human",   "message": null, "created_at": 1779372100,
        "_links": { "self": { "href": "/api/sections/api-acme-com/revisions/2" }, "section": { "href": "/api/sections/api-acme-com" } }},
      { "revision": 1, "author": null,      "message": null, "created_at": 1779372000,
        "_links": { "self": { "href": "/api/sections/api-acme-com/revisions/1" }, "section": { "href": "/api/sections/api-acme-com" } }}
    ]
  },
  "_links": { "self": { "href": "/api/sections/api-acme-com/revisions" },
              "section": { "href": "/api/sections/api-acme-com" } }
}
```

`GET /api/sections/{slug}/revisions/{n}` returns the full snapshot at revision N:

```json
{
  "revision": 2, "author": "human", "message": null, "created_at": 1779372100,
  "title": "api.acme.com", "deck": "...", "html": "<p>...</p>",
  "properties": { "domain": "api.acme.com", "tls": true },
  "tags": ["prod"],
  "_links": { "self": { "href": "/api/sections/api-acme-com/revisions/2" }, "section": { "href": "/api/sections/api-acme-com" } }
}
```

The section response carries `revision_count: <integer>` and `_links.revisions`. Revisions are not editable or deletable through this API — they're a historical record. Diff is intentionally not provided: section bodies are rich HTML, so the client just renders the full snapshot side-by-side. Idempotent replays of PATCH return the cached response without inserting a duplicate revision row.

**Restore** rewinds the section to a previous snapshot in one call. `POST /api/sections/{slug}/revisions/{n}/restore` copies revision N's `title`, `deck`, `html`, `properties`, and `tags` onto the live row, rescans refs against the restored content, and appends a fresh revision capturing the restored state. Requires `If-Match` against the **section's** current `_etag`. Body is optional (`{ "revision_message"?: string }`); when omitted, the new revision row's `message` is `"Restored from revision N"`. `Arch-Author` is read the same as on PATCH and stamped onto the new row.

```http
POST /api/sections/api-acme-com/revisions/2/restore HTTP/1.1
Content-Type: application/json
If-Match: W/"a1b2c3d4e5f60718"
Idempotency-Key: 01J9X...
Arch-Author: claude

{ "revision_message": "Reverted v3 rename — bad data" }
```
```http
HTTP/1.1 200 OK
Content-Type: application/hal+json
ETag: W/"77c1e2…"
```
```json
{
  "slug": "api-acme-com",
  "title": "api.acme.com",
  "html": "<p>...</p>",
  "properties": { "domain": "api.acme.com", "tls": true },
  "tags": ["prod"],
  "revision_count": 4,
  "_etag": "W/\"77c1e2…\"",
  "_links": { "self": { "href": "/api/sections/api-acme-com" },
              "revisions": { "href": "/api/sections/api-acme-com/revisions" } }
}
```

Status codes: 200 on success (response body is the section, embed=type,parent,refs,children, same shape as create); 428 `precondition-required` if `If-Match` is missing; 412 `etag-mismatch` (body carries `current_etag`) if stale; 404 if either the section or revision N is missing; 422 `validation` with `errors[0].field = "revision"` if N is not a positive integer; 422 `arch-ref-malformed` if the restored html contains a malformed `<arch-ref>` (with rollback).

### 5.9 Comments

Section-anchored comments are a separate, flat collection scoped to a section. Authors are stamped from `Arch-Author` (informational only; see §3). Comments carry their own `_etag` and require `If-Match` on PATCH / DELETE. The `anchor` field is either `"section"` (the whole section) or `"p-N"` where N is a non-negative integer matching a `data-anchor="p-N"` attribute stamped on a top-level `<p>` in the section's html (see §5.4.1). Comments are NOT included in the section's `_embedded` payload by default; the section response carries `comment_count` (open comments only, `resolved=false`, across ALL anchors) and `_links.comments` pointing at this collection.

**List**:
```http
GET /api/sections/api-acme-com/comments
Accept: application/hal+json
```
```json
{
  "total": 2,
  "_links": {
    "self":    { "href": "/api/sections/api-acme-com/comments" },
    "section": { "href": "/api/sections/api-acme-com" }
  },
  "_embedded": {
    "items": [
      {
        "id": 42, "section_slug": "api-acme-com", "anchor": "section",
        "body": "Should we mention the WAF rate limits here?",
        "author": "claude", "resolved": false,
        "created_at": 1779372207, "updated_at": 1779372207,
        "_etag": "W/\"abc1234567890def\"",
        "_links": {
          "self":    { "href": "/api/comments/42" },
          "section": { "href": "/api/sections/api-acme-com" }
        },
        "_actions": {
          "update": { "method": "PATCH",  "href": "/api/comments/42",
                      "headers": { "If-Match": "<_etag>" },
                      "schema": { "fields": [
                        { "key": "body",     "type": "string",  "required": false },
                        { "key": "resolved", "type": "boolean", "required": false }] } },
          "delete": { "method": "DELETE", "href": "/api/comments/42",
                      "headers": { "If-Match": "<_etag>" } }
        }
      }
    ]
  },
  "_actions": {
    "create": {
      "method": "POST", "href": "/api/sections/api-acme-com/comments",
      "title": "Create a comment on this section",
      "schema": { "fields": [
        { "key": "body",   "type": "string", "required": true },
        { "key": "anchor", "type": "string", "required": false, "placeholder": "section" }
      ] }
    }
  }
}
```

Optional filters:
- `?resolved=true` or `?resolved=false` — restricts to the matching subset. Any other value is silently ignored (returns the full set).
- `?anchor=section` or `?anchor=p-N` — restricts to that single anchor. Values not matching `^section$|^p-\d+$` are silently ignored.

Both filters may be combined (`?resolved=false&anchor=p-2`). The collection's `self` link reflects the active filters.

**Create**:
```http
POST /api/sections/api-acme-com/comments HTTP/1.1
Content-Type: application/json
Idempotency-Key: 01J9X...
Arch-Author: claude

{ "body": "Should we mention the WAF rate limits here?" }
```
- 201 + `Location: /api/comments/42`. Body is the new comment with a fresh `_etag`. `anchor` defaults to `"section"` when absent.
- 422 `validation` with `errors[0].field = "body"` if `body` is missing, empty/whitespace-only, not a string, or exceeds 4096 bytes (utf-8).
- 422 `validation` with `errors[0].field = "anchor"` and `errors[0].code = "anchor-unsupported"` if `anchor` is set to a value that doesn't match `^section$|^p-\d+$`. The server does not check that the paragraph index exists — orphan comments are tolerated so a `<p>` reorder doesn't break links retroactively.
- 422 `header-invalid` if `Arch-Author` exceeds 128 bytes.

**Update** (toggle resolved, edit body, or both):
```http
PATCH /api/comments/42 HTTP/1.1
Content-Type: application/json
If-Match: W/"abc1234567890def"
Idempotency-Key: 01J9Y...

{ "resolved": true }
```
- 200 with the updated comment and a rotated `_etag`.
- 428 if `If-Match` is missing; 412 with `current_etag` if stale.
- 422 with `errors[0].field = "body"` for the same body rules as create; 422 with `errors[0].field = "resolved"` if it's not a boolean.

**Delete**:
```http
DELETE /api/comments/42 HTTP/1.1
If-Match: W/"abc1234567890def"
Idempotency-Key: 01J9Z...
```
- 204 on success; 428 / 412 mirror PATCH.

Sections deleted via `DELETE /api/sections/{slug}` cascade-delete their comments via FK. Comments do NOT appear in `/api/graph`, do NOT show up in `?embed=` on a section, and are not part of `/print`.

### 5.9.1 Notebook-level comments inbox

`GET /api/comments` aggregates comments across every section in the notebook — the "inbox" view AI clients use to discover what humans (or other agents) wrote without walking the graph N+1 times. Templated link is exposed on the per-notebook root as `_links.comments`.

```http
GET /api/comments?resolved=false&since=1779380000&limit=50 HTTP/1.1
Accept: application/hal+json
```

```json
{
  "total": 12,
  "limit": 50,
  "_embedded": {
    "items": [
      {
        "id": 42,
        "section": { "slug": "api-acme-com", "number": "5.1.1.1.1", "title": "api.acme.com",
                     "_links": { "self": { "href": "/api/sections/api-acme-com" }}},
        "anchor": "p-2",
        "body": "Should we mention WAF rate limits here?",
        "author": "human",
        "resolved": false,
        "created_at": 1779380020,
        "updated_at": 1779380020,
        "_etag": "W/\"abc1234567890def\"",
        "_links": {
          "self":    { "href": "/api/comments/42" },
          "section": { "href": "/api/sections/api-acme-com" }
        }
      }
    ]
  },
  "_links": { "self": { "href": "/api/comments?resolved=false&since=1779380000&limit=50" } }
}
```

**Query params** (all optional, combinable):
- `resolved=true|false` — gate
- `author=<value>` — exact match against the stored `Arch-Author`
- `anchor=<value>` — `section` or `p-N` (same pattern as the per-section list)
- `since=<unix-seconds>` — only `created_at > since`. The "what's new since I last looked" primitive.
- `limit=<n>` — default 50, max 200. Invalid → 422 `validation` with `errors[0].field = "limit"`.

Sort is always `created_at DESC, id DESC`. No pagination cursor in this endpoint — combine `since` with `limit` for inbox-style polling.

Items embed `section: { slug, number, title, _links.self }` inline so the client doesn't need a separate fetch per row. The `_etag` on each item is the comment's etag — keep it to chain a resolve-batch (see §8 in `skill/SKILL.md`).

---

### 5.10 Notebook history timeline — `GET /api/history`

The notebook's change timeline: every section's revisions aggregated into one reverse-chronological feed. It reuses the per-section `revisions` data (no separate store) — each item links to the section and to that exact historical snapshot, which the per-section revision viewer (§5.8) already renders and restores. Advertised on the root as `_links.history` (templated).

```http
GET /api/history?author=claude&since=1779000000&limit=50 HTTP/1.1
Accept: application/hal+json
```

```json
{
  "notebook_version": { "major": 1, "minor": 42 },
  "total": 2,
  "limit": 50,
  "_embedded": { "items": [
    { "section": { "slug": "order-service", "number": "1.2", "title": "Order Service",
                   "_links": { "self": { "href": "/api/sections/order-service" } } },
      "revision": 5, "author": "claude", "message": "Address comments c-42",
      "created_at": 1779000000,
      "_links": { "section": { "href": "/api/sections/order-service" },
                  "snapshot": { "href": "/api/sections/order-service/revisions/5" } } }
  ] },
  "_links": { "self": { "href": "/api/history" } }
}
```

**Query params** (all optional, combinable):
- `author=<value>` — exact match against the stored `Arch-Author`.
- `since=<unix-seconds>` — only `created_at > since` (inbox-style "what changed since" polling).
- `limit=<n>` — default 50, max 200. Invalid → 422 `validation` with `errors[0].field = "limit"`.

Sort is always `created_at DESC, id DESC`. `notebook_version` is the current `{ major, minor }`. **Caveat**: a section deleted from the notebook takes its revisions with it (`revisions` cascade-delete with the section), so the timeline covers surviving sections only.

---

## 6. Collection response shape

Every collection endpoint returns this shape:

```json
{
  "total": 12,
  "_links": {
    "self":  { "href": "/api/sections?parent=infra-prod" },
    "next":  { "href": "/api/sections?parent=infra-prod&cursor=..." },
    "first": { "href": "/api/sections?parent=infra-prod" }
  },
  "_embedded": {
    "items": [ /* lean section summaries with their own _links */ ]
  },
  "_actions": {
    "create": {
      "method": "POST",
      "href": "/api/sections",
      "title": "Create a section",
      "schema_ref": "/api/types/{type}#/property_schema",
      "schema": { "fields": [
        { "key": "type",   "type": "ref",    "refType": "_type", "required": true },
        { "key": "parent", "type": "ref",    "required": false },
        { "key": "title",  "type": "string", "required": true },
        { "key": "deck",   "type": "string", "required": false },
        { "key": "tags",   "type": "multi-string" },
        { "key": "html",   "type": "rich" },
        { "key": "properties", "type": "schema-driven", "schema_ref": "$.type.property_schema" }
      ] }
    }
  }
}
```

Pagination is cursor-based via `cursor=<opaque>` for any collection that could exceed ~500 items. `total` is the total; `_embedded.items` is the current page. Most collections in this app fit in one response.

---

## 7. Lean section summary (in `_embedded.items`)

```json
{
  "slug": "api-acme-com",
  "number": "5.1.1.1.1",
  "title": "api.acme.com",
  "type": "ingress",
  "tags": ["prod"],
  "child_count": 0,
  "ref_counts": { "out": 5, "in": 3 },
  "_links": { "self": { "href": "/api/sections/api-acme-com" } }
}
```

Just enough for the sidebar tree and search results. Everything else is one follow-link away.

---

## 8. Errors — RFC 7807

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json
```
```json
{
  "type": "/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "1 field failed validation",
  "instance": "/api/sections",
  "errors": [
    { "field": "properties.domain", "code": "ref-unresolved",
      "message": "No section with slug 'acme-com' exists",
      "hint": "Try /api/search?q=acme" }
  ]
}
```

`hint` is unique to this API — a follow-link the client can use to recover. AI clients love this.

Standard codes:
- `validation` — 422, with `errors[]`
- `etag-mismatch` — 412, with current `_etag` in body
- `precondition-required` — 428, when `If-Match` is missing on a route that requires it
- `idempotency-conflict` — 409, same key with different body
- `idempotency-misplaced` — 400, `Idempotency-Key` sent on GET or on an inner batch op (where the envelope owns the key)
- `ref-unresolved` — 422 field error, `hint` → `/api/search?q=<value>`
- `ref-derived` — 422 on `DELETE /api/refs/{id}` when `source != 'manual'`, `hint` → the referencing section
- `slug-conflict` — 409 on create, with `suggested` slug
- `slug-invalid` — 422 on create when slug doesn't match `^[a-z0-9-]+$`
- `arch-ref-malformed` — 422 on save when an `<arch-ref>` tag in HTML can't be parsed by the rules in §5.4.1
- `anchor-unsupported` — 422 field error on `POST /api/sections/{slug}/comments` when `anchor` is set to a value that doesn't match `^section$|^p-\d+$`
- `type-in-use` — 409 on DELETE /api/types/{slug}, with `dependent_count`
- `cycle-illegal` — 422; (a) tree-cycle on move; (b) batch-dependency cycle in the envelope
- `backref-unresolved` — 422 inside a batch op result when a `$opid.token` cannot be resolved (opid unknown or token unsupported for the source op's type)
- `dependency-aborted` — 424 inside a batch op result when an upstream op failed (the dependent never runs)
- `payload-too-large` — 413, request body exceeds the route's cap (1 MiB default, 8 MiB for `/api/batch`)
- `method-not-allowed` — 405, request method not supported on the path; response sets `Allow:` header
- `not-acceptable` — 406, `Accept` header cannot be satisfied by `application/hal+json`, `application/json`, or `application/problem+json`
- `not-found` — 404
- `internal` — 500, with `request_id`
- `header-invalid` — 422 when a known header is malformed (e.g. `Arch-Author` exceeds 128 bytes)

---

## 9. Schemas in `_actions`

Four shapes are allowed where a schema is needed:

1. **Inline** — `schema: { fields: [...] }` for fixed action shapes (`move`, `add-ref`).
2. **By reference** — `schema_ref: "/api/types/ingress#/property_schema"` when the schema lives on another resource at a known URL. Server fetches and applies it; 404 → 422 `validation` with `errors[0].field = "<action key>"`.
3. **Resource-field interpolation** — `schema_ref: "$.<key>.property_schema"` (or any single-level path) for actions whose schema depends on a field already in the **parent resource** being read (e.g. `_actions.update` on a section: the existing `type` field locates the property schema). Resolved against the resource carrying the `_actions` block.
4. **Request-body URI-template** — `schema_ref: "/api/types/{type}#/property_schema"` for actions whose schema depends on a field the **client supplies in the request body** (e.g. `add-child` / collection `create`: the client chooses `type`).

Mode-4 resolution algorithm (server-side):
1. If the action is inside `/api/batch`, resolve any `$opid.*` back-reference tokens in the body **first**.
2. Single-segment substitution only: `{key}` matches the regex `\{[a-z_][a-z0-9_]*\}` and binds against the **top-level** request body. Nested paths (`{a.b}`) are not supported.
3. Missing top-level key → 422 `validation` with `errors[]` referencing the missing field name (e.g. `field: "type"`).
4. After substitution, fetch the referenced schema. If the target doesn't exist → 422 `validation` with `errors[0].field = "<key>"`, `errors[0].code = "ref-unresolved"`, `errors[0].hint = "/api/types"` (or whichever collection is implied by the template prefix).
5. Once resolved, validate the rest of the body against the schema and the action's inline `schema.fields` for any non-templated fields.

Note on nested mode-3 in collection `create`: when `add-child` or collection `create` uses both a mode-4 top-level resolution (for `properties`) and a nested mode-3 `properties` field with `schema_ref: "$.type.property_schema"`, "sibling" refers to the **request body** in that nested context, not the parent resource. Treat the request body as the resource for nested resolution.

The `fields` shape is the same `PropertySchema` used internally (see `/be-dev` skill):
```ts
{ key, type: 'string'|'number'|'boolean'|'enum'|'ref'|'multi-ref'|'rich'|'multi-string'|'schema-driven',
  required?, enum?, refType?, placeholder?, schema_ref? }
```

---

## 10. Versioning

- One resource version field: `schema_version` (the DB schema version) returned at `/api` and `/api/health`. Bumps on breaking migrations.
- No URL versioning. Hypermedia + additive changes are the contract. Removing a field, link, or action requires a `schema_version` bump and a corresponding bump in `skill/SKILL.md`.
- Deprecations: any field/link about to be removed gets a `_deprecated: true` flag at least one schema_version before removal.

---

## 11. Things this API deliberately does *not* do

- No GraphQL. Walking links is sufficient; clients don't need ad-hoc projections beyond `?fields=` and `?embed=`.
- No subscriptions or websockets. Local single-user app; polling `/api/graph` is fine if needed.
- No auth, no API keys, no rate limits. Bound to `127.0.0.1`.
- No URL templates for clients to construct paths. The only template is RFC 6570 in `_links` (e.g. `search?q={q}`).
- No content negotiation beyond `application/hal+json` / `application/json` / `application/problem+json`.

---

## 12. AI client recipe

Distilled flow an AI follows to make a non-trivial change:

1. `GET /api` once. Cache the result.
2. `GET /api/graph` once at start of session. Now the AI knows every slug.
3. `GET /api/types` once. Now the AI knows every property schema.
4. To create N sections + edges atomically: build a `/api/batch` body using back-references (`$s1.slug`) and POST it with an `Idempotency-Key`.
5. To edit an existing section: `GET /api/sections/{slug}` (with `embed=refs,type`), modify the `properties`/`html`, `PATCH` with `If-Match`.
6. On 412: refetch, three-way-merge, retry. On 422 with `hint`: follow the hint.
7. On 422 `ref-unresolved`: either `POST /api/sections` to create the target first, or `GET /api/search?q=...` to find it.

Every step is link-driven. The AI never composes a URL from a template it had memorized.
