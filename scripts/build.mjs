// Production build without a bundler (no native binaries, works on older macOS).
// 1. Syntax-checks every project JavaScript file with Node.
// 2. Walks the module graph from src/main.js through the import map in index.html,
//    verifying that every import resolves and every named import is actually exported.
// 3. Copies index.html, style.css and exactly the reachable modules (including three.js) into dist/.
// Usage: node scripts/build.mjs [--check-only]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check-only');
const errors = [];
const fail = (m) => errors.push(m);

function listJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJs(p));
    else if (/\.(m?js)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ---- 1. syntax ----
const own = [...listJs(path.join(ROOT, 'src')), ...listJs(path.join(ROOT, 'server')), ...listJs(path.join(ROOT, 'scripts'))];
for (const f of own) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(`Syntax error in ${path.relative(ROOT, f)}:\n${(r.stderr || '').trim()}`);
}
console.log(`Syntax check: ${own.length} files`);

// ---- 2. module graph ----
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!mapMatch) fail('index.html has no import map');
const imports = mapMatch ? JSON.parse(mapMatch[1]).imports : {};

function resolveSpec(spec, fromFile) {
  if (spec.startsWith('./') || spec.startsWith('../')) return path.resolve(path.dirname(fromFile), spec);
  if (spec.startsWith('/')) return path.join(ROOT, spec);
  if (imports[spec]) return path.join(ROOT, imports[spec]);
  for (const [k, v] of Object.entries(imports)) if (k.endsWith('/') && spec.startsWith(k)) return path.join(ROOT, v + spec.slice(k.length));
  return null;
}

const IMPORT_RE = /(?:^|[;\n}])\s*(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const BARE_RE = /(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g;
const DYN_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const exportCache = new Map();
function exportsOf(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  let star = false;
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const as = p.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  if (/export\s+\*\s+from/.test(src)) star = true;
  const res = { names, star };
  exportCache.set(file, res);
  return res;
}

const reachable = new Set();
function walk(file) {
  if (reachable.has(file)) return;
  if (!fs.existsSync(file)) { fail(`Missing module: ${path.relative(ROOT, file)}`); return; }
  reachable.add(file);
  const src = fs.readFileSync(file, 'utf8');
  const visit = (spec, clause) => {
    const target = resolveSpec(spec, file);
    if (!target) { fail(`Unresolvable import "${spec}" in ${path.relative(ROOT, file)}`); return; }
    if (!fs.existsSync(target)) { fail(`Import "${spec}" in ${path.relative(ROOT, file)} -> missing ${path.relative(ROOT, target)}`); return; }
    if (clause && file.startsWith(path.join(ROOT, 'src'))) {
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        const ex = exportsOf(target);
        if (!ex.star) {
          for (const part of named[1].split(',')) {
            const n = part.trim().split(/\s+as\s+/)[0].trim();
            if (n && !ex.names.has(n)) fail(`"${n}" is not exported by ${path.relative(ROOT, target)} (imported in ${path.relative(ROOT, file)})`);
          }
        }
      }
    }
    walk(target);
  };
  for (const m of src.matchAll(IMPORT_RE)) visit(m[3], m[1] === 'import' ? m[2] : null);
  for (const m of src.matchAll(BARE_RE)) visit(m[1], null);
  for (const m of src.matchAll(DYN_RE)) visit(m[1], null);
}

const entry = html.match(/<script type="module" src="([^"]+)"/);
if (!entry) fail('index.html has no module entry script');
else walk(path.join(ROOT, entry[1]));
const cssRef = html.match(/<link rel="stylesheet" href="([^"]+)"/);
if (cssRef && !fs.existsSync(path.join(ROOT, cssRef[1]))) fail(`Missing stylesheet ${cssRef[1]}`);

console.log(`Module graph: ${reachable.size} modules reachable from ${entry ? entry[1] : '?'}`);

if (errors.length) {
  console.error(`\nBUILD FAILED (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
if (CHECK_ONLY) { console.log('Check passed.'); process.exit(0); }

// ---- 3. copy ----
fs.rmSync(DIST, { recursive: true, force: true });
const copy = (abs) => {
  const rel = path.relative(ROOT, abs);
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(abs, out);
};
copy(path.join(ROOT, 'index.html'));
if (cssRef) copy(path.join(ROOT, cssRef[1]));
for (const f of reachable) copy(f);
let bytes = 0;
for (const f of reachable) bytes += fs.statSync(f).size;
console.log(`Build complete: dist/ (${reachable.size + 2} files, ${(bytes / 1048576).toFixed(1)} MB of modules)`);
