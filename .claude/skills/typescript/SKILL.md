---
name: typescript
description: Clean TypeScript code style for the Architecture Notebook — naming, types, structure, async, error handling, modules, tests, comments. Load alongside /ui-dev, /be-dev, or /fs-dev whenever writing or reviewing .ts in this project; the other skills assume these rules without restating them.
---

# Architecture Notebook — TypeScript Style

These are not preferences. They are the floor. Every `.ts` file in this repo follows them. `/ui-dev`, `/be-dev`, and `/fs-dev` build on top.

## Naming

- **`snake_case`** for variables, functions, parameters, properties on plain objects.
- **`PascalCase`** for types, type aliases, interfaces, and Lit class names (Lit forces class names).
- **`kebab-case`** for filenames and directory names.
- **Full words.** Never `r`/`e`/`v`/`n`/`i`/`x`/`obj`/`arr`/`tmp`. `result`, `error`, `value`, `count`, `index`, `item`, `next_index`, `worker_count`.
- **Lit/web-platform boundary exception:** Lit's API surface is camelCase (event names, lifecycle hooks, reactive-property JS names that mirror kebab-case HTML attributes — Lit owns the mapping). Custom-element attributes are kebab-case per HTML. Inside a Lit component, private helpers and local vars stay `snake_case`. Don't fight the framework at its API; do speak our style everywhere else.

## Types

- **Inferred returns** when TypeScript infers cleanly. Drop explicit `: T` on return types unless callers need a stable handle. Recover via `ReturnType<typeof fn>`.
- **`as const`** on returned literal objects, tuples, and config maps. Lets inference do the work.
- **`satisfies`** over annotations when you need to assert shape but want to keep the narrowest literal type.
- **No enums, no namespaces, no decorators.** They don't survive `--experimental-strip-types`. Use `const` objects + `keyof typeof` for enum-like sets. Lit decorators (`@property`, `@customElement`) are also out — use the equivalent static `properties` block and manual `customElements.define()`.
- **`readonly`** on immutable fields and shape properties.
- **`ReadonlyArray<T>`** in input positions; return concrete `T[]` only when callers mutate.
- **Discriminated unions use `kind`** for internal TS shapes. Not `type`, not `_t`, not `tag`. Just `kind`. (The wire API uses domain-specific discriminators — `role` on edges, `type` on sections, `code` on errors — defined in `design/api.md`. Don't confuse internal tags with wire fields.)
  ```ts
  type Edge =
    | { kind: 'uses'; from: string; to: string }
    | { kind: 'routes-to'; from: string; to: string; protocol: string };
  ```
- **`T | Failure`** over `Result<T, E>` boxes when failure is meaningful. The `Failure` shape is project-wide:
  ```ts
  type Failure = { readonly error: true; readonly code: string; readonly message: string };
  const is_failure = (value: unknown): value is Failure =>
    typeof value === 'object' && value !== null
    && (value as Failure).error === true
    && typeof (value as Failure).code === 'string';
  ```
  Pure transformations that can't meaningfully fail just return their value or throw — don't reach for `Failure` reflexively.

## Structure (tall and narrow)

- **Each `{` on its own line for control blocks** that have side effects or branches. One-liner arrow returns can keep `=>` on the same line.
- **No inline `try { ... } catch { ... }`** packed onto a single line. Each branch a block.
- **No inline `if (x) { return y; }`** packed onto one line. Statement per line.
- **One statement per line.** Don't `;`-chain or `,`-chain.
- **File caps**: under 60 lines preferred; 100 lines absolute. **Split, don't nest.** Helpers belong in their own files when a file grows past the cap. **Exemption**: when measuring a Lit component file, exclude the line span of `html\`…\`` template literals inside `render()` and template helpers (templates are declarative; splitting hurts readability). The rest of the file — imports, `properties`, lifecycle, event handlers, private methods — still counts toward the 100-line cap. Split sub-templates into pure render-helper functions in sibling files when a template grows large.
- **Composition over inheritance.** Prefer function factories that return frozen objects:
  ```ts
  export const create_dispatcher = <A extends Action>() => {
    const handlers = new Map<A['kind'], Handler<A>>();
    const register = /* ... */;
    const dispatch = async (action: A) => { /* ... */ };
    return Object.freeze({ register, dispatch } as const);
  };
  ```
- **Classes** are fine — but only for natural state-holding shapes (queues, emitters, Lit components). When you reach for a class, ask: is this state, or is this just grouped functions? If the latter, write a factory.
- **`#private` fields** in classes. No `private` keyword (it doesn't enforce anything at runtime).

## Async

- **Async generators** when they produce cleaner consumer code than imperative loops. Otherwise plain async functions.
- **No floating promises.** Every `Promise` is `await`ed, returned, or explicitly handled.
- **Concurrency is bounded.** Use `Promise.all` over fixed work; use a bounded worker-pool pattern (cap in-flight promises, preserve result order) for unbounded work.
- **No `setTimeout` for serialization.** If you're using sleep to "wait for something to finish," it's wrong.

## Errors

- **`T | Failure`** for meaningful business failures (validation, not-found, conflict).
- **`throw new Error(...)`** for programmer errors (bad arguments, illegal state, "this should never happen").
- **No `try/catch` that swallows.** Either handle it or rethrow with context. If you catch, do something useful with it.
- **Don't `catch (e: any)`.** `catch (error)` with `instanceof` narrowing.
- **No fallback paths for code that hasn't shipped yet.**
- **No `try` blocks around code you trust.** Internal calls and framework guarantees don't need defensive try.

## Modules

- **Three layers**, dependencies point downward only:
  - `lib/` (pure) — no I/O, no DB, no fetch. Easy to test.
  - `adapters/` (I/O) — DB, HTTP, filesystem.
  - `routes/` / `components/` (orchestration) — wires pure logic to adapters.
- **Dependency injection over singletons.** Every adapter takes its dependencies as constructor args or a `deps` bag. Never reach for module-level state holding a connection.
- **Side-effect-free module top-level.** `signal()` instances are the documented exception (web/store.ts).
- **`node:*` builtins only on the server.** The arch_notebook hard-constraint list (`lit`, `@lit-labs/signals`, `esbuild`, `@types/node`) is the entire dep allowance.

## Tests

- **`node:test` + `node:assert/strict`.** No other framework.
- **One `assert.deepEqual`** for shape assertions over multiple `assert.equal` per property. Compare the whole object.
  ```ts
  // good
  assert.deepEqual(result, { kind: 'ingress', slug: 'api-acme-com', tags: ['prod'] });
  // not this
  assert.equal(result.kind, 'ingress');
  assert.equal(result.slug, 'api-acme-com');
  assert.deepEqual(result.tags, ['prod']);
  ```
- **One behavior per `test()` block.** Use `describe()` only for grouping.
- **No order dependencies, no shared state.** Each `test()` arranges its own world.
- **Real adapters when feasible.** `:memory:` SQLite + real HTTP server. Mock only what you can't bring up locally (and document why).

## Comments

- Default: **no comments.** Names carry the meaning.
- Write one only when the **WHY is non-obvious** — a hidden constraint, a workaround, a non-trivial invariant. Never "what" comments.
- No docstrings that restate the signature.
- No file-header banners.
- No `// TODO` without a tracked issue.

## Architecture Notebook specifics (interactions with sibling skills)

| When you're writing… | The skill that owns the *shape* | The style still comes from here |
|---|---|---|
| Lit web components in `web/components/` | `/ui-dev` | snake_case helpers/vars; `#private` fields; `Object.freeze({...} as const)` for non-class factories |
| `server/routes/` + `lib/` + tests | `/be-dev` | three layers, DI bag, single `assert.deepEqual`, `T \| Failure` for validation results |
| API design (`design/api.md`, `skill/SKILL.md`) | `/fs-dev` | n/a — design lives in Markdown |
| Dispatcher / coordinator code | `/dev` | n/a — orchestration in prose |

If a rule here conflicts with framework reality (Lit naming), the framework wins at its surface. Everywhere else, this skill wins.

## Quick checklist before committing a `.ts` file

1. Variables are full words, `snake_case`. Types are `PascalCase`.
2. File ≤ 100 lines (preferably ≤ 60). Split helpers into their own files when not.
3. Returns inferred unless callers depend on the exact return type.
4. `as const` on returned literals; `satisfies` instead of annotation where it works.
5. Discriminated unions use `kind`.
6. No `try/catch` swallowing; no inline `try`/`if`/`return` on one line.
7. `T | Failure` for meaningful failure; `throw` for programmer errors.
8. Tests use `node:test`, one `assert.deepEqual` per shape, no shared state.
9. Zero comments — unless the WHY would surprise the next reader.
10. Imports from `node:*` for server; framework imports (`lit`, `@lit-labs/signals`) only in `web/`.
