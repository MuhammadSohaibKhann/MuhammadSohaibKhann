// Guards against defects that have actually broken this README before.
import { readFileSync } from 'node:fs';
const s = readFileSync('README.md', 'utf8');
const errs = [];

// 1. capsule-render silently fails on encoded ampersands
for (const u of s.match(/capsule-render[^"]*/g) ?? [])
  if (u.includes('%26')) errs.push(`capsule-render URL contains %26 (renders as a broken image): ${u.slice(0, 90)}`);

// 2. every image needs alt text (a11y + readable fallback if a host is down)
for (const t of s.match(/<img [^>]*>/g) ?? [])
  if (!t.includes('alt=')) errs.push(`<img> without alt: ${t.slice(0, 90)}`);

// 3. balanced structure
const pair = (o, c, n) => { const a = (s.match(new RegExp(o, 'g')) ?? []).length,
                                  b = (s.match(new RegExp(c, 'g')) ?? []).length;
  if (a !== b) errs.push(`${n} unbalanced: ${a} open vs ${b} close`); };
pair('<div align="center">', '</div>', 'div');
pair('<table>', '</table>', 'table');
pair('<details', '</details>', 'details');

// 4. stats markers must survive edits or the daily workflow silently no-ops
if ((s.match(/<!--STATS:START-->/g) ?? []).length !== 1 ||
    (s.match(/<!--STATS:END-->/g) ?? []).length !== 1)
  errs.push('STATS markers missing or duplicated — the stats workflow would no-op');

// 5. every in-page link must resolve to an explicit named anchor
const anchors = new Set([...s.matchAll(/<a name="([^"]+)"><\/a>/g)].map(m => m[1]));
for (const [, target] of s.matchAll(/href="#([^"]+)"/g))
  if (!anchors.has(target)) errs.push(`in-page link #${target} has no <a name="${target}"> anchor`);

// 6. every prominent badge carries a real brand mark, not a bare colour chip
for (const u of s.match(/img\.shields\.io\/badge\/[^"]*/g) ?? [])
  if (u.includes('for-the-badge') && !u.includes('logo=')) errs.push(`for-the-badge badge without a logo: ${u.slice(0, 80)}`);

if (errs.length) { console.error('README check failed:\n- ' + errs.join('\n- ')); process.exit(1); }
console.log('README check passed');
