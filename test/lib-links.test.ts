import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan_html_refs, stamp_anchors } from '../server/lib/links.ts';
import { is_failure } from '../server/lib/failure.ts';

describe('links scanner', () => {
  test('parses double-quoted attribute', () => {
    const result = scan_html_refs('<arch-ref to="domain-acme-com">acme</arch-ref>');
    assert.deepEqual(result, [{ to: 'domain-acme-com', role: null, source: 'html' }]);
  });

  test('parses single-quoted attribute', () => {
    const result = scan_html_refs("<arch-ref to='service-order-engine'/>");
    assert.deepEqual(result, [{ to: 'service-order-engine', role: null, source: 'html' }]);
  });

  test('accepts attributes in either order', () => {
    const result = scan_html_refs('<arch-ref role="uses" to="auth-jwt">jwt</arch-ref>');
    assert.deepEqual(result, [{ to: 'auth-jwt', role: 'uses', source: 'html' }]);
  });

  test('accepts whitespace around equals', () => {
    const result = scan_html_refs('<arch-ref to = "auth-jwt" />');
    assert.deepEqual(result, [{ to: 'auth-jwt', role: null, source: 'html' }]);
  });

  test('rejects missing to attribute', () => {
    const result = scan_html_refs('<arch-ref role="uses"></arch-ref>');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'arch-ref-malformed' },
    );
  });

  test('rejects unquoted attribute value', () => {
    const result = scan_html_refs('<arch-ref to=foo></arch-ref>');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'arch-ref-malformed' },
    );
  });

  test('rejects duplicate attribute names', () => {
    const result = scan_html_refs('<arch-ref to="a" to="b"></arch-ref>');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'arch-ref-malformed' },
    );
  });

  test('rejects attribute names that are not lowercase', () => {
    const result = scan_html_refs('<arch-ref To="x"></arch-ref>');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'arch-ref-malformed' },
    );
  });

  test('rejects unknown attribute', () => {
    const result = scan_html_refs('<arch-ref to="x" alt="y"></arch-ref>');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'arch-ref-malformed' },
    );
  });

  test('rejects entity-decoded slug', () => {
    const result = scan_html_refs('<arch-ref to="foo&#45;bar"/>');
    assert.deepEqual(
      { failed: is_failure(result), code: is_failure(result) ? result.code : null },
      { failed: true, code: 'arch-ref-malformed' },
    );
  });

  test('captures multiple refs in a single document', () => {
    const html = '<p>see <arch-ref to="a">A</arch-ref> and <arch-ref to="b" role="rel"/></p>';
    const result = scan_html_refs(html);
    assert.deepEqual(result, [
      { to: 'a', role: null, source: 'html' },
      { to: 'b', role: 'rel', source: 'html' },
    ]);
  });
});

describe('anchor stamping', () => {
  test('stamps sequential anchors on two top-level paragraphs', () => {
    const stamped = stamp_anchors('<p>first</p><p>second</p>');
    assert.deepEqual(stamped, '<p data-anchor="p-0">first</p><p data-anchor="p-1">second</p>');
  });

  test('renumbers existing data-anchor values to the new sequential index', () => {
    const stamped = stamp_anchors('<p data-anchor="p-7">first</p><p>second</p>');
    assert.deepEqual(stamped, '<p data-anchor="p-0">first</p><p data-anchor="p-1">second</p>');
  });

  test('does not stamp paragraphs nested inside blockquote', () => {
    const stamped = stamp_anchors('<p>outer</p><blockquote><p>inner</p></blockquote><p>tail</p>');
    assert.deepEqual(stamped, '<p data-anchor="p-0">outer</p><blockquote><p>inner</p></blockquote><p data-anchor="p-1">tail</p>');
  });

  test('is idempotent — re-stamping yields identical html', () => {
    const html = '<p>alpha</p><p class="lead">beta</p>';
    const once = stamp_anchors(html);
    const twice = stamp_anchors(once);
    assert.deepEqual(twice, once);
  });

  test('preserves other attributes when stamping', () => {
    const stamped = stamp_anchors('<p class="lead" id="first">hi</p>');
    assert.deepEqual(stamped, '<p class="lead" id="first" data-anchor="p-0">hi</p>');
  });

  test('does not stamp paragraphs inside list items', () => {
    const stamped = stamp_anchors('<ul><li><p>inside</p></li></ul><p>outside</p>');
    assert.deepEqual(stamped, '<ul><li><p>inside</p></li></ul><p data-anchor="p-0">outside</p>');
  });

  test('returns the input unchanged when there are no top-level paragraphs', () => {
    const html = '<h2>title</h2><ul><li>one</li></ul>';
    assert.deepEqual(stamp_anchors(html), html);
  });
});
