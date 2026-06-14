import { find_top_level_p_tags } from './anchors-scan.ts';

const strip_existing_anchor = (attrs: string): string => {
  return attrs.replace(/\s+data-anchor\s*=\s*("[^"]*"|'[^']*')/gi, '');
};

const rebuild_p_tag = (attrs_text: string, index: number): string => {
  const cleaned = strip_existing_anchor(attrs_text).replace(/\s+$/, '');
  return `<p${cleaned} data-anchor="p-${index}"`;
};

export const stamp_anchors = (html: string): string => {
  const targets = find_top_level_p_tags(html);
  if (targets.length === 0) return html;
  let out = '';
  let cursor = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const attrs_text = html.slice(target.attrs_start, target.attrs_end);
    const trailing = html.slice(target.attrs_end, target.tag_end + 1);
    out += html.slice(cursor, target.tag_start);
    out += rebuild_p_tag(attrs_text, index);
    out += trailing;
    cursor = target.tag_end + 1;
  }
  out += html.slice(cursor);
  return out;
};
