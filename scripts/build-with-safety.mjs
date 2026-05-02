#!/usr/bin/env node
/**
 * Build with safety wiring — replaces the bare esbuild step.
 *
 * Reads server.ts, applies patches from _safety-patches.mjs in memory,
 * and runs esbuild on the patched source. server.ts on disk is never
 * modified, so reviewers see the clean source on GitHub.
 *
 * If a patch's `find` string doesn't match exactly once, the build fails
 * loudly so the operator notices that server.ts has drifted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PATCHES } from './_safety-patches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'server.ts');
const TMP = path.join(ROOT, '.server.with-safety.ts');
const OUT = path.join(ROOT, 'server.mjs');

if (!fs.existsSync(SRC)) {
  console.error(`[BUILD][FATAL] server.ts not found at ${SRC}`);
  process.exit(1);
}

let patched = fs.readFileSync(SRC, 'utf8');

for (const p of PATCHES) {
  const occurrences = patched.split(p.find).length - 1;
  if (occurrences === 0) {
    console.error(`[BUILD][FATAL] Patch "${p.label}" did not match. server.ts drifted.`);
    console.error('[BUILD][FATAL] Expected pattern (first 200 chars):');
    console.error(p.find.slice(0, 200));
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error(`[BUILD][FATAL] Patch "${p.label}" matched ${occurrences} times. Pattern must be unique.`);
    process.exit(1);
  }
  patched = patched.replace(p.find, p.replace);
  console.log(`[BUILD] ✅ Applied patch ${p.label}`);
}

fs.writeFileSync(TMP, patched);
console.log(`[BUILD] Wrote patched source to ${TMP} (${(patched.length / 1024).toFixed(1)} KB)`);

const args = [
  'esbuild',
  TMP,
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--outfile=' + OUT,
  '--packages=external',
  '--target=node20',
];

console.log(`[BUILD] Running: npx ${args.join(' ')}`);
const r = spawnSync('npx', args, { stdio: 'inherit', cwd: ROOT });

try { fs.unlinkSync(TMP); } catch {}

if (r.status !== 0) {
  console.error('[BUILD][FATAL] esbuild failed.');
  process.exit(r.status || 1);
}

const outSize = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`[BUILD] ✅ server.mjs built with safety wiring (${outSize} KB).`);
