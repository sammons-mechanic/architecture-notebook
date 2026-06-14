# Contributing

Thanks for the interest. This project is small, deliberately dependency-light, and opinionated. Read this once before sending a PR — it'll save a round trip.

## Quick start

```bash
pnpm install
pnpm dev          # server with --watch; writes the URL to data/.port
pnpm dev:web      # esbuild watch on web/main.ts → web/dist/main.js (separate terminal)
pnpm test         # node:test, 180+ tests
```

Server binds to `127.0.0.1` only. There is **no authentication** — never expose this to a network you don't control.

## What this project is

A local-first notebook for documenting system architectures. Three surfaces:

1. **HAL+JSON HTTP API** — spec in `design/api.md`, AI-facing skill in `skill/SKILL.md`.
2. **Lit + signals web UI** — `web/`, talks to the API.
3. **MCP server** — `/mcp/sse` + `/mcp/message`, exposes `batch_api` for MCP clients.

## Stack rules (read these before adding a dep)

- **Node 24+**. `.ts` runs directly via `--experimental-strip-types`. No transpile for the server.
- **`node:sqlite`** for storage. WAL mode. All writes inside transactions.
- **`node:http`** — no framework.
- **`node:test`** + `node:assert/strict` for tests.
- **esbuild** only for bundling `web/main.ts` → `web/dist/main.js`.
- **Browser deps**: `lit`, `@lit-labs/signals`. Server deps: zero.

If your PR adds a dependency, the PR description must answer: what does this give us that 30 lines of code wouldn't? "Convenience" is not an answer.

## Code style

`/typescript` skill is the canonical reference. The highlights:

- `snake_case` for variables and functions; `PascalCase` for types; `kebab-case` for filenames; full words, no abbreviations.
- No enums, no namespaces, no decorators. Lit uses the static `properties` block; `customElements.define()` is manual.
- `T | Failure` for validation, not throw-and-catch.
- One behavior per `test()` block; prefer a single `assert.deepEqual` per test.
- Module shape: pure `lib/` (no I/O), `adapters/` (DB/HTTP), `routes/` (HTTP handlers).
- No `try/catch` that swallows. Either handle or rethrow with context.
- No bare `console.log` in shipped code — use `server/lib/log.ts`.

## Spec discipline

Three artifacts have to stay in lock-step. If a PR changes any of them, it touches all three in the same commit:

| Change                                | Update                                                   |
|---------------------------------------|----------------------------------------------------------|
| New route, schema, or error code      | `server/`, `design/api.md` §relevant, `skill/SKILL.md`   |
| New UI pattern                        | `web/components/`, `design/mockup.html`                  |
| New section type or property kind     | `lib/validate.ts`, `design/api.md` §validation, `skill/SKILL.md`, UI renderer |
| New ref source (e.g. scanning a field) | `lib/links.ts`, `design/api.md` §5.4, tests              |

A drift between code and spec is a regression.

## Testing

- Unit tests in `test/`, integration tests in `test/integration/` (need Docker).
- Real SQLite, never mocked — every test uses `:memory:` seeded by running all migrations.
- Test through the HTTP boundary for routes. Test pure functions directly.
- ETag, idempotency, link-scanning, batch atomic rollback all have explicit coverage — extend the existing patterns rather than inventing new ones.

```bash
pnpm test                # unit tests
pnpm test:integration    # container-based integration tests (needs Docker)
pnpm test:watch          # rerun on file change
```

## Visual verification

Tests catch behavior; they do not catch a broken layout, a wrong color token, or a `/print` stylesheet that overflows the page. For any UI or print change, capture the surface and look at it. Headless Chrome in a Docker container does this with no local browser install and no project dependency — it is a `docker run`, not an npm package.

**1. Build the bundle and start the server.** The UI is served from `web/dist/`; if it is not built you will screenshot a "UI not built" fallback page.

```bash
pnpm build:web          # build the browser bundle once (or `pnpm dev:web` to watch)
pnpm dev                # own terminal: runs in the foreground, writes the URL to data/.port
pnpm seed:self          # another terminal, optional: fills a notebook to capture
```

Grab the URL the dev server wrote: `cat data/.port` → e.g. `http://127.0.0.1:46247`.

**2. Screenshot a UI view (PNG).**

```bash
mkdir -p shots
PORT_URL=$(cat data/.port)
docker run --rm --network host -v "$PWD/shots:/shots" zenika/alpine-chrome:124 \
  --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1440,1000 --virtual-time-budget=6000 \
  --screenshot=/shots/notebook.png \
  "$PORT_URL/#/n/architecture-notebook"
```

Open `shots/notebook.png`. `--virtual-time-budget` is how many milliseconds Chrome lets the Lit app fetch and render before it snapshots — raise it if a heavy view comes out half-painted.

**3. Capture the print view (PDF).** `/n/<slug>/print` is server-rendered HTML, so it needs no SPA render wait.

```bash
docker run --rm --network host -v "$PWD/shots:/shots" zenika/alpine-chrome:124 \
  --no-sandbox --disable-gpu \
  --print-to-pdf=/shots/print.pdf --no-pdf-header-footer \
  "$PORT_URL/n/architecture-notebook/print"
```

**Notes.**

- `--network host` is the Linux form. On macOS / Windows (Docker Desktop) drop it and point Chrome at `http://host.docker.internal:<port>` instead — the host loopback is not shared into the container there.
- `--no-sandbox` is required because Chrome runs as root inside the container. The `dbus` / sandbox lines it prints on stderr are harmless.
- Pin the image tag (`zenika/alpine-chrome:124`); any headless-Chrome image works, but do not run `:latest`.
- `shots/` is gitignored. Attach the before/after images to a UI PR rather than committing them.

## Adding a new route

1. Add the handler in `server/routes/<area>.ts`.
2. Register it in `server/wire-routes.ts` (per-notebook) or `server/wire-catalog.ts` (global).
3. Add `_links` / `_actions` wherever it becomes legal to follow.
4. Write tests covering the happy path and the 1-2 most likely error responses (422 / 404 / 412).
5. Document it in `design/api.md` and `skill/SKILL.md` in the same commit.

## Adding a new component

1. Re-read `design/mockup.html` to absorb the rhythm.
2. Pick the closest existing pattern (card, properties, edges, tree row) and copy its structure.
3. New section types get a `--type-<slug>` token in the same saturation family as the existing ones.
4. Keep the mockup updated when a component diverges — the mockup is source-of-truth, not aspirational.

## Migrations

- New schema goes in `server/migrations/NNN_<short_name>.sql`.
- Never edit a shipped migration. Add a new one.
- One transaction per migration. The runner advances `meta.schema_version` after each.

## Commits and PRs

- Commit subject: short title, lowercase past tense, scoped if useful (`/print:`, `/api:`).
- Commit body: explain the **why**, not the what. Diffs already tell you what.
- One logical change per commit. If two unrelated changes are bundled, split.
- PR description: link the relevant `design/api.md` section if you changed contract.
- Include `Co-Authored-By:` for AI-assisted commits when applicable.

## What not to PR

- New HTTP framework, ORM, query builder, validator, schema library.
- Puppeteer / Playwright in production code (test-only is fine if there's no alternative).
- React, Tailwind, CSS-in-JS, icon fonts, component libraries on the UI side.
- Decorators, enums, namespaces in TypeScript.
- `--no-verify` on commits, `--force` on shared branches.

## Where to look when something feels off

- API contract questions → `design/api.md`.
- "How does an AI write into this?" → `skill/SKILL.md` (or load `/notebook-api`).
- UI rhythm and patterns → `design/mockup.html`.
- Project-internal tooling → `.claude/skills/<area>/SKILL.md`.

## License

MIT. By contributing you agree your contributions are licensed under the same terms.
