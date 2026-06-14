---
name: ui-dev
description: Design system + Lit/signals conventions for the Architecture Notebook UI. Load when building, editing, or reviewing any web component, screen, or print surface in this project. Pairs with the canonical mockup at design/mockup.html.
---

# Architecture Notebook — UI Dev

Canonical mockup: **`design/mockup.html`**. Read it before changing anything visual; match its rhythm, density, and color use exactly. If a need can't be solved by reusing what's there, you're solving the wrong problem.

Code style: **`/typescript`** is the project's code-style skill — naming (`snake_case` helpers, `PascalCase` types, full words), `Object.freeze({...} as const)` factories, `T | Failure` shapes, single-`assert.deepEqual` tests. This skill assumes those rules; load `/typescript` alongside when writing or reviewing `.ts`. Lit's class+camelCase API surface is the documented exception (Lit wins at its boundary). **No decorators** — declare reactive properties via the static `properties` block; register elements via manual `customElements.define()`. Lit `render()` template bodies are exempt from the 100-line file cap (split sub-templates into pure render helpers in sibling files when they grow).

## Stack
Lit + `@lit-labs/signals` only. esbuild bundles the browser. Plain CSS (static stylesheets or `:host` styles). No React, no Tailwind, no CSS-in-JS, no icon fonts, no component libs. Components are kebab-cased, prefixed `arch-` (`arch-tree`, `arch-section`, `arch-glimpse`, …). Rich HTML bodies render via Lit `unsafeHTML` — input is trusted (local-only).

## Aesthetic in one line
Modern engineering reference. Single sans family, single accent color, warm-neutral surfaces, card-shaped components, ornament-free.

## Tokens (paste into `:root`)
```css
--bg:#fafaf9; --bg-soft:#f5f5f4; --bg-strong:#ebebe9; --bg-pane:#ffffff;
--border:#e7e5e4; --border-strong:#d6d3d1; --border-ink:#1c1917;
--text:#1c1917; --text-soft:#44403c; --text-muted:#78716c; --text-faint:#a8a29e;
--accent:#1d4ed8; --accent-soft:#3b82f6; --accent-bg:#eff6ff; --accent-edge:#bfdbfe;
--type-overview:#1c1917; --type-ui:#0891b2; --type-service:#16a34a; --type-integration:#7c3aed;
--type-cloud:#ea580c; --type-infra:#525252; --type-ingress:#dc2626; --type-egress:#ca8a04;
--type-domain:#0284c7; --type-secret:#9333ea; --type-auth:#0d9488;
--sans:'Geist',ui-sans-serif,system-ui,sans-serif;
--mono:'Geist Mono',ui-monospace,'SF Mono',monospace;
--measure:42rem; --masthead-h:56px;
```
Load Geist + Geist Mono via Google Fonts in the shell HTML. Weights 300–700. No serifs.

## Color rules
- Cobalt `--accent` is the **only** decorative color. Used for: cross-references, current sidebar row, active toggle, footnote markers, kicker on cover, primary CTA. Nothing else.
- Type dots (7px circles) only appear in tree rows, type-pills, and edge target lines. Never decoration.
- Stone-warm neutrals only. No pure black/white, no blue-gray.

## Type scale
- Section title (read): 2.4rem / 1.1 / -0.025em / w500
- Glimpse title: 1.4rem / 1.15 / -0.018em / w500
- TOC l1: 1.15rem / w500
- h3 in-section: 1.15rem / w500, mono `.h-num` prefix in `--text-faint`
- Body prose: 0.97rem / 1.65 / w400
- Deck: 1.02rem / `--text-muted`
- Tags + mono labels: 0.68–0.72rem mono / `--text-muted`
- Section meta number: 0.72rem mono / `--text`

Never: drop caps, italic decks, `§` prefix on numbers (use plain `5.1.1.1.1`), paper grain, decorative rules extending to the gutter.

## Layout
Read shell: `grid-template-columns: 288px minmax(0,1fr)` → adds `420px` when glimpse open. Transition `0.32s cubic-bezier(0.2,0.7,0.2,1)`. Masthead 56px, sticky, `backdrop-filter: blur(10px) saturate(1.1)`. Main column `padding: 3rem 4rem 8rem; max-width: calc(var(--measure) + 8rem)`. Sidebar + glimpse `position: sticky; top: var(--masthead-h)`. Under 1100px: tree hides, glimpse becomes fixed drawer.

## Component patterns

**Card** (`.props`, `.edges`): `bg-pane`, 1px `--border`, 8px radius, `overflow:hidden`. Header strip: `bg-soft`, `0.65rem 1rem`, mono 0.7rem `--text-muted`. Body rows divided by 1px `--border`; last 2 borderless.

**Properties** (`.props dl`): `grid-template-columns: 10rem 1fr`. `dt`: mono 0.74rem `--text-muted`, lowercase. `dd`: 0.88rem `--text`. 1rem horizontal padding outside, 0.8rem inside.

**Section meta strip** (`.section-meta`): mono 0.72rem flex row above the title — `number · type-pill · pipe · dateline`.

**Type pill** (`.type-pill`): inline-flex, `bg-soft` + 1px border, 4px radius, 0.7rem `--text-soft`, leading 7px type-color dot.

**Tag** (`.tag`): mono 0.68rem, `bg-pane` + 1px border, 4px radius, `0.18rem 0.5rem`.

**Tree row**: grid `14px | 1fr | auto` = chev · name · num. 0.32rem 0.55rem padding, 5px radius. Hover `bg-soft`. Current: `bg-accent-bg`, `color:--accent`, w500. Subtree: `border-left:1px solid --border`, `padding-left:0.45rem`. Chev rotates 90° via `transform`.

**Glimpse panel**: 420px, `bg-pane`, left border, sticky. Open animation: `translateX(20px→0)` + opacity over 0.32s. Header: label + 3× 26px square buttons (back/forward/close, `bg-soft` + border, 5px radius). Stack chips: mono 0.66rem, `bg-soft` chips separated by `→` arrows in `--text-faint`; current chip uses accent colors; chips are clickable to jump cursor.

**Edges card**: header has count pill (round 9px radius, `bg-pane` + border). Rows: grid `7rem | 1.2rem | 1fr | 1fr` = role · arrow · target · num. Target is clickable accent text.

**Reference** (`.ref`, inline): `color:--accent`, `border-bottom:1px solid --accent-edge`, `padding-bottom:1px`, `cursor:pointer`. Hover/active: `background:--accent-bg`, border-color `--accent`.

## Interactions

**Glimpse stack**: linear history `string[]` + cursor `number`. `push(id)` slices history to `cursor+1` then appends; `back/fwd` move cursor; `close` resets to `[]`/`-1`. Cycles allowed — no dedup. Stack chips render full history; clicking sets cursor.

**Ref binding**: every `[data-target]` (inline `.ref`, edge `.target`, refs-grid item) calls `glimpse.push(target)` on click. Mark every `.ref[data-target=ID]` with `.active` while it matches the current glimpse id.

**Tree expand**: chevron click toggles `.collapsed` on child `ul` + `.open` on chev. Persist open/closed in a signal so it survives view switches.

**View toggle**: three views — `read | toc | print`. Single `currentView` signal; render-time gate.

## Lit + signals conventions
- One Lit component per major block: `arch-masthead`, `arch-tree` (recursive `arch-tree-node`), `arch-section-view`, `arch-properties`, `arch-edges`, `arch-refs-grid`, `arch-glimpse`, `arch-toc`, `arch-print`, `arch-print-page`.
- Shared state in `web/store.ts` as exported `signal()` instances: `currentSectionId`, `currentView`, `glimpseHistory`, `glimpseCursor`, `tree`, `treeOpenState`.
- Components extend `SignalWatcher(LitElement)` from `@lit-labs/signals`.
- `<arch-ref to="section-id">label</arch-ref>` is the literal element authors write inside section HTML bodies. On click it calls `glimpseStore.push(to)`. Renders with the `.ref` class.
- Section HTML rendered with `unsafeHTML(section.html)`. Body content is trusted.
- Router: tiny hash-based router (~50 lines), `#/section/<slug>`, `#/toc`, `#/print`. Don't add a library.

## File map
```
web/
  index.html        # shell + font links + token :root
  main.ts           # router + mount
  store.ts          # signals
  styles.css        # tokens + base + component classes
  components/
    arch-masthead.ts, arch-tree.ts, arch-section-view.ts,
    arch-properties.ts, arch-edges.ts, arch-refs-grid.ts,
    arch-glimpse.ts, arch-ref.ts, arch-toc.ts,
    arch-print.ts, arch-print-page.ts
```

## Don'ts
- No second accent color. No purple gradients, pink, teal-as-primary.
- No font swaps (no Inter, no serif). Geist only.
- No drop caps, italic decks, `§`/`◊` ornaments, paper grain, divider rules with end caps.
- No pill radii >9px. No heavy shadows except print pages.
- No CSS frameworks, icon fonts, component libs.
- No new type-color outside the existing `--type-*` set without registering it as a token first.

## When extending
1. Re-read `design/mockup.html` to absorb the rhythm.
2. Find the closest existing pattern (card, properties, edges, tree row) and copy its structure.
3. New section types: add a `--type-<slug>` token, pick a color from the same saturation family (saturation ~70–80, lightness ~35–50). Don't invent a new chip shape.
4. Keep the mockup updated as the source of truth — when a real component diverges, update the mockup or the component, never let them drift.
