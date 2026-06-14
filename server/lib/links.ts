import { make_failure, type Failure } from './failure.ts';
import { is_valid_ref_target } from './slug.ts';

export { stamp_anchors } from './anchors.ts';

export type HtmlRef = {
  readonly to: string;
  readonly role: string | null;
  readonly source: 'html';
};

export type PropertyRef = {
  readonly to: string;
  readonly role: string;
  readonly source: 'property';
};

export type ScannedRef = HtmlRef | PropertyRef;

const allowed_attrs = new Set(['to', 'role']);

const parse_attributes = (
  attr_text: string
): Record<string, string> | Failure => {
  const attrs: Record<string, string> = {};
  let cursor = 0;
  while (cursor < attr_text.length) {
    while (cursor < attr_text.length && /\s/.test(attr_text[cursor])) {
      cursor += 1;
    }
    if (cursor >= attr_text.length) {
      break;
    }
    const name_start = cursor;
    while (cursor < attr_text.length && /[A-Za-z]/.test(attr_text[cursor])) {
      cursor += 1;
    }
    if (cursor === name_start) {
      return make_failure('arch-ref-malformed', `Unexpected character at offset ${cursor}`);
    }
    const name = attr_text.slice(name_start, cursor);
    if (name !== name.toLowerCase()) {
      return make_failure('arch-ref-malformed', `Attribute name ${name} must be lowercase`);
    }
    if (!allowed_attrs.has(name)) {
      return make_failure('arch-ref-malformed', `Attribute ${name} is not allowed on <arch-ref>`);
    }
    if (attrs[name] !== undefined) {
      return make_failure('arch-ref-malformed', `Duplicate attribute ${name}`);
    }
    while (cursor < attr_text.length && /\s/.test(attr_text[cursor])) {
      cursor += 1;
    }
    if (attr_text[cursor] !== '=') {
      return make_failure('arch-ref-malformed', `Attribute ${name} missing '='`);
    }
    cursor += 1;
    while (cursor < attr_text.length && /\s/.test(attr_text[cursor])) {
      cursor += 1;
    }
    const quote = attr_text[cursor];
    if (quote !== '"' && quote !== "'") {
      return make_failure('arch-ref-malformed', `Attribute ${name} value must be quoted`);
    }
    cursor += 1;
    const value_start = cursor;
    while (cursor < attr_text.length && attr_text[cursor] !== quote) {
      cursor += 1;
    }
    if (attr_text[cursor] !== quote) {
      return make_failure('arch-ref-malformed', `Attribute ${name} value not closed`);
    }
    attrs[name] = attr_text.slice(value_start, cursor);
    cursor += 1;
  }
  return attrs;
};

export const scan_html_refs = (html: string): ReadonlyArray<HtmlRef> | Failure => {
  const refs: HtmlRef[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const open = html.indexOf('<arch-ref', cursor);
    if (open === -1) {
      break;
    }
    const after_name = open + '<arch-ref'.length;
    if (after_name < html.length && /[A-Za-z0-9-]/.test(html[after_name])) {
      cursor = after_name;
      continue;
    }
    const close = html.indexOf('>', after_name);
    if (close === -1) {
      return make_failure('arch-ref-malformed', '<arch-ref> tag is not closed');
    }
    let attr_end = close;
    if (html[close - 1] === '/') {
      attr_end = close - 1;
    }
    const attr_text = html.slice(after_name, attr_end);
    const attrs = parse_attributes(attr_text);
    if ('error' in attrs) {
      return attrs;
    }
    if (typeof attrs.to !== 'string') {
      return make_failure('arch-ref-malformed', '<arch-ref> missing required `to` attribute');
    }
    if (!is_valid_ref_target(attrs.to)) {
      return make_failure('arch-ref-malformed', `<arch-ref to=${JSON.stringify(attrs.to)}> is not a valid slug or @notebook/slug reference`);
    }
    refs.push({ to: attrs.to, role: attrs.role ?? null, source: 'html' });
    cursor = close + 1;
  }
  return refs;
};

export type RefDiff = {
  readonly add: ReadonlyArray<{ to: string; role: string | null; source: 'html' | 'property' }>;
  readonly remove_existing: true;
};

export const diff_refs = (
  scanned: ReadonlyArray<ScannedRef>
): RefDiff => ({
  add: scanned.map((entry) => ({ to: entry.to, role: entry.role ?? null, source: entry.source })),
  remove_existing: true,
});
