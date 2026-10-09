// SPDX-License-Identifier: GPL-3.0-or-later
// Verificacao do worker de deteccao no app empacotado (scripts/smoke-worker.mjs). So roda quando o
// main carrega a pagina com ?smoke=worker (MOCQUEREAU_SMOKE=worker); o resultado vai para
// document.title, que o main le e imprime. Usa o mesmo cliente (e o mesmo chunk de worker) do app.
import { createNeumeDetectClient } from './lib/neume-detect';
import { buildAdiastematicLine } from './lib/neume-detect/synthetic';

export async function runWorkerSmoke(): Promise<string> {
  const t0 = performance.now();
  const client = createNeumeDetectClient();
  try {
    const line = buildAdiastematicLine({ width: 600, height: 200, words: [['Pu', 'er'], ['est']], seed: 3 });
    const { result } = client.suggest({ image: line.raster, notation: 'adiastematic', syllables: line.syllables });
    const r = await result;
    const ms = Math.round(performance.now() - t0);
    if (r.suggestions.length === 0) return `SMOKE_FAIL no suggestions (${ms} ms)`;
    return `SMOKE_OK ${r.suggestions.length} ${ms}`;
  } catch (err) {
    return `SMOKE_FAIL ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    client.dispose();
  }
}
