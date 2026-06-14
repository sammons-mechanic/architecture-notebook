---
name: dev
description: Top-level dispatcher for any change to the Architecture Notebook. Classifies the work, picks the right specialist(s), and either drives them sequentially or fans them out as parallel sub-agents. Load this first when a task could touch more than one side, when contract design is involved, or when wall-clock matters. For an obviously single-side task, skip this and load the specialist directly.
---

# Architecture Notebook — Dev Dispatcher

The specialists you'll route to:

- **`/fs-dev`** — full-stack design judgment. The seam between UI and BE. Loaded whenever the contract shape is in question.
- **`/be-dev`** — server implementation. Routes, schema, validation, link scanning, tests.
- **`/ui-dev`** — visual implementation. Components, design tokens, mockup.
- **`/typescript`** — code style. Naming, types, structure, async, errors, tests, comments. **Load alongside any specialist whenever the work involves writing or reviewing `.ts`** — the implementation skills assume these rules.

`/dev` decides who runs, in what order, and whether in parallel.

## Step 1 — classify in three questions

1. **Does it need a contract decision?**  New endpoint, new property kind, new error shape, new ref source, new field on a resource, deprecation, anything an AI client could observe → **yes**. Pixel tweak, rename inside one side, test backfill, internal refactor → **no**.
2. **Which sides ship code?**  UI only / BE only / both. Look at where the change actually lands.
3. **Are the sides independent enough to parallelize?**  Independent when the contract between them is already settled and each side has a clean "do not touch" boundary. Coupled when one side's choices shape the other's during implementation.

The dispatch matrix:

| Contract change? | Sides | Independence | Action |
|---|---|---|---|
| No  | UI only | n/a         | Load `/ui-dev` directly. |
| No  | BE only | n/a         | Load `/be-dev` directly. |
| No  | both    | independent | **Fan out**: `/ui-dev` + `/be-dev` in parallel. |
| No  | both    | coupled     | Sequential: pick the side that defines the interface, finish, then the other. |
| Yes | any     | n/a         | **Sequential, contract-first**: `/fs-dev`. Update `design/api.md` + `skill/SKILL.md`. Then dispatch implementation per the rows above. |

## Step 2 — execution patterns

### A. Single specialist (most common)
Invoke the specialist via the `Skill` tool and proceed. No coordination overhead, no agents.

### B. Sequential, contract-first
1. Load `/fs-dev`. Apply its 7-step checklist. Decide the shape.
2. Update `design/api.md` and `skill/SKILL.md` (and `design/mockup.html` if the shape changes how the UI must render). These are the brief for the next step.
3. Dispatch implementation. Usually `/be-dev` first so the UI has a real endpoint to call; if the UI can stub cleanly, you can also fan out.

### C. Parallel fan-out
Use when the contract is settled AND each side has enough independent work to justify the overhead. Spawn one **`general-purpose` Agent per side**, all in a SINGLE message with multiple Agent tool calls so they run concurrently.

Each child gets a self-contained brief — it has not seen the conversation. The brief must include:
- A one-line directive to load the specialist skill **and `/typescript`** first.
- The goal stated with that side's lens.
- The contract you can rely on (don't change).
- The exact file scope (and "do not touch" boundaries).
- What to report back.

Template:

> Load the `/be-dev` skill via the Skill tool before doing anything else.
>
> Goal: <one-line task statement>.
>
> Contract you can rely on (and must NOT change):
> - `<endpoint / response shape / slug / file boundary>`
> - …
>
> File scope you may touch: `<server/routes/foo.ts>`, `<server/lib/bar.ts>`, `<test/foo.test.ts>`.
> Do not touch anything outside this list.
>
> Read first: `design/api.md` §<N>, `.claude/skills/be-dev/SKILL.md`.
>
> When done, report (≤ 200 words): what changed, file by file; any surprise that affects the other side; tests added; anything you punted.

Then wait for both children. The Agent tool returns when each child completes — do NOT poll. Once both are back, reconcile in the main thread.

### D. When NOT to fan out
- Either side has only a few lines of work — overhead exceeds benefit. Do it inline.
- The sides need to negotiate during implementation — the contract was too coarse. Either tighten it (back to `/fs-dev`) or go sequential.
- The work touches shared files (e.g. a migration referenced by both BE tests and UI fixtures) — a merge would conflict. Sequential.
- You can't write a clean "do not touch" boundary for each child — they'll step on each other.

### E. Multi-layer DAGs (e.g. R3+R4+C1+C2+C3+C4)

When a feature splits into several quanta with dependencies, draw the DAG first and run independent layers in parallel:

```
Q1 (Arch-Author + revisions write)
 ├── R3 (restore endpoint)    ──┐   Layer 1: parallel
 ├── C1 (comments API)        ──┘
 │
 ├── R4 (revisions UI)        ──┐   Layer 2: parallel (after coord scaffold)
 ├── C2 (comments UI + md)    ──┘
 │
 ├── C3 (paragraph anchoring) ──┐   Layer 3: parallel
 └── C4 (AI workflow doc)     ──┘
```

Commit one layer per commit. Each layer's agents share the live filesystem but never the same lines, by construction.

**Coordination scaffolds** — before launching a parallel UI fan-out where both agents target shared real estate (right rail, foot-meta cards, a stylesheet), pre-stage the contract in the main thread:

- New signals in `web/store-signals.ts` (e.g. `revisionsPanelOpen`, `commentsPanelOpen`) so each agent has a private flag.
- A small helper module (e.g. `web/nav-rail.ts`) exporting `open_X_rail()` / `close_all_rails()` that enforce mutual exclusion. Agents call it; they don't reimplement the precedence.
- Delegation in the parent component: `arch-foot-meta` imports two children (`arch-foot-meta-revisions`, `arch-foot-meta-comments`) — each agent owns one file, no edits to the parent.
- Separate stylesheets per agent (`web/styles-revisions.css`, `web/styles-comments.css`) loaded by `web/index.html`. Each agent writes its own file with a class prefix (`.revisions-*` vs `.comments-*`) so styles can't collide.
- Pre-declare any shared response fields on the shared types (e.g. `Section.revision_count`, `Section.comment_count`) so agents don't ship inline casts.

If a parallel agent can't see what the other is shipping (e.g. C4 writes docs about a surface C3 is still building), instruct it to **flag open questions in its report instead of guessing**. Resolve in review.

## Step 3 — concrete examples

| Task | Dispatch |
|---|---|
| Tighten spacing under section headers | `/ui-dev` alone |
| Link scanner misses `role` on multi-word `<arch-ref>` | `/be-dev` alone |
| Rename `tier-0` tag to `tier-1` across the notebook | `/be-dev` alone (data migration) |
| Add `queue` section type with `engine` enum + `retention` number | No contract change. Fan out: `/be-dev` registers type + tests, `/ui-dev` adds `--type-queue` token. |
| Build the print view end-to-end | Contract settled (`/print` returns HTML). Fan out: `/be-dev` renders, `/ui-dev` styles. |
| Add inline images in section bodies | Contract decision (new property kind? new tag? sanitization?). Sequential `/fs-dev` → fan out. |
| Add a comments system on sections | Contract decision (new resource, ETag, hint shape). Sequential `/fs-dev` → fan out. |
| Move the glimpse stack into the URL | `/ui-dev` alone — state location was already decided in `/fs-dev` ("shareable state in URL"). |
| Migrate from `node:test` to `vitest` | Don't. Stop and ask the user — this is a stack change that contradicts a project invariant. |

## Step 4 — failure modes & recovery

- **Wrong specialist routed**: stop, load the right one, hand over the partial work. Cheap.
- **Fan-out child reports the contract needs to change**: stop the other child (its work is now built on a moving foundation). Return to `/fs-dev`, update the contract, re-fan-out with the new brief.
- **Children stepped on shared files**: the boundaries were wrong. Reconcile manually, tighten the next fan-out's scope.
- **Child returned a confident "done" but you suspect the work is incomplete**: don't trust the report — verify the diff. Children's reports are intent, not result.
- **Two files independently emit "the same" structure** (e.g. a cached root-doc builder and a live route's root-doc response): tests pass on both sides because each is tested independently, but the wire and the cache drift. Fix: consolidate at the definition site — one builder, the other site spreads `{ ...build_x() }` and layers on top. Drift is a bug (fs-dev principle 8).
- **`pnpm test` green but the live server still serves the old behavior**: the long-running detached process has stale code. Tests run in their own ephemeral servers; the dev server doesn't auto-reload migrations or new routes registered at boot. After ANY new endpoint, migration, or route registration, restart the live server before pointing the user at a URL. See Step 5.

### Review checklist — challenge sub-agents to simplify

When a child returns, scan the diff against this list before committing:

1. **3-line re-export aggregator with a single importer** — pure indirection. Delete the aggregator; have the importer reach directly into the source files.
2. **`BEGIN`/`COMMIT`/`ROLLBACK` around a single SQL statement** — SQLite auto-commits singletons; the txn is noise. Remove it.
3. **Inline cast for a field on a shared type** (`as { readonly x?: T } | null`) — the field belongs on the shared type definition. Add it there; remove the cast.
4. **Repeated `if (is_failure(x)) { send_problem(...); return; }` boilerplate** — acceptable when each branch has a different error code; a helper only earns its keep when applied ≥4 times.
5. **Two endpoints for one action** — see fs-dev principle 11. Convenience routes that duplicate existing ones go.
6. **File over the 100-line cap** — split. Lit `html\`…\`` template literals are exempt; everything else counts. The agent's "templates exempt" arithmetic is worth re-counting (`awk` outside `html`/backticks if you don't trust the number).
7. **A new dependency in `package.json`** — refuse and find a built-in way unless explicitly approved.

## Step 5 — reporting back to the user

Before reporting, run the close-out gates:

1. `pnpm test` — full suite, not just the new tests. Report pass count delta.
2. `node scripts/check-hypermedia.mjs` — exit 0.
3. `pnpm build:web` if the UI changed — report bundle-size delta vs the previous layer's baseline.
4. **Restart the live server** (`kill $(cat /tmp/arch-server.pid); rm data/.port; nohup node --experimental-strip-types ... &`) and `curl` one happy-path response for any new endpoint, migration, or route. The detached process has stale code until restart — green tests don't prove the URL you cite to the user actually works. This bit me; don't repeat it.
5. **For visible content (HTML embeds, rendered markdown, mockups inside section bodies): open the actual page and look at the pixels.** A 200 OK with the bytes you expected in the JSON response is not the same as "the browser parsed those bytes the way I intended." A literal `<s>` inside a `<code>` block is a strikethrough element; a literal `<arch-ref>` (no attrs) is a 422 from the link scanner. Escape `<`/`>`/`&` in any user-visible URL pattern or code sample before injecting into trusted HTML.

Then summarize in two short parts:

1. **What changed** — per side, the files touched, the gist of each.
2. **What's next** — follow-ups, drift to clean up, tests still missing, contract notes.

One paragraph per side maximum. No transcripts.

## Hard rules

- Don't fan out a job that's small enough for one specialist.
- Don't skip `/fs-dev` for any contract change, even "obvious" ones — the checklist catches what looks obvious but isn't.
- Don't load multiple specialists into the main context just because work touches multiple sides — fan them out. Specialist context belongs in specialist threads.
- Don't summarize specialist work without verifying the diff. Reports describe intent.
- When in doubt about classification, ask the user one targeted question before dispatching — wrong dispatch is more expensive than one extra turn.
- **Don't point the user at a URL on the live server without restarting it first** if your commit added an endpoint, migration, or route. The detached process is stale until you bounce it. Green tests don't substitute for "I actually hit it."
- When fan-outs share UI real estate or shared types, build the coordination scaffold in the main thread BEFORE launching (signals, delegation, separate stylesheets, pre-declared shared-type fields). The brief tells each agent it's coordinated; the scaffold makes it true.
- Commit one layer per commit when running multi-layer DAGs. Agents share the live filesystem within a layer; cross-layer history stays readable.
