// Copy the site into dist/ for static hosting (no server: runs in single-player mode).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(root, 'public'), dist, { recursive: true });
const vendor = join(dist, 'vendor', 'three', 'build');
mkdirSync(vendor, { recursive: true });
for (const f of ['three.module.min.js', 'three.core.min.js']) cpSync(join(root, 'node_modules', 'three', 'build', f), join(vendor, f));
console.log(`static site written to ${dist}`);
