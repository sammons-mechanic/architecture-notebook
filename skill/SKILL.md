---
name: architecture-notebook
description: Authoring contract for the Architecture Notebook — a local HAL+JSON notebook for documenting system architectures. Load this when writing into a notebook via the API. Drives discovery, batch creation with back-references, conditional writes, and error recovery.
---

# Architecture Notebook — AI Author Skill

You are writing into an **Architecture Notebook** — a single-user local app that stores hierarchical sections, cross-references, and per-type property schemas. The server is at `http://127.0.0.1:<port>/api`. Everything is **HAL+JSON** with hypermedia controls (`_links`, `_actions`, `_embedded`). The canonical spec lives in `design/api.md`.

**Rules of the road.**
- Never construct URLs. Discover them via `_links` / `_actions` and expand RFC 6570 templates with the body you're about to send.
- Every mutating write to an existing resource carries `If-Match` (except `PATCH /api`, which is exempt).
- Every mutating request takes `Idempotency-Key` (caller-generated UUIDv4 or sha256-of-intent). Replay returns the cached response byte-for-byte for 24h.
- Errors are `application/problem+json` per RFC 7807: `type` (discriminator URI like `/errors/<code>`), `title`, `status`, `detail`, `instance`, optional `errors[]` for field-level issues (each carries its own `field`/`code`/`message`/`hint`), and an optional top-level `hint` URL you can follow to recover.
- Tag your writes with `Arch-Author: claude` (or whatever name you want). It's informational metadata stamped onto the row in `revisions` / `comments` — there's **no auth system, no validation**. Optional but recommended so humans can see who edited what.
- Section numbers (`1.2.3`) are computed by the server, never sent in writes. Slugs are stable identifiers (`^[a-z0-9-]+$`).

---

## 1. Discover the API

**If all you have is the base URL**, you have enough. `GET /` with `Accept: application/hal+json` returns the catalog root (a browser's `text/html` gets the SPA instead); every response from `/` and `/api` carries a `Link: </skill>; rel="service-doc"` header, and `GET /llms.txt` is a plaintext signpost listing `/api`, `/skill`, and `/mcp/sse`. Any of these lands you here. Never guess URLs beyond the base — follow these hints.

Fetch `GET /api` **once** at session start. Cache the response. Every URL you'll need is in `_links` or in a resource's `_actions[*].href`. The root carries no `_etag`, and `PATCH /api` is the **documented exception** that does not take `If-Match`.

```http
GET /api HTTP/1.1
Accept: application/hal+json
```

```json
{
  "name": "Architecture Notebook",
  "schema_version": 1,
  "notebook": { "title": "Untitled Notebook", "version": { "major": 0, "minor": 0 } },
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
      "method": "PATCH", "href": "/api",
      "schema": { "fields": [
        { "key": "title", "type": "string", "required": false },
        { "key": "major", "type": "number", "required": false }
      ]}
    }
  }
}
```

Cache `_links` for the rest of the session. Refetch only if the server returns 409 or 412 on a request you expected to succeed (the schema may have rolled).

`notebook.version` is `{ major, minor }`. You don't manage it: **minor auto-increments on every content write you make** (each section/type/ref create, edit, delete, move, restore counts once; a `POST /api/batch` counts once for the whole batch; comments and failed requests don't count). `major` is the human's milestone marker — set it with `PATCH /api { "major": N }`, which resets minor to 0. Don't send `revision`; that field is gone.

`_links.service-doc` (`GET /skill`) serves **this document**. If you ever lose the contract — a fresh session, a dropped tool description — follow that link to re-fetch it (`Accept: text/markdown` for the raw guide, `application/hal+json` for a `{ media_type, content }` wrapper). The same `/skill` is also advertised as a `Link: </skill>; rel="service-doc"` response header on every root.

---

## 2. Boot graph

Fetch `GET /api/graph` once at start of session. It returns the full tree (every section with `slug`, `number`, `title`, `type`) plus all `edges[]`. That gives you the universe of valid slugs without N round-trips.

```http
GET /api/graph HTTP/1.1
```

```json
{
  "nodes": [
    { "slug": "acme-trading-system", "number": "1", "title": "Acme Trading System", "type": "overview", "parent": null },
    { "slug": "api-acme-com",        "number": "1.2", "title": "api.acme.com",      "type": "ingress",  "parent": "acme-trading-system" }
  ],
  "edges": [
    { "id": 14, "from": "api-acme-com", "to": "order-service", "role": "routes-to" }
  ],
  "_links": { "self": { "href": "/api/graph" } }
}
```

`edges[].id` is the ref's numeric id (so you can `DELETE /api/refs/{id}` later). `edges[].from`/`.to` are slugs, not numeric ids.

---

## 3. Boot types

Fetch `GET /api/types` once. Each type carries a `property_schema` you'll need to write against when creating sections of that type.

```json
{
  "total": 11,
  "_embedded": { "items": [
    { "slug": "ingress", "name": "Ingress", "color": "#dc2626",
      "property_schema": { "fields": [
        { "key": "domain",   "type": "string",    "required": true },
        { "key": "protocol", "type": "enum",      "required": true, "enum": ["http","https","grpc","tcp"] },
        { "key": "tls",      "type": "boolean",   "required": false },
        { "key": "routes-to","type": "multi-ref", "required": false, "refType": "service" }
      ]}
    }
  ]},
  "_actions": { "create": { "method": "POST", "href": "/api/types", "schema": { ... } } }
}
```

Use `?embed=sections` on `/api/types/{slug}` if you also need every section of that type in one round-trip.

---

## 4. Read with everything embedded

For the full render set in one request, embed everything you need:

```http
GET /api/sections/api-acme-com?embed=type,parent,refs,children HTTP/1.1
```

`_embedded` is a snapshot — if you intend to write, follow the embedded resource's `_links.self` first to capture a fresh `ETag` header. The `?embed=` whitelist per resource:

- **Sections**: `type`, `parent`, `refs`, `children`, `ancestors`
- **Types**: `sections`
- **Refs**: `from`, `to`

Anything else in `?embed=` is silently ignored. Pair with `?fields=a,b,c` to project the top-level shape if you only need a few keys.

---

## 5. Multi-resource create — `POST /api/batch`

When you need to create a type, several sections, and the refs between them atomically: use `/api/batch` with `$opid.slug` / `$opid.id` back-references. The envelope takes one `Idempotency-Key`; per-op `Idempotency-Key` is rejected with `idempotency-misplaced` 400.

```http
POST /api/batch HTTP/1.1
Content-Type: application/json
Idempotency-Key: 7c4f2c1e-9d8b-4f3c-b1a2-3e5f6c7d8e9f

{
  "atomic": true,
  "ops": [
    { "id": "t-svc", "method": "POST", "href": "/api/types",
      "body": { "slug": "service", "name": "Service",
                "property_schema": { "fields": [
                  { "key": "language", "type": "string" },
                  { "key": "depends-on", "type": "multi-ref", "refType": "service" }
                ]}}},
    { "id": "s-order", "method": "POST", "href": "/api/sections",
      "body": { "slug": "order-service", "title": "Order Service",
                "type": "$t-svc.slug",
                "properties": { "language": "Go" }}},
    { "id": "s-pay", "method": "POST", "href": "/api/sections",
      "body": { "slug": "payment-service", "title": "Payment Service",
                "type": "$t-svc.slug",
                "properties": { "language": "Go",
                                "depends-on": ["$s-order.slug"] }}},
    { "id": "r-op",  "method": "POST", "href": "/api/refs",
      "body": { "from": "$s-order.slug", "to": "$s-pay.slug", "role": "uses" }}
  ]
}
```

**Response (200):**
```json
{
  "atomic": true,
  "rolled_back": false,
  "results": [
    { "id": "t-svc",  "status": 201, "headers": { "Location": "/api/types/service" },          "body": { ... }},
    { "id": "s-order","status": 201, "headers": { "Location": "/api/sections/order-service" }, "body": { ... }},
    { "id": "s-pay",  "status": 201, "headers": { "Location": "/api/sections/payment-service" },"body": { ... }},
    { "id": "r-op",   "status": 201, "headers": { "Location": "/api/refs/42" },                "body": { ... }}
  ]
}
```

**Token semantics — whole-leaf only**:
- `$opid.slug` substitutes a **string** (the created resource's slug)
- `$opid.id` substitutes an **integer** (the created resource's numeric id; for refs, this is the ref id)
- Tokens embedded inside a larger string (`"prefix-$s1.slug"`) are NOT substituted — they pass through literally.

**Per-op `if_match`** (literal ETag, no back-ref tokens):
```json
{ "id": "patch-pay", "method": "PATCH", "href": "/api/sections/payment-service",
  "if_match": "W/\"abc1234567890def\"",
  "body": { "title": "Payment Service v2" }}
```
If you need a freshly-created resource's ETag, run the create in one batch, then issue the PATCH in a separate batch (or as a direct call).

---

## 6. Section edit — `PATCH` with `If-Match` + `Idempotency-Key`

Every PATCH/DELETE/POST-move against an existing section, type, or ref **requires** `If-Match`. Stale ETag → `412 etag-mismatch` with the current `_etag` in the response body. Recovery: refetch, three-way-merge into the new version (AI clients MAY auto-merge; the UI never does), retry with the new `If-Match`.

```http
PATCH /api/sections/api-acme-com HTTP/1.1
Content-Type: application/json
If-Match: W/"a1b2c3d4e5f60718"
Idempotency-Key: 1f8e3b2c-4d5a-6b7c-8d9e-0f1a2b3c4d5e

{ "title": "api.acme.com (v3 cluster)",
  "properties": { "tls": true, "protocol": "https" } }
```

**Response on stale ETag (412):**
```json
{
  "type": "/errors/etag-mismatch",
  "title": "ETag mismatch",
  "status": 412,
  "detail": "If-Match header does not match the current ETag",
  "instance": "/api/sections/api-acme-com",
  "current_etag": "W/\"f9e8d7c6b5a40391\""
}
```

The error discriminator is `type` (its tail segment after `/errors/` matches the error-code list in `design/api.md` §8). The wire format has no top-level `code` field — read `type` instead.

**Three-way merge** (server-current ⨯ your intended write ⨯ original-base): if no field both you and the server changed, replay your write with the new `current_etag` as `If-Match` and a fresh `Idempotency-Key`. Otherwise surface the conflict — don't blindly overwrite the server's newer field.

**PATCH semantics for `properties`**: shallow merge by key. Explicit `null` deletes a key.

---

## 7. Error recovery — read the `hint`

Problem+JSON errors carry one or both of: top-level `hint` for request-level issues, or `errors[].hint` for field-level. Always follow the hint.

```json
{
  "type": "/errors/validation",
  "title": "Validation failed", "status": 422,
  "detail": "1 field failed validation",
  "instance": "/api/sections",
  "errors": [
    { "field": "type", "code": "ref-unresolved",
      "message": "type \"no-such-type\" does not exist",
      "hint":    "/api/types" }
  ]
}
```

**Field-level required-ref unresolved** → either create the target via batch, or `GET /api/search?q=<value>` (which is what the `hint` will point at when the missing field is a `ref`/`multi-ref` property).

**Top-level `precondition-required` (428)** → you forgot `If-Match`. Refetch the resource, capture `ETag`, retry.

**Top-level `idempotency-conflict` (409)** → same `Idempotency-Key` with a different body. Either you regenerated the body unintentionally (use a deterministic key), or change the key.

**Failed writes burn their idempotency key.** The 24h replay cache holds the response for the key, whatever the status. Blind retry with the same key replays the same 4xx. The right recovery is *fix the underlying issue, mint a fresh key, retry* — that's an explicit "I fixed it, here's a new intent." This is enforcement, not a hint: it stops silent succeed-and-drift when an agent retries a previously failed write under shifting state.

---

## 8. Reviewing comments and proposing edits

When a human leaves open comments on a section, address them by **batching** the section edit and the comment-resolves together. Atomic mode guarantees you never end up with comments marked `resolved` against a section that didn't actually update.

### 8.1 Discover open comments

Two scopes, same shape:

**Per section** — follow `currentSection._links.comments`. Filter to open with `?resolved=false`. Add `?anchor=p-2` to scope to a specific paragraph.

```http
GET /n/<notebook>/api/sections/api-acme-com/comments?resolved=false HTTP/1.1
Accept: application/hal+json
```

**Whole notebook (inbox view)** — follow `rootDoc._links.comments` (templated). One request returns open comments across every section, each item carrying an inlined `section: { slug, number, title }` so you don't have to fan out. Pair `?since=<unix-seconds>` with your last-poll timestamp for "what's new" polling. Default limit 50, max 200.

```http
GET /n/<notebook>/api/comments?resolved=false&since=1779380000 HTTP/1.1
Accept: application/hal+json
```

Per `design/api.md` §5.9 / §5.9.1 each item carries `id`, `section.slug`, `anchor`, `body`, `author`, and its own `_etag` — keep the `_etag` values, you'll need them in the batch.

### 8.2 Read what each comment is about

- `anchor: "section"` — about the whole section. The default when authors omit `anchor`.
- `anchor: "p-N"` — about a specific paragraph (0-indexed top-level `<p>` at the time the comment was last written). Locate it by scanning the section's `html` for `<p data-anchor="p-N">…</p>` — the link scanner stamps these on every save.
- `body` is markdown source (paragraphs, bold, italic, code, lists, blockquotes, http(s) links only — same allowlist as section decks).

Anchor regex on the wire: `^section$|^p-\d+$`. Anything else → `422 validation` with `errors[0].code = "anchor-unsupported"`.

### 8.3 Decide per comment

- **Address with an edit** — fold the feedback into the section's `html`/`properties` and resolve the comment in the same batch.
- **Reply / out of scope** — POST a new comment with your reasoning; leave the original open. Single POST, no batch.
- **Already true** — PATCH the comment to `resolved: true` with no section edit. Single PATCH, no batch.

### 8.4 Atomic propose-and-resolve via `/api/batch`

One transactional batch: PATCH the section with the new HTML (the link scanner re-stamps `data-anchor` values on save — adding or removing paragraphs renumbers downstream anchors, which is fine because the comment-resolve ops in the same batch don't reference them) and PATCH each addressed comment to `resolved: true`. Fetch fresh ETags for the section and every comment immediately before composing — batch `if_match` values are literal, no `$opid._etag` back-refs (see §5.5).

```http
POST /n/<notebook>/api/batch HTTP/1.1
Content-Type: application/json
Idempotency-Key: 7c4f2c1e-9d8b-4f3c-b1a2-3e5f6c7d8e9f
Arch-Author: claude

{
  "atomic": true,
  "ops": [
    { "id": "edit", "method": "PATCH", "href": "/api/sections/api-acme-com",
      "if_match": "W/\"a1b2c3d4e5f60718\"",
      "body": {
        "html": "<p>Public HTTPS entry point. WAF rate limits keyed on JWT sub claim apply at 60 req/min.</p><p>Behind the ALB, requests fan out to <arch-ref to=\"order-service\">Order Service</arch-ref>.</p>",
        "revision_message": "Address comments c-42 and c-43"
      }},
    { "id": "r1", "method": "PATCH", "href": "/api/comments/42",
      "if_match": "W/\"d4e5f6a1b2c30789\"",
      "body": { "resolved": true }},
    { "id": "r2", "method": "PATCH", "href": "/api/comments/43",
      "if_match": "W/\"f60718a1b2c3d4e5\"",
      "body": { "resolved": true }}
  ]
}
```

- Envelope `Idempotency-Key` covers the whole batch. Per-op `Idempotency-Key` → `idempotency-misplaced` 400.
- Each `if_match` is a literal weak ETag; back-ref tokens (`$opid.slug` / `$opid.id`) are whole-leaf only and don't include `_etag`.
- Atomic rollback: if any op fails (e.g. one comment's ETag is stale), the section PATCH rolls back too. Recover per §7 — refetch the failing resource, three-way-merge, resubmit the batch with a **fresh** `Idempotency-Key`.

### 8.5 Why this shape

- One round-trip; one revision row stamped with `revision_message` that names the comments it addresses.
- Comments resolve only if the edit lands — no orphan "fixed" markers on an unchanged section.
- History browsers see `"Address comments c-42 and c-43"` alongside the diff in `/api/sections/{slug}/revisions`.

### 8.6 When NOT to batch

- Replying to a comment you're rejecting — one `POST /api/sections/{slug}/comments`, no batch.
- Multi-step edits that need newly-created entities (e.g. add a new sibling section, then reference it from the body). Use one batch with `$opid.slug` back-refs to create + cross-link, then a **separate** batch (or direct PATCHes) to resolve the comments, because batch back-ref tokens don't expose `_etag` (§5.5) and you need a literal `if_match` on the resolve ops.

---

## Contract corners

Non-obvious surfaces you'll trip over if you don't read this list.

### Revisions — automatic, append-only

Every section create and PATCH appends a row to `/api/sections/{slug}/revisions` (POST-snapshot: the row captures the state AFTER your change). Revision numbers are monotonic per section starting at 1.

```http
PATCH /api/sections/api-acme-com HTTP/1.1
Content-Type: application/json
If-Match: W/"a1b2c3d4e5f60718"
Idempotency-Key: ...
Arch-Author: claude

{ "title": "api.acme.com (v3)", "revision_message": "Update title for v3 cluster" }
```

The response includes `revision_count` and `_links.revisions`. Follow the link to list history; follow each item's `_links.self` for the full historical snapshot. Diff isn't provided — section bodies are rich HTML, so render snapshots side-by-side. Idempotent replays don't double-insert (the cache returns the original response).

**Restore** rewinds a section to a previous snapshot in one call:

```http
POST /api/sections/api-acme-com/revisions/2/restore HTTP/1.1
Content-Type: application/json
If-Match: W/"a1b2c3d4e5f60718"
Arch-Author: claude

{ "revision_message": "Reverted v3 rename" }
```

The server copies revision 2's `title`/`deck`/`html`/`properties`/`tags` onto the live row, rescans refs, and appends a new revision (number = previous max + 1) tagged with your `Arch-Author` and `revision_message`. If you omit `revision_message`, the new revision's `message` is `"Restored from revision N"`. `If-Match` is required against the section's current `_etag` (428 missing, 412 stale with `current_etag`). 404 if the section or revision N doesn't exist. The response is the full section (embed=type,parent,refs,children) with `revision_count` already incremented.

**Notebook-wide history** (`_links.history` → `GET /api/history{?author,since,limit}`): one reverse-chron feed of every section's revisions across the notebook (per `design/api.md` §5.10), each item carrying `section: { slug, number, title }`, `revision`, `author`, `message`, `created_at`, and `_links.snapshot` → `/api/sections/{slug}/revisions/{n}`. Use it as a change log or "what changed since `since`" poll without fanning out per section. Surviving sections only — a deleted section's revisions are gone.

### Comments — flat, section-anchored, author-stamped

Every section carries `comment_count` (open comments only, where `resolved=false`) and `_links.comments`. Follow that link to list, then `_actions.create` to add one:

```http
POST /api/sections/api-acme-com/comments HTTP/1.1
Content-Type: application/json
Idempotency-Key: 01J9X...
Arch-Author: claude

{ "body": "Should we mention the WAF rate limits here?" }
```

The new comment is returned with its own `_etag`. `Arch-Author` is stamped onto the row as `author` (no auth — same trust model as on revisions). `anchor` defaults to `"section"` if omitted; that is the **only** legal value for now — paragraph-level anchors are reserved for a follow-up migration and a non-`"section"` value returns `422 validation` with `errors[0].field = "anchor"` and `errors[0].code = "anchor-unsupported"`. `body` is markdown source (raw); empty/whitespace-only or >4096 bytes (utf-8) → `422 validation` on `body`.

Toggle resolved or edit body via `PATCH /api/comments/{id}` (requires `If-Match` against the comment's `_etag`; 428 missing, 412 stale with `current_etag`). Delete via `DELETE /api/comments/{id}` (same `If-Match` rules). Comments don't show up in `?embed=` on a section, don't enter `/api/graph`, and aren't part of `/print` — they live in their own collection because they're conversational metadata, not architecture content.

### `_actions` schema discovery — four modes (per `design/api.md` §9)

1. **Inline** — `"schema": { "fields": [...] }` on the action itself. Used by `move`, `add-ref`.
2. **Static URL `schema_ref`** — `"schema_ref": "/api/types/<slug>#/property_schema"` — fetch and use that fragment.
3. **Sibling interpolation** — `"schema_ref": "$.type.property_schema"` — resolve against the parent resource. Used inside section `_actions.update` where the section already has `_embedded.type`.
4. **Request-body URI template** — `"schema_ref": "/api/types/{type}#/property_schema"` — substitute keys from the **body you're about to send** into the template, then fetch the result. Used by `add-child` and the collection-level `create` action. Algorithm: parse the template, for each `{var}` look up `body[var]`, expand, then GET the resulting URL and walk the fragment.

If a mode-4 `{var}` is missing from your body, the server returns `422 validation` pointing at `errors[0].field = "<var>"`. If `{var}` resolves to an unknown type slug, you get `422 validation` with `errors[0].code = "ref-unresolved"` and `errors[0].hint = "/api/types"`.

### `_embedded` vs `_links` — write discipline

`_embedded` is a snapshot at request time. If you intend to **write** an embedded resource, refetch via `_links.self` first to capture a fresh `ETag`. The embedded snapshot does carry `_etag`, but it may already be stale by the time your write arrives.

### `<arch-ref>` authoring form (per `design/api.md` §5.4.1)

Inside section `html` bodies, cross-references author as `<arch-ref to="slug">label</arch-ref>` (or `<arch-ref to="slug" role="uses">label</arch-ref>`). The server scans every section save with a **lenient parser**:

- Either attribute order (`to` first or `role` first)
- Either quote style (`"` or `'`)
- Optional whitespace around `=`
- Both self-closing (`<arch-ref to="x" />`) and paired forms accepted
- `to` value must match `^[a-z0-9-]+$`
- ONLY `to` and `role` attributes accepted — anything else → `422 arch-ref-malformed`
- Both attribute values must be quoted; lowercase attribute names only; no entity decoding

Unresolved `to` slugs do NOT fail the save — they surface in the response as `unresolved_refs[]` so the UI can render them as broken-ref placeholders.

### Cross-notebook refs — `@notebook` (notebook as a unit)

**Revised 2026-05-26.** References can point at OTHER notebooks as units (like library dependencies), not at sections inside them. Both `<arch-ref to="...">` in section bodies and `ref`/`multi-ref` property values accept the form.

```html
<arch-ref to="@platform" role="depends">Platform Notebook</arch-ref>
```

```jsonc
// In a section's properties, with a schema field {"key":"upstream","type":"ref"}:
{ "upstream": "@platform" }

// multi-ref accepts a mix of local slugs and @notebook refs:
{ "depends-on": ["order-engine", "@platform"] }
```

Authoring rules:
- Notebook-unit form matches `^@[a-z0-9][a-z0-9-]*$` (leading alphanumeric).
- Bare local slugs (no `@`) continue to resolve in the local notebook (unchanged).
- `<arch-ref to="@nb/section">` — section traversal across notebooks — is REJECTED with `422 arch-ref-malformed`. The same rule applies to property fields (validation error).

Resolved cross-refs appear in `GET /api/sections/{slug}/refs` with:

```jsonc
{ "to": "@platform",
  "to_notebook": "platform",
  "role": "depends",
  "source": "html",
  "_links": { "to": { "href": "/n/platform/api" } }}  // notebook root, not a section
```

Unresolved cross-refs surface in `unresolved_refs[]` with `notebook` and no `slug`:

```jsonc
{ "unresolved_refs": [
    { "notebook": "platform", "source": "html", "role": "depends" },
    { "notebook": "platform", "source": "property", "field": "upstream" }]}
```

**Convergence is automatic.** When notebook B is created, every other notebook is swept: any section whose persisted `unresolved_refs[]` mentions `notebook="B"` has those entries materialized into real `@B` edges in its refs table. Inverse on delete: removing notebook B demotes every `@B` edge in peer notebooks to an unresolved entry on the source section. Both happen after the local notebook-lifecycle commit; cross-DB writes are best-effort per the same eventual-consistency contract as before. Section creates/deletes inside a notebook do not affect cross-resolution — only notebook lifecycle does.

**No `refType` checks for notebook-unit refs.** `refType` is a section-type discriminator; a notebook isn't a single type. Cross-notebook property refs skip the refType check by design. Required `ref` fields with an unresolved `@nb` value still return `422 ref-unresolved`.

**Manual cross-refs are NOT supported.** `POST /api/refs` only takes local slugs. To create a cross-notebook ref, author it in `<arch-ref>` body text or set `@notebook` on a `ref`/`multi-ref` property.

### No section-scoped `/cross-inbound`

The section-scoped `cross-inbound` endpoint that shipped briefly in mid-2026 is removed. Section-level inbound across notebooks isn't coherent under notebook-as-unit refs — peer notebooks reference *this notebook*, not its individual sections. A notebook-level inbound endpoint (`GET /api/notebooks/{slug}/inbound`) is the follow-up shape.

### `POST /api/refs` — server stamps `source`

Refs created via `POST /api/refs` are stamped `source = "manual"` server-side. You cannot set `source` in the body; if you do, it's ignored. Refs discovered by the link scanner during a section save get `source = "html"` or `source = "property"` automatically.

### `DELETE /api/refs/{id}` on non-manual refs

Returns `422 ref-derived` with `hint = "/api/sections/<from-slug>"` and `message = "Edit the referencing section to remove this reference"`. To remove an html-sourced ref, PATCH the referencing section's `html` to drop the `<arch-ref>` element — the link scanner will diff it out atomically.

### `unresolved_refs[]` — what surfaces and what fails

In every section response:
```json
{ "unresolved_refs": [ { "slug": "nonexistent-target", "source": "html",     "role": "uses" },
                       { "slug": "missing-service",    "source": "property", "field": "routes-to" },
                       { "notebook": "platform",       "source": "html",     "role": "depends" }]}
```

- **Local entries** carry `slug` (the missing section in the current notebook).
- **Notebook-unit entries** carry `notebook` and no `slug` — the target is a peer notebook that isn't loaded.
- **Required** `ref`-typed property field unresolved → `422 ref-unresolved` (the save is rejected; the hint points at `/api/search?q=<value>` for local or `/n/<notebook>/api` for notebook-unit).
- **Optional** `ref`/`multi-ref` property field unresolved → save succeeds, target surfaces in `unresolved_refs[]`.
- Unresolved HTML refs (local or `@nb`) → save succeeds, surfaces in `unresolved_refs[]`.

`unresolved_refs` converges to one of exactly two observable states: a resolved edge in the `refs` table (visible via `GET /api/sections/{slug}/refs`), or an entry that stays in the section's `unresolved_refs[]` until the target appears. Deleting a local target re-surfaces the entry on every still-live referrer; recreating the slug re-resolves it. Creating/deleting a peer NOTEBOOK does the same for `@nb` entries via inter-notebook broadcasts (section-level lifecycle does not affect cross-resolution — only notebook lifecycle does). The list is honest on every GET; never inferred to be empty.

**Snapshot semantics inside an atomic batch.** A per-op response in a batch envelope is a snapshot at the time the op ran. If op X creates a section with `<arch-ref to=Y>` before op Y creates Y, X's response shows Y in `unresolved_refs[]` — but the edge resolves and is persisted before COMMIT. The source of truth for "did this ref land?" is the post-COMMIT `GET`, not the per-op snapshot. Treat the per-op `unresolved_refs[]` inside a batch response as a hint, not a verdict.

### `?fields=` projection

Projects top-level resource shape; does not change status, does not strip `_links`/`_actions`. Useful for listing/stat endpoints where you only need `slug,title,number`.

### Lean items vs full resource

Inside collection `_embedded.items[]` the section summary is intentionally narrow (slug, title, number, type slug). Follow each item's `_links.self` for the full resource with properties, refs, embedded type, etc.

### Batch atomic rollback signal

On `200` envelope responses, check the top-level `rolled_back` flag. If `true`:
- The failing op carries its real error body
- Ops not yet attempted at the moment of failure (dependents AND independents that hadn't started) carry `424 dependency-aborted`
- Ops that succeeded **before** the failing op carry their would-have-succeeded body (purely diagnostic — the writes were rolled back)

Recovery: locate the failed op in `results[]`, fix the underlying error, resubmit the entire batch with a **new** `Idempotency-Key`.

### `424 dependency-aborted`

In batch results when an upstream op failed (atomic or non-atomic). Body shape:
```json
{ "type": "/errors/dependency-aborted", "title": "Dependency aborted",
  "status": 424, "detail": "Upstream op failed", "instance": "/api/batch" }
```
Discriminate on `type` — there's no top-level `code` field.

### Inner batch op error bodies

Identical to direct-route Problem+JSON. A `422 validation` body inside a batch op result has the same `errors[]` shape you'd get from a direct PATCH/POST. A `424 dependency-aborted` body has no `errors[]`.

### Token type preservation in batch

Whole-leaf substitution **only**. `$opid.slug` → string. `$opid.id` → integer (not a stringified integer). Tokens embedded in larger strings pass through literally.

### Slugs are stable identifiers

Numbers (`1.2.3`) are computed server-side from `(parent, position, id)`. Never send numbers in writes; never store them client-side as a key.

### `PATCH /api` — the documented `If-Match` exception

Notebook config (`/api`) has no `_etag` and skips `If-Match` because it's single-writer single-row. PATCH accepts `{ title?: string, major?: number }` (setting `major` resets minor to 0). Empty body `{}` → 200 no-op with current values. Unknown top-level keys → `422 validation`.

### Search

`GET /api/search?q=<text>&types=<csv>&limit=<n>` (limit max 100, default 20). Empty `q` → `422 validation`. Matches case-insensitively against title, slug, deck, body HTML (tags stripped), properties (string values), and tags. Ranking: title-prefix > slug-prefix > title-contains > slug-contains > deck > body > properties/tags, tie-broken by `updated_at` desc. Each result carries `snippet` (HTML-escaped context with `<mark>…</mark>` around the hit, ~140 chars) and `snippet_field` naming which field matched. Results carry `_embedded.results[]` with each item's `_links.self`. `truncated: true` at the top level if results hit `limit`.

### Error code list

See `design/api.md` §8 for the canonical list:
`validation`, `etag-mismatch`, `precondition-required`, `idempotency-conflict`, `idempotency-misplaced`, `ref-unresolved`, `ref-derived`, `slug-conflict`, `slug-invalid`, `arch-ref-malformed`, `anchor-unsupported`, `backref-unresolved`, `dependency-aborted`, `cycle-illegal`, `type-in-use`, `payload-too-large`, `method-not-allowed`, `not-acceptable`, `not-found`, `internal`.

---

## Conventions checklist before sending any write

1. ✅ Discovered URL via `_links` / `_actions`, not constructed.
2. ✅ `Idempotency-Key` set on every mutating request. Envelope-only for `/api/batch`.
3. ✅ `If-Match` set on every PATCH/DELETE/POST-move (except `PATCH /api`).
4. ✅ For batch back-refs: `$opid.slug` for strings, `$opid.id` for integers, whole-leaf only.
5. ✅ For 412: refetch, merge, retry with new `If-Match` and fresh `Idempotency-Key`.
6. ✅ For 422 with `hint`: follow the hint URL before retrying.
7. ✅ Never construct numbers (`1.2.3`) in writes — they're computed.
