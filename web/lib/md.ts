const ESCAPE_MAP: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape_html = (source: string) => source.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]!);
const is_safe_url = (url: string) => /^https?:\/\//i.test(url);

const apply_emphasis = (text: string) => escape_html(text)
  .replace(/(\*\*|__)([^*_\n]+)\1/g, '<strong>$2</strong>')
  .replace(/(?:\*|_)([^*_\n]+)(?:\*|_)/g, '<em>$1</em>');

const apply_inline = (source: string) => {
  const parts: string[] = [];
  const pattern = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    if (match.index > cursor) {
      parts.push(apply_emphasis(source.slice(cursor, match.index)));
    }
    if (match[1] !== undefined) {
      parts.push(`<code>${escape_html(match[1])}</code>`);
    } else if (is_safe_url(match[3]!)) {
      parts.push(`<a href="${escape_html(match[3]!)}">${escape_html(match[2]!)}</a>`);
    } else {
      parts.push(apply_emphasis(match[0]));
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) {
    parts.push(apply_emphasis(source.slice(cursor)));
  }
  return parts.join('');
};

const strip_list = (line: string, ordered: boolean) => ordered
  ? line.replace(/^\s*\d+\.\s+/, '')
  : line.replace(/^\s*[-*]\s+/, '');

const render_list = (lines: ReadonlyArray<string>, ordered: boolean) => {
  const items = lines.map((line) => `<li>${apply_inline(strip_list(line, ordered))}</li>`).join('');
  return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
};

const render_quote = (lines: ReadonlyArray<string>) => {
  const inner = lines.map((line) => line.replace(/^>\s?/, '')).join('\n');
  return `<blockquote>${apply_inline(inner)}</blockquote>`;
};

const render_fence = (lines: ReadonlyArray<string>) => `<pre><code>${escape_html(lines.join('\n'))}</code></pre>`;

const flush = (buffer: string[], blocks: string[][]) => {
  if (buffer.length > 0) {
    blocks.push(buffer.slice());
    buffer.length = 0;
  }
};

const split_blocks = (source: string) => {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[][] = [];
  const buffer: string[] = [];
  let in_fence = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      buffer.push(line);
      if (in_fence) {
        flush(buffer, blocks);
      }
      in_fence = !in_fence;
      continue;
    }
    if (in_fence) {
      buffer.push(line);
      continue;
    }
    if (line.trim() === '') {
      flush(buffer, blocks);
      continue;
    }
    buffer.push(line);
  }
  flush(buffer, blocks);
  return blocks;
};

const render_block = (block: ReadonlyArray<string>) => {
  if (block[0]?.startsWith('```')) {
    return render_fence(block.slice(1, -1));
  }
  if (block.every((line) => /^\s*[-*]\s+/.test(line))) {
    return render_list(block, false);
  }
  if (block.every((line) => /^\s*\d+\.\s+/.test(line))) {
    return render_list(block, true);
  }
  if (block.every((line) => /^>/.test(line))) {
    return render_quote(block);
  }
  return `<p>${apply_inline(block.join('\n'))}</p>`;
};

export const render_markdown = (src: string) => split_blocks(src).map(render_block).join('');
