// Copy the site into dist/ for static hosting (no server: runs in single-player mode).
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADDON_FILES, rewriteAddon } from '../lib/vendor.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(root, 'public'), dist, { recursive: true });
const vendor = join(dist, 'vendor', 'three', 'build');
mkdirSync(vendor, { recursive: true });
for (const f of ['three.module.min.js', 'three.core.min.js']) cpSync(join(root, 'node_modules', 'three', 'build', f), join(vendor, f));
for (const f of ADDON_FILES) {
  const out = join(dist, 'vendor', 'three', 'addons', f);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rewriteAddon(readFileSync(join(root, 'node_modules', 'three', 'examples', 'jsm', f), 'utf8')));
}
console.log(`static site written to ${dist}`);
