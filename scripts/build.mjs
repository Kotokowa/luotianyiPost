import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'hero.css', 'src', 'assets']) await cp(path.join(root, name), path.join(output, name), { recursive: true });
console.log('小天地准备好啦 → dist/');
