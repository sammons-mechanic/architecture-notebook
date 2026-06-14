const void_tags = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

export type TopLevelP = {
  readonly tag_start: number;
  readonly tag_end: number;
  readonly attrs_start: number;
  readonly attrs_end: number;
};

const skip_comment = (html: string, start: number): number => {
  const end = html.indexOf('-->', start + 4);
  return end === -1 ? html.length : end + 3;
};

const read_tag_name = (html: string, after_lt: number) => {
  let cursor = after_lt;
  while (cursor < html.length && /[A-Za-z0-9-]/.test(html[cursor])) {
    cursor += 1;
  }
  return { name: html.slice(after_lt, cursor).toLowerCase(), cursor } as const;
};

const find_tag_close = (html: string, from: number): number => {
  let cursor = from;
  while (cursor < html.length) {
    const ch = html[cursor];
    if (ch === '"' || ch === "'") {
      const next = html.indexOf(ch, cursor + 1);
      cursor = next === -1 ? html.length : next + 1;
      continue;
    }
    if (ch === '>') return cursor;
    cursor += 1;
  }
  return html.length;
};

export const find_top_level_p_tags = (html: string): ReadonlyArray<TopLevelP> => {
  const found: TopLevelP[] = [];
  const stack: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const lt = html.indexOf('<', cursor);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      cursor = skip_comment(html, lt);
      continue;
    }
    if (html[lt + 1] === '/') {
      const { name, cursor: after } = read_tag_name(html, lt + 2);
      const close = find_tag_close(html, after);
      if (stack.length > 0 && stack[stack.length - 1] === name) {
        stack.pop();
      }
      cursor = close + 1;
      continue;
    }
    if (!/[A-Za-z]/.test(html[lt + 1] ?? '')) {
      cursor = lt + 1;
      continue;
    }
    const { name, cursor: attrs_start } = read_tag_name(html, lt + 1);
    const close = find_tag_close(html, attrs_start);
    const self_closing = html[close - 1] === '/';
    const attrs_end = self_closing ? close - 1 : close;
    if (name === 'p' && stack.length === 0 && !self_closing) {
      found.push({ tag_start: lt, tag_end: close, attrs_start, attrs_end });
    }
    if (!self_closing && !void_tags.has(name)) {
      stack.push(name);
    }
    cursor = close + 1;
  }
  return found;
};
