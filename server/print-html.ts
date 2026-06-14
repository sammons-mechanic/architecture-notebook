import type { SectionRow } from './repo-sections.ts';

// Design tokens — mirror of `:root` in web/styles.css. Inline-styled section
// bodies (e.g. wireframes seeded by scripts/seed-wireframes.mjs) reach for
// these via var(--…); the print iframe is a separate document and does not
// inherit them otherwise. Keep in sync with web/styles.css.
const design_tokens = `
:root {
  --bg:            #fafaf9;
  --bg-soft:       #f5f5f4;
  --bg-strong:     #ebebe9;
  --bg-pane:       #ffffff;
  --border:        #e7e5e4;
  --border-strong: #d6d3d1;
  --border-ink:    #1c1917;
  --text:          #1c1917;
  --text-soft:     #44403c;
  --text-muted:    #78716c;
  --text-faint:    #a8a29e;
  --accent:        #1d4ed8;
  --accent-soft:   #3b82f6;
  --accent-bg:     #eff6ff;
  --accent-edge:   #bfdbfe;
  --type-overview:    #1c1917;
  --type-ui:          #0891b2;
  --type-service:     #16a34a;
  --type-integration: #7c3aed;
  --type-cloud:       #ea580c;
  --type-infra:       #525252;
  --type-ingress:     #dc2626;
  --type-egress:      #ca8a04;
  --type-domain:      #0284c7;
  --type-secret:      #9333ea;
  --type-auth:        #0d9488;
  --sans: 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono: 'Geist Mono', ui-monospace, 'SF Mono', monospace;
  --measure: 42rem;
}
`;

const print_css = `
${design_tokens}

/* Continuous-PDF layout: one paper-width column, no page breaks. The actual
   @page height is computed at runtime by the script at the bottom of <body>
   so the PDF exports as a single tall page sized to the content. */
@page { size: 8.5in 200in; margin: 0; }

/* Match web/styles.css universal reset. Wireframe embeds assume box-sizing
   border-box and zero default margin/padding; without this their fixed-width
   grids expand by their inline padding and the layouts smear. */
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body { background: var(--bg); color: var(--text); }
body {
  font-family: var(--sans);
  font-size: 11pt;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Screen and print share the same continuous layout — one tall white column
   with letter-width content, no per-page paper cards. */
.doc {
  margin: 0 auto;
  max-width: 8.5in;
  background: white;
  padding: 0.75in;
  box-sizing: border-box;
}
@media screen {
  body { background: #eeeeee; padding: 24px 0; }
  .doc { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
}
@media print {
  body { padding: 0; }
  .doc { box-shadow: none; padding: 0.5in 0.75in; }
}

/* Cover and TOC are visual sections, not separate pages. */
.cover { padding: 1.5in 0 1in; }
.cover h1 { font-size: 36pt; margin: 0 0 0.4em; letter-spacing: -0.02em; }
.cover .subtitle { color: var(--text-muted); font-size: 12pt; }

.toc { padding-bottom: 1in; border-bottom: 1px solid var(--border); margin-bottom: 1in; }
.toc h1 { font-size: 22pt; margin: 0 0 16pt; letter-spacing: -0.01em; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { break-inside: avoid; padding: 2pt 0; }
.toc a {
  display: grid;
  grid-template-columns: 3em 1fr auto;
  gap: 0.6em;
  align-items: baseline;
  color: inherit;
  text-decoration: none;
}
.toc .toc-num { color: var(--text-faint); font-variant-numeric: tabular-nums; }
.toc .toc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc .depth-1 a { padding-left: 1.4em; font-size: 0.96em; color: var(--text-soft); }
.toc .depth-2 a { padding-left: 2.8em; font-size: 0.92em; color: var(--text-muted); }
.toc .depth-3 a { padding-left: 4.2em; font-size: 0.9em;  color: var(--text-muted); }
.toc .depth-4 a { padding-left: 5.6em; font-size: 0.88em; color: var(--text-muted); }

/* Continuous flow: chapters get visible breathing room instead of a hard page
   break. .page-block groups stay in the DOM for semantic grouping but no
   longer force pagination. */
.page-block + .page-block { margin-top: 36pt; padding-top: 24pt; border-top: 1px solid var(--border); }
.section { margin: 0 0 14pt; }
.section .heading { break-after: avoid; break-inside: avoid; margin-bottom: 6pt; }
.section .heading h2 { font-size: 20pt; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.section .heading h3 { font-size: 15pt; font-weight: 600; margin: 12pt 0 0; }
.section .heading h4 { font-size: 12.5pt; font-weight: 600; margin: 10pt 0 0; }
.section .heading h5 { font-size: 11pt; font-weight: 600; margin: 8pt 0 0; }
.section .heading h6 { font-size: 10.5pt; font-weight: 600; margin: 6pt 0 0; color: var(--text-soft); }
.section .heading .section-number {
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
  margin-right: 0.55em;
  font-weight: 500;
}
.section .heading .deck { color: var(--text-muted); margin: 4pt 0 0; font-size: 0.95em; }
.section .body { font-size: 11pt; line-height: 1.55; }
/* The universal reset zeros default block margins; restore paragraph spacing
   inside section bodies so prose content reads correctly. Inline-styled
   embeds (e.g. wireframes) override these with their own margin rules. */
.section .body p { margin-bottom: 0.7em; }
.section .body p:last-child { margin-bottom: 0; }
.section .body ul, .section .body ol { margin: 0.5em 0 0.7em 1.5em; }
.section .body li { margin-bottom: 0.2em; }
.section .body blockquote { margin: 0.7em 0; padding-left: 1em; border-left: 3px solid var(--border-strong); color: var(--text-soft); }

/* Tame anything an embed might bleed past the page edge, but don't override
   inline styles the embed sets (e.g. backgrounds, borders, grid layouts). */
.section .body img,
.section .body svg,
.section .body iframe,
.section .body video { max-width: 100%; height: auto; }
.section .body figure, .section .body .wf { break-inside: avoid; max-width: 100%; }
.section .body pre { break-inside: avoid; white-space: pre-wrap; word-wrap: break-word; }
.section .body table { break-inside: avoid; border-collapse: collapse; }

h2, h3, h4, h5, h6 { break-after: avoid; }
p, li { orphans: 3; widows: 3; }
`;

const escape_html = (input: string): string => input.replace(/[&<>"]/g, (ch) => {
  if (ch === '&') return '&amp;';
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  return '&quot;';
});

const depth_of = (number_string: string): number => {
  if (number_string === '') return 0;
  return number_string.split('.').length - 1;
};

const heading_tag_for = (depth: number): string => {
  if (depth === 0) return 'h2';
  if (depth === 1) return 'h3';
  if (depth === 2) return 'h4';
  if (depth === 3) return 'h5';
  return 'h6';
};

const compare_numbers = (left: string, right: string): number => {
  const left_parts = left.split('.').map((entry) => Number(entry));
  const right_parts = right.split('.').map((entry) => Number(entry));
  for (let index = 0; index < Math.max(left_parts.length, right_parts.length); index += 1) {
    const left_value = left_parts[index] ?? 0;
    const right_value = right_parts[index] ?? 0;
    if (left_value !== right_value) {
      return left_value - right_value;
    }
  }
  return 0;
};

export const build_print_html = (
  sections: ReadonlyArray<SectionRow>,
  numbers: Map<number, string>,
  notebook_title: string
): string => {
  const ordered = [...sections].sort((left, right) => {
    const left_number = numbers.get(left.id) ?? '';
    const right_number = numbers.get(right.id) ?? '';
    return compare_numbers(left_number, right_number);
  });

  const cover = `<section class="cover"><h1>${escape_html(notebook_title)}</h1></section>`;

  const toc_items = ordered.map((row) => {
    const number = numbers.get(row.id) ?? '';
    const depth = depth_of(number);
    return `<li class="depth-${depth}"><a href="#section-${escape_html(row.slug)}"><span class="toc-num">${escape_html(number)}</span><span class="toc-title">${escape_html(row.title)}</span></a></li>`;
  }).join('');
  const toc = `<section class="toc"><h1>Contents</h1><ol>${toc_items}</ol></section>`;

  const render_section = (row: SectionRow): string => {
    const number = numbers.get(row.id) ?? '';
    const depth = depth_of(number);
    const heading_tag = heading_tag_for(depth);
    const deck = row.deck ? `<p class="deck">${escape_html(row.deck)}</p>` : '';
    return `<section class="section depth-${depth}" id="section-${escape_html(row.slug)}">`
      + `<div class="heading"><${heading_tag}><span class="section-number">${escape_html(number)}</span>${escape_html(row.title)}</${heading_tag}>${deck}</div>`
      + `<div class="body">${row.html}</div>`
      + `</section>`;
  };

  // Group consecutive sections into one .page-block per top-level chapter so
  // chapter boundaries get visible breathing room. No hard page breaks — the
  // whole document is one continuous flow.
  const blocks: SectionRow[][] = [];
  for (const row of ordered) {
    const depth = depth_of(numbers.get(row.id) ?? '');
    if (depth === 0 || blocks.length === 0) {
      blocks.push([row]);
    } else {
      blocks[blocks.length - 1].push(row);
    }
  }
  const section_blocks = blocks
    .map((group) => `<div class="page-block">${group.map(render_section).join('')}</div>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape_html(notebook_title)}</title><style>${print_css}</style></head><body><div class="doc">${cover}${toc}${section_blocks}</div>${runtime_page_sizer}</body></html>`;
};

// Continuous-PDF helper: measure the rendered document height and rewrite
// @page size to match, so Chrome's "Save as PDF" produces one tall page sized
// to the content rather than slicing it into letter-height chunks. Chrome
// caps page height at 200in (14,400pt); we clamp to that.
const runtime_page_sizer = `<script>
(function () {
  function size_page() {
    var doc = document.querySelector('.doc');
    if (!doc) return;
    var rect = doc.getBoundingClientRect();
    var width_in = 8.5;
    var height_in = Math.min(200, rect.height / 96 + 1);
    var style = document.getElementById('dyn-page');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dyn-page';
      document.head.appendChild(style);
    }
    style.textContent = '@page { size: ' + width_in + 'in ' + height_in.toFixed(2) + 'in; margin: 0; }';
  }
  if (document.readyState === 'complete') size_page();
  else window.addEventListener('load', size_page);
  window.addEventListener('beforeprint', size_page);
})();
</script>`;
