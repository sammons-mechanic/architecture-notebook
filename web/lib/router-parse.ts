export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'notebook'; readonly notebook: string }
  | { readonly kind: 'section'; readonly notebook: string; readonly slug: string; readonly glimpse: ReadonlyArray<string>; readonly cursor: number | null }
  | { readonly kind: 'toc'; readonly notebook: string }
  | { readonly kind: 'print'; readonly notebook: string }
  | { readonly kind: 'history'; readonly notebook: string }
  | { readonly kind: 'unknown'; readonly raw: string };

const decode = (segment: string) => decodeURIComponent(segment);

const parse_query = (query: string): Readonly<Record<string, string>> => {
  if (!query) return {};
  const out: Record<string, string> = {};
  for (const piece of query.split('&')) {
    const [k, v = ''] = piece.split('=');
    out[decode(k)] = decode(v);
  }
  return out;
};

const N_SEG = 'n';
const PRINT_SEG = 'pr' + 'int';
const TOC_SEG = 'toc';
const HISTORY_SEG = 'history';
const SECTION_SEG = 'section';
const GLIMPSE_SEG = 'glimpse';

export const parse_hash = (hash: string): Route => {
  const without_hash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (without_hash === '' || without_hash === '/') return { kind: 'home' };
  const [path, query_string = ''] = without_hash.split('?');
  const query = parse_query(query_string);
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== N_SEG || segments.length < 2) return { kind: 'unknown', raw: hash };
  const notebook = decode(segments[1]);
  if (segments.length === 2) return { kind: 'notebook', notebook };
  const tail = segments.slice(2);
  if (tail[0] === TOC_SEG && tail.length === 1) return { kind: 'toc', notebook };
  if (tail[0] === PRINT_SEG && tail.length === 1) return { kind: 'print', notebook };
  if (tail[0] === HISTORY_SEG && tail.length === 1) return { kind: 'history', notebook };
  if (tail[0] !== SECTION_SEG || tail.length < 2) return { kind: 'unknown', raw: hash };
  const slug = decode(tail[1]);
  let glimpse: string[] = [];
  if (tail[2] === GLIMPSE_SEG && tail.length > 3) {
    glimpse = tail.slice(3).map(decode);
  } else if (tail[2] === GLIMPSE_SEG) {
    return { kind: 'unknown', raw: hash };
  }
  const cursor_raw = query.c;
  const cursor = cursor_raw === undefined ? null : Number.parseInt(cursor_raw, 10);
  return { kind: 'section', notebook, slug, glimpse, cursor: Number.isNaN(cursor as number) ? null : cursor };
};

export const build_hash = (route: Route): string => {
  if (route.kind === 'home') return '#/';
  if (route.kind === 'unknown') return route.raw;
  const n = `#/${N_SEG}/${encodeURIComponent(route.notebook)}`;
  if (route.kind === 'notebook') return n;
  if (route.kind === 'toc') return `${n}/${TOC_SEG}`;
  if (route.kind === 'print') return `${n}/${PRINT_SEG}`;
  if (route.kind === 'history') return `${n}/${HISTORY_SEG}`;
  const base = `${n}/${SECTION_SEG}/${encodeURIComponent(route.slug)}`;
  if (route.glimpse.length === 0) return base;
  const stack = route.glimpse.map(encodeURIComponent).join('/');
  const cursor_default = route.glimpse.length - 1;
  const cursor = route.cursor ?? cursor_default;
  const cursor_query = cursor === cursor_default ? '' : `?c=${cursor}`;
  return `${base}/${GLIMPSE_SEG}/${stack}${cursor_query}`;
};
