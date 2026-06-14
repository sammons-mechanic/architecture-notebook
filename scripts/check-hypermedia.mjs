import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const web_dir = resolve(root, 'web');
const allowed_relative = 'lib/hal-fetch.ts';
const exempt_relative = new Set(['dist']);

const should_scan = (relpath) => {
  for (const part of relpath.split('/')) {
    if (exempt_relative.has(part)) {
      return false;
    }
  }
  return relpath.endsWith('.ts') || relpath.endsWith('.html');
};

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
      continue;
    }
    out.push(full);
  }
  return out;
};

const strip_comments = (source, ext) => {
  if (ext === '.html') {
    return source.replace(/<!--[\s\S]*?-->/g, '');
  }
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }
    out += source[i];
    i++;
  }
  return out;
};

const files = await walk(web_dir);
const violations = [];
for (const file of files) {
  const relpath = relative(web_dir, file);
  if (!should_scan(relpath)) {
    continue;
  }
  if (relpath === allowed_relative) {
    continue;
  }
  const ext = file.endsWith('.html') ? '.html' : '.ts';
  const raw = await readFile(file, 'utf8');
  const stripped = strip_comments(raw, ext);
  if (stripped.includes('/api/') || stripped.includes('/print')) {
    const lines = stripped.split('\n');
    const hits = [];
    for (let n = 0; n < lines.length; n++) {
      if (lines[n].includes('/api/') || lines[n].includes('/print')) {
        hits.push(`  ${relpath}:${n + 1}: ${lines[n].trim()}`);
      }
    }
    violations.push(...hits);
  }
}

if (violations.length > 0) {
  console.error('Hypermedia discipline violations:');
  for (const line of violations) {
    console.error(line);
  }
  process.exit(1);
}

console.log('OK · no /api/ or /print literals outside web/lib/hal-fetch.ts');
