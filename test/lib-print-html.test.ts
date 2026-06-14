import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { build_print_html } from '../server/print-html.ts';
import type { SectionRow } from '../server/repo-sections.ts';

const make_row = (overrides: Partial<SectionRow>): SectionRow => ({
  id: 1,
  slug: 'root',
  type_id: 1,
  parent_id: null,
  title: 'Root',
  deck: null,
  position: 0,
  properties_json: '{}',
  tags_json: '[]',
  html: '',
  etag: 'x',
  created_at: 0,
  updated_at: 0,
  ...overrides,
});

test('build_print_html: TOC anchors target stable section ids, heading depth matches numbering, embed CSS variables and inline styles survive', () => {
  const sections: SectionRow[] = [
    make_row({ id: 1, slug: 'overview', title: 'Overview', html: '<p>Top of the tree.</p>' }),
    make_row({ id: 2, slug: 'ui', parent_id: 1, title: 'UI', position: 0, html: '<figure class="wf" style="border:1px solid var(--border)">embed</figure>' }),
    make_row({ id: 3, slug: 'modal', parent_id: 2, title: 'Modal & "stuff"', position: 0, html: '<p>nested</p>' }),
    make_row({ id: 4, slug: 'service', parent_id: null, title: 'Service', position: 1, deck: 'A deck.', html: '<p>service body</p>' }),
  ];
  const numbers = new Map<number, string>([[1, '1'], [2, '1.1'], [3, '1.1.1'], [4, '2']]);

  const out = build_print_html(sections, numbers, 'Notebook & Co');

  assert.ok(out.startsWith('<!doctype html>'), 'doctype prefix');
  assert.ok(out.includes('<title>Notebook &amp; Co</title>'), 'title is escaped');

  // Design tokens reach the print document so var(--accent) etc. resolve in embeds.
  assert.ok(out.includes('--accent:'), 'design tokens inlined');
  assert.ok(out.includes('--type-ui:'), 'type tokens inlined');
  assert.ok(out.includes('--sans:'), 'font tokens inlined');

  // Embedded inline style passes through verbatim.
  assert.ok(out.includes('<figure class="wf" style="border:1px solid var(--border)">embed</figure>'),
    'inline-styled embed survives');

  // TOC has anchors that match section ids, depth class reflects numbering depth, titles escaped.
  assert.ok(out.includes('<a href="#section-overview">'), 'TOC anchor to top-level section');
  assert.ok(out.includes('<a href="#section-modal">'), 'TOC anchor to nested section');
  assert.ok(out.includes('<li class="depth-0">'), 'depth-0 TOC class');
  assert.ok(out.includes('<li class="depth-1">'), 'depth-1 TOC class');
  assert.ok(out.includes('<li class="depth-2">'), 'depth-2 TOC class');
  assert.ok(out.includes('Modal &amp; &quot;stuff&quot;'), 'TOC title escaped');

  // Each section gets a stable id and a depth class so pagination CSS can target it.
  assert.ok(out.includes('class="section depth-0" id="section-overview"'), 'top-level section class+id');
  assert.ok(out.includes('class="section depth-1" id="section-ui"'), 'depth-1 section class+id');
  assert.ok(out.includes('class="section depth-2" id="section-modal"'), 'depth-2 section class+id');

  // Heading tag reflects depth (h2 for top, h3 for next, ...).
  assert.ok(/<h2><span class="section-number">1<\/span>Overview<\/h2>/.test(out), 'h2 for depth-0');
  assert.ok(/<h3><span class="section-number">1\.1<\/span>UI<\/h3>/.test(out), 'h3 for depth-1');
  assert.ok(/<h4><span class="section-number">1\.1\.1<\/span>Modal &amp; &quot;stuff&quot;<\/h4>/.test(out), 'h4 for depth-2');

  // Deck renders when present, omitted when null.
  assert.ok(out.includes('<p class="deck">A deck.</p>'), 'deck rendered when present');
  const overview_block = out.slice(out.indexOf('id="section-overview"'), out.indexOf('id="section-ui"'));
  assert.ok(!overview_block.includes('class="deck"'), 'no deck markup when deck is null');

  // Continuous-PDF flow: the document renders as one tall column. Chapter
  // boundaries are visual (margin + rule), not hard page breaks.
  assert.ok(!out.includes('break-before: page'), 'no hard page breaks in continuous mode');
  assert.ok(out.includes('@page { size: 8.5in 200in;'), 'initial @page is the maximum tall page');
  assert.ok(out.includes('runtime_page_sizer') === false, 'helper name is implementation detail');
  assert.ok(out.includes("addEventListener('beforeprint'"), 'beforeprint hook present to size @page to content');

  // page-block grouping is still in the DOM for semantic chapter grouping.
  const page_blocks = out.match(/<div class="page-block">/g) ?? [];
  assert.equal(page_blocks.length, 2, 'one page-block per depth-0 chapter');
  const first_block = out.slice(out.indexOf('<div class="page-block">'),
                                out.indexOf('<div class="page-block">', out.indexOf('<div class="page-block">') + 1));
  assert.ok(first_block.includes('id="section-overview"'), 'first block opens with overview');
  assert.ok(first_block.includes('id="section-ui"'), 'first block contains nested ui');
  assert.ok(first_block.includes('id="section-modal"'), 'first block contains deeply nested modal');
});
