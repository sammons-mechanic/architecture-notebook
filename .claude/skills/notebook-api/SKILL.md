---
name: notebook-api
description: Authoring contract for the running Architecture Notebook over HTTP. Load when you need to read, write, batch-mutate, or search a notebook from outside the UI — seed scripts, transcript-to-notebook converters, glue scripts, programmatic edits. Covers discovery, conditional writes, atomic batch, full-content search, comments/revisions, and error recovery.
---

# Architecture Notebook — API author skill

Companion to **`design/api.md`** (the canonical spec) and **`skill/SKILL.md`** (the AI-facing contract this repo ships). This skill is the operator's quick reference for hitting a *running* notebook from Bash/Node: where the server is, what URL shape to use, how the discovery + write loop actually goes.

If a detail conflicts with `design/api.md`, **api.md wins** — it's the spec, this is the cheat-sheet.

## 0. Where the server lives

- Dev server is bound to `127.0.0.1` only. Port is random (port `0`) — read it from `data/.port`:
  ```bash
  BASE=$(cat data/.port)         # e.g. http://127.0.0.1:60214
  curl -s "$BASE/api/health"     # { "ok": true }
  ```
- `data/.port` rewrites on every `--watch` reload — re-read it before each session.
- Multi-notebook server. The catalog lives at `BASE/api`; **each notebook is namespaced under `BASE/n/{slug}/api/...`**. Almost every hop you'll make uses the per-notebook prefix.

## 1. The five rules

1. **Discover URLs, never construct them.** Every link you need is in `_links` / `_actions` / `_embedded` on the response. RFC 6570 templates (`?q={q}`, `{?embed}`) expand from the body you're about to send.
2. **`If-Match` on every PATCH / DELETE / POST-move** against a resource that has an `_etag`. Skip only for `PATCH /api` (notebook config, single writer). Missing → `428 precondition-required`; stale → `412 etag-mismatch` (response includes `current_etag`).
3. **`Idempotency-Key` on every mutating request** — UUIDv4 or sha256-of-intent. Replay returns the cached response byte-for-byte for 24h. Same key + different body → `409 idempotency-conflict`. For `/api/batch`, the key goes on the **envelope only**; per-op keys → `400 idempotency-misplaced`.
4. **`Arch-Author: <name>`** stamps writer identity onto revisions/comments. No auth, no validation — just metadata. Use `claude` (or whatever you want) so humans can tell who wrote what.
5. **Slugs are stable, numbers (`1.2.3`) are computed.** Send slugs in writes; never send numbers; never persist numbers as keys.

## 2. Boot a session (3 round-trips)

Prime your cache before doing anything.

```bash
BASE=$(cat data/.port); NB=acme-trading

# 2a. Catalog root (lists notebooks, gives you the per-notebook root URL template)
curl -s "$BASE/api" | jq

# 2b. Notebook root — every link you'll use
ROOT=$(curl -s "$BASE/n/$NB/api")
echo "$ROOT" | jq '._links'
# →  self, sections, types, graph, search, batch, comments, print

# 2c. Full graph — slug ↔ number ↔ type for every section, plus every ref
curl -s "$BASE/n/$NB/api/graph" | jq '.nodes[:3], .edges[:3]'
```

After this you have: every URL template you need, the universe of valid slugs, and the ref topology. **Refetch only on 409 / 412.**

## 3. The verb map

| Action                          | Verb + URL                                     | Headers required                          |
|---------------------------------|------------------------------------------------|-------------------------------------------|
| Read a section + everything     | `GET …/api/sections/{slug}?embed=type,parent,refs,children` | `Accept: application/hal+json` |
| Read a type's property schema   | `GET …/api/types/{slug}`                       | —                                         |
| Create a section                | `POST …/api/sections`                          | `Idempotency-Key`, `Arch-Author`          |
| Patch a section                 | `PATCH …/api/sections/{slug}`                  | `If-Match`, `Idempotency-Key`, `Arch-Author` |
| Move a section                  | `POST …/api/sections/{slug}/move`              | `If-Match`, `Idempotency-Key`             |
| Delete a section                | `DELETE …/api/sections/{slug}`                 | `If-Match`, `Idempotency-Key`             |
| Create / patch / delete a type  | `POST/PATCH/DELETE …/api/types[/{slug}]`       | + `If-Match` on PATCH/DELETE              |
| Add a manual ref                | `POST …/api/refs`                              | `Idempotency-Key`                         |
| Drop a manual ref               | `DELETE …/api/refs/{id}`                       | `If-Match`, `Idempotency-Key`             |
| Search                          | `GET …/api/search?q=<text>&types=<csv>&limit=<n>` | —                                       |
| Batch (atomic or best-effort)   | `POST …/api/batch`                             | `Idempotency-Key` (envelope only)         |
| Patch notebook config           | `PATCH …/api` (no `_etag`, no `If-Match`)      | `Idempotency-Key`                         |
| List / resolve comments         | `GET …/api/sections/{slug}/comments?resolved=false` | —                                    |
| Restore a revision              | `POST …/api/sections/{slug}/revisions/{n}/restore` | `If-Match`, `Idempotency-Key`         |

`…/api` always means `BASE/n/{notebook}/api` unless the row says `…/api/notebooks` (catalog).

## 4. Single-write recipe

The pattern, end-to-end, in 8 lines of bash:

```bash
# 1. fetch the resource → grab the ETag header
ETAG=$(curl -sI "$BASE/n/$NB/api/sections/api-acme-com" | awk -F': ' '/^[Ee][Tt][Aa][Gg]/{print $2}' | tr -d '\r')

# 2. PATCH with that ETag and a fresh idempotency key
curl -s -X PATCH "$BASE/n/$NB/api/sections/api-acme-com" \
  -H "Content-Type: application/json" \
  -H "Accept: application/hal+json" \
  -H "If-Match: $ETAG" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Arch-Author: claude" \
  -d '{"title":"api.acme.com (v3)","revision_message":"v3 cluster cut-over"}'
```

Field-level errors come back as `application/problem+json` with `errors[]`. **Always read the `hint`** — it's a URL that recovers (see §7).

## 5. Batch — the workhorse

`POST /api/batch` runs N ops in one SQLite transaction (or best-effort if `atomic: false`). Inside a batch you can reference an upstream op's output via `$opid.slug` (string) or `$opid.id` (integer). Whole-leaf substitution only — `"$opid.slug"` works, `"prefix-$opid.slug"` does not.

```jsonc
POST /n/acme-trading/api/batch
Content-Type: application/json
Idempotency-Key: <uuid>
Arch-Author: claude

{
  "atomic": true,
  "ops": [
    { "id": "t-svc", "method": "POST", "href": "/api/types",
      "body": { "slug": "service", "name": "Service",
        "property_schema": { "fields": [
          { "key": "language",   "type": "string" },
          { "key": "depends-on", "type": "multi-ref", "refType": "service" }
        ]}}},
    { "id": "s-order", "method": "POST", "href": "/api/sections",
      "body": { "slug": "order-service", "title": "Order Service",
                "type": "$t-svc.slug",                                 // ← string substitution
                "properties": { "language": "Go" }}},
    { "id": "s-pay",   "method": "POST", "href": "/api/sections",
      "body": { "slug": "payment-service", "title": "Payment Service",
                "type": "$t-svc.slug",
                "properties": { "language": "Go",
                                "depends-on": ["$s-order.slug"] }}},   // ← whole leaf inside array
    { "id": "r-uses", "method": "POST", "href": "/api/refs",
      "body": { "from": "$s-order.slug", "to": "$s-pay.slug", "role": "uses" }}
  ]
}
```

**Atomic rollback signal.** The envelope is always `200`. On failure: `body.rolled_back === true`, the failing op carries the real error, dependents carry `424 dependency-aborted`, and successful pre-failure ops carry their would-have-succeeded body (diagnostic only — the writes were rolled back). Recover, then resubmit with a **new** `Idempotency-Key`.

**ETags inside batch.** `if_match` on a batch op is a literal weak ETag (e.g. `"W/\"a1b2…\""`); back-ref tokens do not expose `_etag`. Fetch fresh ETags immediately before composing.

## 6. Search

```bash
curl -s "$BASE/n/$NB/api/search?q=RS256&limit=20" | jq '._embedded.results[0]'
```
```jsonc
{
  "slug": "service-order-engine",
  "title": "Order Engine",
  "type": "service",
  "number": "3.1",
  "snippet": "…All inbound requests carry a JWT issued by Auth0 <mark>RS256</mark>.",
  "snippet_field": "body",                  // title | slug | deck | body | properties | tags
  "_links": { "self": { "href": "/api/sections/service-order-engine" } }
}
```

Matches against **title, slug, deck, body HTML (tags stripped), properties (string values flattened), tags**. Ranking: title-prefix > slug-prefix > title-contains > slug-contains > deck > body > properties/tags, tie-broken by `updated_at` desc. `snippet` is HTML-escaped with `<mark>` around the hit. `truncated: true` at the top level when results hit `limit`.

Filter by type: `&types=service,queue`. Empty `q` → `422 validation`. LIKE wildcards in `q` are escaped server-side.

## 7. Error recovery — read the `hint`

Problem+JSON shape:
```jsonc
{
  "type": "/errors/validation",
  "title": "Validation failed", "status": 422,
  "detail": "1 field failed validation",
  "instance": "/api/sections",
  "hint": null,
  "errors": [
    { "field": "type", "code": "ref-unresolved",
      "message": "type \"no-such-type\" does not exist",
      "hint": "/api/types" }
  ]
}
```

| Code                    | What happened                          | Recovery                                                                                                |
|-------------------------|----------------------------------------|---------------------------------------------------------------------------------------------------------|
| `precondition-required` | Missing `If-Match` on a PATCH/DELETE   | Refetch, capture `ETag`, retry.                                                                         |
| `etag-mismatch`         | Your `If-Match` is stale (412)         | Refetch (response has `current_etag`), three-way-merge with your intended change, retry with new keys.  |
| `idempotency-conflict`  | Same key + different body              | Either you regenerated the body unintentionally (use deterministic key) or change the key.              |
| `idempotency-misplaced` | Per-op `Idempotency-Key` inside batch  | Move the header to the envelope.                                                                        |
| `ref-unresolved`        | A ref/`multi-ref` field points nowhere | Follow `errors[].hint` (`/api/search?q=<value>`), or create the target via batch first.                 |
| `ref-derived`           | Tried to delete a scanned ref          | Edit the referencing section's `html`/properties to remove the `<arch-ref>`; the scanner diffs it out.  |
| `arch-ref-malformed`    | Bad `<arch-ref>` syntax in `html`      | Fix the tag (only `to` and `role` attrs; quoted; lowercase). See §5.4.1 in `design/api.md`.             |
| `cycle-illegal`         | `POST .../move` would loop the tree    | Pick a different parent.                                                                                |
| `slug-conflict`         | Slug already exists                    | Pick another slug or load the existing one via `GET …/api/sections/{slug}`.                             |
| `dependency-aborted`    | Upstream batch op failed (424)         | Fix the upstream failure, resubmit the whole batch with a fresh `Idempotency-Key`.                      |

`design/api.md` §8 has the canonical list.

**Failed writes burn their idempotency key.** The 24h replay cache holds the response for the key regardless of status — blind retry replays the same 4xx. The right recovery after a failure is *fix the underlying issue, mint a fresh key, retry*. That signals "I addressed the cause, here's a new intent" instead of looping on a stale request.

## 8. Type-driven properties

Sections of type `T` validate their `properties` against `types[T].property_schema`. Five field types:
- `string` / `number` / `boolean` — primitives.
- `enum` — value must be in `enum[]`.
- `ref` / `multi-ref` — value(s) must be existing section slugs; `refType` (if set) narrows to that section type.

Unknown keys are stripped (not errored). Missing `required` → `422 validation`. Unresolved `ref`/`multi-ref`:
- **Required** ref unresolved → `422 ref-unresolved` (save rejected).
- **Optional** ref unresolved → save succeeds; target surfaces in `unresolved_refs[]` on the response.

Sample property schema:
```jsonc
{
  "fields": [
    { "key": "domain",   "type": "string",    "required": true },
    { "key": "protocol", "type": "enum",      "required": true, "enum": ["http","https","grpc","tcp"] },
    { "key": "tls",      "type": "boolean" },
    { "key": "routes-to","type": "multi-ref", "refType": "service" }
  ]
}
```

## 9. Cross-references inside section bodies

Authors write `<arch-ref to="slug">label</arch-ref>` (optionally `role="uses"`). The link scanner runs on every section save:
- Lenient parser: either attribute order, either quote style, optional whitespace around `=`, self-closing or paired.
- Only `to` and `role` attributes. Anything else → `422 arch-ref-malformed`. Values must be quoted.
- Unresolved `to` slugs do **not** fail the save — they surface in `unresolved_refs[]`.
- `unresolved_refs` converges to either a resolved edge in the `refs` table or a persisted entry on the section row. Deleting a target re-surfaces the entry on every live referrer; recreating the slug re-resolves it. Every GET reflects the current state.
- **Inside an atomic batch, per-op responses are snapshots.** If op X creates a section whose html refs op Y's slug, X's per-op `unresolved_refs[]` will still list Y — but the edge resolves before COMMIT and is honest on the post-COMMIT GET. Trust the read, not the per-op snapshot.
- Refs whose source is `html` or `property` cannot be deleted via `DELETE /api/refs/{id}` — edit the referencing section instead.

Manual refs created via `POST /api/refs` are stamped `source: "manual"` server-side; you cannot set `source` in the body.

## 10. Comments + revisions

**Comments** are flat per section. `GET …/api/sections/{slug}/comments?resolved=false` lists open ones; each carries its own `_etag`. The notebook-wide inbox lives at `…/api/comments?resolved=false&since=<unix>` and inlines `section: { slug, number, title }` on each item. PATCH toggles `resolved` or rewrites `body` (markdown source); `If-Match` required. `body` ≤ 4096 bytes utf-8. Comments don't appear in `?embed=`, `/api/graph`, or `/print`.

**Revisions** are automatic: every section create/PATCH appends a snapshot. Section response carries `revision_count` and `_links.revisions`. Idempotent replays don't double-insert. Restore a previous snapshot with one call:
```http
POST /api/sections/{slug}/revisions/{n}/restore
If-Match: W/"<current-etag>"
Idempotency-Key: <uuid>
Arch-Author: claude

{ "revision_message": "Reverted v3 rename" }
```

## 11. Writing into a section's body

`html` is rich HTML, trusted (no XSS protection — local-only single-user). The link scanner parses it for `<arch-ref>` tags and stamps `data-anchor="p-N"` on every top-level `<p>` so paragraph-level comments can target them. Adding/removing paragraphs renumbers `data-anchor` downstream — fine, because comments addressed in the same batch don't reference them.

Embedded HTML (figures, mockups, wireframes) using inline `var(--accent)` etc. works because the print/render layers inject the design tokens. Just author with the tokens — don't hard-code colors.

## 12. Pre-flight checklist

Before sending any write, verify:
1. ✅ URL discovered via `_links` / `_actions`, not constructed.
2. ✅ `Idempotency-Key` set (envelope-only for batch).
3. ✅ `If-Match` set on every PATCH/DELETE/POST-move (except `PATCH /api`).
4. ✅ `Arch-Author` header set so humans can attribute the change.
5. ✅ For batch back-refs: `$opid.slug` for strings, `$opid.id` for integers, whole-leaf only.
6. ✅ For 412: refetch, merge, retry with fresh `If-Match` and fresh `Idempotency-Key`.
7. ✅ For 422 with `hint`: follow the hint URL before retrying.
8. ✅ Never construct numbers (`1.2.3`) in writes — they're computed.

## Pointers

- **Spec**: `design/api.md` — schematic, all walkthroughs, complete error/action lists.
- **AI-facing contract (this repo ships)**: `skill/SKILL.md` — same shape as this skill but framed for external AI authors. Read for the longer-form walkthroughs.
- **Seed scripts** (real working examples): `server/seed-self.ts`, `server/seed.ts`, `scripts/seed-wireframes.mjs`.
- **Backend internals** (when something is wrong): `/be-dev` skill + `server/` source.
