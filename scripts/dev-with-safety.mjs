#!/usr/bin/env node
/**
 * Dev mode with safety wiring — alternative to `tsx server.ts`.
 *
 * Generates a patched temp file (.server.dev.ts) with the same safety
 * injections as the production build, then runs tsx watch on it.
 *
 * The patched file is gitignored. server.ts on disk stays clean.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PATCHES } from './_safety-patches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'server.ts');
const TMP = path.join(ROOT, '.server.dev.ts');

if (!fs.existsSync(SRC)) {
  console.error(`[DEV] server.ts not found at ${SRC}`);
  process.exit(1);
}

let patched = fs.readFileSync(SRC, 'utf8');
let applied = 0;
for (const p of PATCHES) {
  const n = patched.split(p.find).length - 1;
  if (n !== 1) {
    console.error(`[DEV][FATAL] Patch "${p.label}" matched ${n} times (expected 1).`);
    process.exit(1);
  }
  patched = patched.replace(p.find, p.replace);
  applied++;
}
console.log(`[DEV] Applied ${applied} safety patches → ${TMP}`);
fs.writeFileSync(TMP, patched);

const child = spawn('npx', ['tsx', 'watch', TMP], { stdio: 'inherit', cwd: ROOT });

const cleanup = () => {
  try { fs.unlinkSync(TMP); } catch {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

child.on('exit', code => {
  cleanup();
  process.exit(code ?? 0);
});
