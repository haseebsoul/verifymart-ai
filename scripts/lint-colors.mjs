import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['frontend/src'];
const allowed = new Set([
  '#f9f9f6', '#ffffff', '#f2f2ed', '#e4e4df', '#cecec6',
  '#116d4e', '#0d573e', '#ebf5f0', '#b7dfd0',
  '#181a18', '#525854', '#7a7f7b', '#b45309', '#b91c1c'
]);
const legacyTokens = /--(?:sage|tomato)(?:[-:]|\b)|#(?:9caf88|f7f5ef|eb412c)\b/i;
const hex = /#[0-9a-fA-F]{3,8}\b/g;
const errors = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (['.css', '.tsx'].includes(extname(path))) {
      const source = await readFile(path, 'utf8');
      for (const match of source.matchAll(hex)) {
        if (!allowed.has(match[0].toLowerCase())) errors.push(`${path}: disallowed color ${match[0]}`);
      }
      if (legacyTokens.test(source)) errors.push(`${path}: legacy Sage/Tomato palette token detected`);
    }
  }
}
for (const root of roots) await walk(root);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Palette guard passed: Emerald Green and Warm Parchment tokens only.');
