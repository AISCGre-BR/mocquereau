// Verifica que o Vite empacota o worker como chunk separado (module worker), referenciado pelo
// cliente via new URL(..., import.meta.url). Necessario porque nenhuma tela importa o cliente ainda
// (onda C): `npm run build` nao exercita o worker. Ver spec, risco 7 (worker em file:// e CSP).
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { PROTOCOL } from './protocol';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('worker bundle', () => {
  it('gera um chunk de worker separado, com o protocolo, referenciado pelo cliente', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'neume-worker-'));
    try {
      await build({
        root: resolve(__dirname, '../../../..'),
        configFile: false,
        logLevel: 'silent',
        build: {
          outDir,
          emptyOutDir: true,
          minify: true,
          rollupOptions: {
            input: { client: resolve(__dirname, 'client.ts') },
            preserveEntrySignatures: 'strict',
          },
        },
        worker: { format: 'es' },
      });
      const files = walk(outDir).filter((f) => f.endsWith('.js'));
      const workerChunk = files.find((f) => /worker-[\w-]+\.js$/.test(f));
      expect(workerChunk, files.join(', ')).toBeDefined();
      const name = workerChunk!.split(/[\\/]/).pop()!;
      expect(readFileSync(workerChunk!, 'utf8')).toContain(PROTOCOL);
      const others = files.filter((f) => f !== workerChunk).map((f) => readFileSync(f, 'utf8'));
      expect(others.some((code) => code.includes(name))).toBe(true);
      // inline (data:/blob:) exigiria worker-src na CSP de src/renderer/index.html
      expect(others.some((code) => code.includes('data:text/javascript'))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
