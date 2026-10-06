// SPDX-License-Identifier: GPL-3.0-or-later
// Ponto de entrada do Web Worker de modulo. Criado por client.ts com
// new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }).
import type { WorkerResponse } from './protocol';
import { createWorkerHandler } from './worker-core';

// Sem /// <reference lib="webworker" />: conflitaria com a lib DOM do tsconfig do renderer.
const scope = globalThis as unknown as {
  postMessage(msg: WorkerResponse): void;
  onmessage: ((e: { data: unknown }) => void) | null;
};

const handle = createWorkerHandler((msg) => scope.postMessage(msg));
scope.onmessage = (e) => handle(e.data);
