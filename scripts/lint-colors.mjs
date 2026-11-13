import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const roots = ['frontend/src'];
const allowed = new Set(['#9caf88', '#f7f5ef', '#eb412c']);
const forbiddenTokens = /\b(black|white|gray|grey|zinc|slate)\b/i;
const hex = /#[0-9a-fA-F]{3,8}\b/g;
const errors = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (['.css','.tsx'].includes(extname(path))) {
      const source = await readFile(path, 'utf8');
      for (const match of source.matchAll(hex)) if (!allowed.has(match[0].toLowerCase())) errors.push(`${path}: disallowed color ${match[0]}`);
      if (forbiddenTokens.test(source)) errors.push(`${path}: forbidden color token name detected`);
    }
  }
}
for (const root of roots) await walk(root);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Palette guard passed: Sage, Off-White and Tomato only.');
