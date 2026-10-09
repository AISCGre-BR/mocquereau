// SPDX-License-Identifier: GPL-3.0-or-later
// Verifica que o worker de deteccao de neumas carrega no app EMPACOTADO (file://, CSP, asar).
// Uso: node scripts/smoke-worker.mjs [--no-build]
// Constroi (electron-vite build + electron-builder --dir), abre o binario desempacotado com
// MOCQUEREAU_SMOKE=worker e espera "SMOKE_OK <n> <ms>" no stdout (o main sai com 0/1).
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 60_000;

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (!process.argv.includes('--no-build')) {
  execSync('npx electron-vite build && npx electron-builder --dir', { cwd: root, stdio: 'inherit', env });
}

const builderYml = readFileSync(join(root, 'electron-builder.yml'), 'utf8');
const productName = /^productName:\s*(.+)$/m.exec(builderYml)?.[1].trim() ?? 'Mocquereau';
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

function binaryPath() {
  const dist = join(root, 'dist');
  if (process.platform === 'win32') return join(dist, 'win-unpacked', `${productName}.exe`);
  if (process.platform === 'darwin') {
    const dir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    return join(dist, dir, `${productName}.app`, 'Contents', 'MacOS', productName);
  }
  // Linux: electron-builder usa o "name" do package.json (executableName) em minusculas.
  const candidates = [pkgName, productName, productName.toLowerCase()].map((n) => join(dist, 'linux-unpacked', n));
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

const bin = binaryPath();
if (!existsSync(bin)) {
  console.error(`SMOKE_FAIL binary not found: ${bin}`);
  process.exit(1);
}

const t0 = Date.now();
const child = spawn(bin, [], { env: { ...env, MOCQUEREAU_SMOKE: 'worker' }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => {
  out += d;
  process.stdout.write(d);
});
child.stderr.on('data', (d) => process.stderr.write(d));
const timer = setTimeout(() => {
  console.error(`SMOKE_FAIL no answer after ${TIMEOUT_MS} ms`);
  child.kill('SIGKILL');
}, TIMEOUT_MS);
child.on('exit', (code) => {
  clearTimeout(timer);
  const line = out.split(/\r?\n/).find((l) => l.startsWith('SMOKE_'));
  const ok = code === 0 && !!line && line.startsWith('SMOKE_OK');
  console.log(`[smoke-worker] ${process.platform}-${process.arch} exit=${code} wall=${Date.now() - t0} ms -> ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
});
