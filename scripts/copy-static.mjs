import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'web');
const dst = resolve(root, 'web/dist');

await mkdir(dst, { recursive: true });

const files = ['index.html', 'styles.css', 'styles-revisions.css', 'styles-comments.css', 'styles-history.css'];

for (const name of files) {
  await copyFile(resolve(src, name), resolve(dst, name));
}

console.log(`copied ${files.length} static files to web/dist/`);
