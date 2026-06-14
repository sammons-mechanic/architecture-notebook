---
name: fs-dev
description: Full-stack design judgment for the Architecture Notebook — taste for API shapes that simplify the UI and the backend at the same time. Load when designing or changing the contract at the seam (design/api.md, skill/SKILL.md, schemas, hypermedia, concurrency, error shapes, batch semantics, schema-driven UI). For implementation once a shape is settled, hand off to /ui-dev or /be-dev.
---

# Architecture Notebook — Full-Stack Design

You are at **the seam**. The contract between the UI and the backend is the most expensive interface in this codebase — every byte shapes code on both sides. This skill is taste-encoded: choose API shapes that make BOTH sides write less code.

If a shape is already settled, load `/be-dev` for server work or `/ui-dev` for visual work. For code style across the entire project, load `/typescript`. Come here when you're deciding the shape itself.

## The frame

The API is not "what the backend exposes." It's the **agreement** that determines whether either side can be simple. Most complex UI is a workaround for an awkward response. Most awkward server logic is a workaround for a UI that asks the wrong question. The skill is recognizing this and pushing back.

Three rules of thumb the project lives by:

1. **Sum the cost.** Every API decision pays a cost in UI complexity AND BE complexity. The right call minimizes the *sum*.
2. **The 5-line test.** For any operation, ask: how many lines must the AI client write? How many must the UI write? If either is >5 for the common case, the API is wrong.
3. **Drift is a bug.** If the UI and the BE both know something the API doesn't carry, the next change breaks one of them.

Canonical artifacts you keep aligned:
- **`design/api.md`** — the contract.
- **`skill/SKILL.md`** — the AI's view of the contract. Bumps in lock-step with `design/api.md`.
- **`design/mockup.html`** — if a shape change affects how the UI must render, the mockup updates too.

Two of three updated without the third = drift, and the next change catches fire.

## The principles, with receipts

### 1. Hypermedia eliminates URL construction
HAL `_links` / `_actions` mean the UI never builds a URL from a template. New endpoints become reachable as soon as a resource's links list them.
- **UI cost saved:** route tables, URL helpers, breakage on URL change.
- **BE cost:** centralized emitter in `server/hal.ts`.
- **Receipt:** `design/api.md` §2, §5.2.

### 2. The schema travels with the resource
Section types carry `property_schema` inline. The same JSON drives server validation, the UI's form rendering, and AI client writes.
- **One source of truth.** Adding a property is a one-line schema edit; both sides keep working.
- **UI cost saved:** hand-built per-type forms.
- **BE cost saved:** client-side validators.

### 3. Compute when derivation is cheap; store when it isn't
Section numbers (`5.1.1.1.1`) are computed from tree position on every read. Storing them would force a renumber pass on every move and would drift the first time a path missed it. Conversely, edge counts ARE stored on read (one query) rather than recomputed in two places.
- **UI cost saved:** never renumbers locally.
- **BE cost:** O(n) walk; trivial for this app.

### 4. ETags + If-Match make concurrency a non-issue
Optimistic concurrency, RFC-standard, easy to test. UI shows "this changed, here's the new version" on 412 instead of silently losing edits.
- **UI cost:** one 412 handler in `store.ts`, not per-form.
- **Anti-pattern killed:** last-write-wins (invisible data loss).

### 5. Idempotency keys make retries safe
Mutating clients generate a ULID and get at-most-once semantics. The UI never tracks "is this request in flight?"; it retries on network errors.
- **UI cost saved:** in-flight state machines, double-submit guards.
- **BE cost:** 24h key cache (`server/idempotency.ts`).

### 6. Batch eats N round-trips
`POST /api/batch` with `$opid.slug` back-references turns "type + 3 sections + 5 edges" into one transactional request.
- **AI cost saved:** no chain of awaits, no partial-failure logic.
- **UI cost saved:** subtree drag-reparent = one call.
- **BE cost:** one extra endpoint, one transaction wrapper.

### 7. Errors are recoverable instructions, not strings
Every 422 carries `errors[].hint` — a follow-link the client can act on. Unresolved-ref errors point at `/api/search?q=...`. Clients don't parse messages; they follow.
- **UI cost saved:** one generic error component (code + message + clickable hint).
- **AI cost saved:** doesn't have to guess recovery.

### 8. Lean by default, embed on request
Section responses are small by default. `?embed=type,parent,refs,children` opts into a full payload — the section view fires one request for a full render; the sidebar tree fires one request.
- **UI cost saved:** no waterfalls.
- **BE cost:** a switch on a query param, not multiple shapes.

### 9. Slugs in URLs, not ids
Every reference, URL, and cross-link uses the human-meaningful slug. Numeric ids stay inside the server.
- **UI cost saved:** shareable URLs, comprehensible logs.
- **BE cost:** slug uniqueness — already in schema.

### 10. UI state that's worth sharing goes in the URL
Hash routes: `#/section/<slug>`, `#/section/<slug>/glimpse/<s1>/<s2>/<sN>?c=<i>`, `#/toc`, `#/print`. The glimpse stack lives in the URL nested under the section being viewed (so closing the glimpse returns to context). The cursor `c` and stack are *derived* from the URL, not stored separately. Segments are URL-encoded and `/`-separated so slug character classes don't restrict the format. A teammate can paste a deep navigation chain.
- **UI cost saved:** no parallel state to sync.
- **Test:** "Could I want to share this link?" If yes → URL.

### 11. One way to do any one thing
Don't expose two endpoints for the same change. Create-a-child is `POST /api/sections` with `parent`. Move is `POST /api/sections/{slug}/move`. They look different because they ARE different — move has reorder semantics. Don't fold them into a "smart" PATCH that does both based on field presence.

## Patterns we use, and what they cost each side

| Pattern | UI implication | BE implication |
|---|---|---|
| HAL `_links` / `_actions` | Generic follow-link rendering; no route table | One emitter in `server/hal.ts` |
| `?embed=` opt-in | Section view = 1 request; sidebar = 1 request | One join per embed name |
| ETag + If-Match | One 412 handler in `store.ts` | ETag rotated on save |
| Idempotency-Key | Retry on network error, no state | 24h cache, persisted |
| Batch w/ `$opid.slug` | Subtree ops = 1 call | One transaction wrapper |
| Problem+JSON + `hint` | Generic error component, clickable hint | Centralized `server/problem.ts` |
| Schema-driven forms | `<arch-property-form>` reads `property_schema` | `lib/validate.ts` uses same JSON |
| Slugs everywhere user-facing | Readable URLs; safe to rename behind aliases later | Unique constraint on `sections.slug` |
| Glimpse stack in URL | Browser back/forward; deep links | None — URL is client-only |
| Computed section numbers | Display only; no edits | One read-side walk |

## Anti-patterns to refuse

- **Smart PATCH that does many things.** Updating `properties` is fine. PATCH that also moves if you include `parent` is not — use `move`.
- **Two endpoints for one action.** Convenience routes that duplicate existing ones. Delete one.
- **Stringly errors.** "Invalid input" with no field, no code, no hint forces both sides to guess.
- **Client-only state that a user would want to share.** Goes in the URL.
- **Polling for state that hasn't changed.** This is a local single-user app; the legitimate refresh is "AI just wrote; UI re-reads `/api/graph`" — and the batch response can return the new snapshot to avoid the extra round-trip.
- **Duplicated validation rules.** If the UI has a regex the server also has, the next change drifts. Server returns the rule; UI applies it.
- **DB ids in URLs or refs.** Slugs are the contract.
- **List endpoints overloaded with feature-specific query params.** If the sidebar wants something special, `/api/graph` is its own endpoint — not a flag on `/api/sections`.
- **Sync writes the UI must reverse on failure.** Optimistic UI is fine; the failure response returns the canonical state — the UI replaces, doesn't undo.

## How a design decision propagates

Same change, three artifacts, both specialists:

### Adding a new section type
1. **Shape decision** (here): does it need any new property kind? Any new edge role conventions? Usually no.
2. **`design/api.md`**: no change (types are data, not API surface).
3. **`/be-dev`**: insert via `POST /api/types` or a migration.
4. **`/ui-dev`**: register a `--type-<slug>` color token. Type pill renders automatically.

### Adding a new `PropertySchema` field kind (e.g. `date`)
1. **Shape decision** (here): how does it serialize? How does the UI render it read-only AND editable? Does it need a `hint` shape for validation?
2. **`design/api.md` §9**: add to the `type` union.
3. **`skill/SKILL.md`**: document it for AI clients.
4. **`/be-dev`**: extend `lib/validate.ts`, add tests.
5. **`/ui-dev`**: add renderer in `arch-properties` + an input in the edit path.

### Adding an HTTP endpoint the UI consumes
1. **Shape decision** (here): is this discoverable from an existing resource's `_links`/`_actions`? If yes, that resource owns the link. If no, why is it needed?
2. **`design/api.md`**: add to resource hierarchy + walkthrough.
3. **`skill/SKILL.md`**: add to AI surface.
4. **`/be-dev`**: route + `_links`/`_actions` + tests.
5. **`/ui-dev`**: store action that follows the link.

### Renaming or deprecating a field, link, or action
1. **Shape decision** (here): `_deprecated: true` flag for at least one `schema_version`. Migration plan for both sides.
2. **`design/api.md` §10**: deprecation note.
3. **`skill/SKILL.md`**: mark deprecated; show replacement.
4. **`/ui-dev`**: migrate off before removal.
5. **`/be-dev`**: bump `schema_version` on removal.

## The checklist before any API change

1. Is there a way to do this without changing the API? Start here.
2. What does the AI client write to use it? If >5 lines for the common case, redesign.
3. What does the UI write to use it? Same.
4. Does it create a second way to do an existing thing? Delete the duplicate.
5. What state moves? New server state needs a migration. New UI state may belong in the URL.
6. What's the failure mode? Concurrency (412), conflict (409), validation (422 + hint).
7. Are `design/api.md` and `skill/SKILL.md` in the same commit?

## Top-level project quick reference

```sh
pnpm dev       # node --watch --experimental-strip-types server/index.ts
pnpm dev:web   # esbuild --watch web/main.ts → web/dist/main.js
pnpm test      # node --test --experimental-strip-types test/*.test.ts
```

Stack invariants (both sides):
- Node 24+, ESM, type-stripping. pnpm.
- Near-zero deps: `lit`, `@lit-labs/signals`, `esbuild`, `@types/node`.
- Server bound to `127.0.0.1`, unauth.

For deeper specifics: `/be-dev` (server, DB, API impl, tests) and `/ui-dev` (visual design, components, interactions).
