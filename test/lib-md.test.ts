import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { render_markdown } from '../web/lib/md.ts';

describe('render_markdown', () => {
  test('plain text escapes html special chars', () => {
    assert.deepEqual(
      render_markdown('hello <script>alert(1)</script>'),
      '<p>hello &lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  test('bold and italic render with strong and em', () => {
    assert.deepEqual(
      render_markdown('this is **bold** and *italic*'),
      '<p>this is <strong>bold</strong> and <em>italic</em></p>',
    );
  });

  test('inline code preserves angle brackets via escape inside code', () => {
    assert.deepEqual(
      render_markdown('use `<arch-ref>` here'),
      '<p>use <code>&lt;arch-ref&gt;</code> here</p>',
    );
  });

  test('fenced code block escapes its contents', () => {
    assert.deepEqual(
      render_markdown('```\nconst x = <T>();\n```'),
      '<pre><code>const x = &lt;T&gt;();</code></pre>',
    );
  });

  test('https link renders as anchor with escaped href', () => {
    assert.deepEqual(
      render_markdown('see [docs](https://example.com/x)'),
      '<p>see <a href="https://example.com/x">docs</a></p>',
    );
  });

  test('javascript url falls through to escaped plain text', () => {
    assert.deepEqual(
      render_markdown('try [click](javascript:alert)'),
      '<p>try [click](javascript:alert)</p>',
    );
  });

  test('unordered list renders with two list items', () => {
    assert.deepEqual(
      render_markdown('- one\n- two'),
      '<ul><li>one</li><li>two</li></ul>',
    );
  });

  test('blockquote and paragraph render as separate blocks', () => {
    assert.deepEqual(
      render_markdown('> quoted line\n\na paragraph'),
      '<blockquote>quoted line</blockquote><p>a paragraph</p>',
    );
  });
});
