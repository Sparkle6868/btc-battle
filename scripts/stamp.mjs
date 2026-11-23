// Cross-platform cache-busting stamp script (replaces GNU-sed/sha1sum stamp.sh)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const jsFiles = fs.readdirSync(path.join(root, 'js'))
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => `js/${f}`);

const hashInputs = ['index.html', 'style.css', ...jsFiles];
const concat = hashInputs
  .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n').replace(/\?v=[A-Za-z0-9]+/g, ''))
  .join('');

const version = crypto.createHash('sha1').update(concat, 'utf8').digest('hex').slice(0, 8);

const targets = [
  {
    rel: 'index.html',
    transform: (s) => s.replace(/(style\.css|app\.js)\?v=[A-Za-z0-9]+/g, `$1?v=${version}`),
  },
  ...jsFiles.map((rel) => ({
    rel,
    transform: (s) => s.replace(/([a-z0-9]+\.js)\?v=[A-Za-z0-9]+/g, `$1?v=${version}`),
  })),
  {
    rel: 'sw.js',
    transform: (s) => s
      .replace(/cw-shell-[A-Za-z0-9]+/g, `cw-shell-${version}`)
      .replace(/((?:style\.css|js\/[a-z0-9]+\.js))\?v=[A-Za-z0-9]+/g, `$1?v=${version}`),
  },
];

let changed = 0;
for (const { rel, transform } of targets) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  const orig = fs.readFileSync(fp, 'utf8');
  const next = transform(orig);
  if (next !== orig) {
    changed++;
    if (checkOnly) {
      console.error(`stale: ${rel} (expected version ${version})`);
    } else {
      fs.writeFileSync(fp, next, 'utf8');
      console.log(`updated: ${rel} -> ${version}`);
    }
  }
}

if (checkOnly) {
  if (changed > 0) {
    console.error(`${changed} file(s) out of date. Run: node scripts/stamp.mjs`);
    process.exit(1);
  }
  console.log(`stamp OK: ${version}`);
} else {
  console.log(`version ${version} (${changed} file(s) updated)`);
}
