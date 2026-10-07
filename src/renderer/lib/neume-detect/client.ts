// SPDX-License-Identifier: GPL-3.0-or-later
// Cliente de promessas para o worker de deteccao: worker preguicoso, ids de requisicao,
// cancelamento, encerramento apos inatividade e transferencia do buffer da imagem.
import { PROTOCOL, type WorkerRequest, type WorkerResponse } from './protocol';
import type { SuggestInput, SuggestResult } from './types';

export interface WorkerLike {
  postMessage(msg: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror?: ((e: unknown) => void) | null;
}

export class NeumeDetectCancelledError extends Error {
  constructor(id: number) {
    super(`neume-detect request ${id} cancelled`);
    this.name = 'NeumeDetectCancelledError';
  }
}

export interface NeumeDetectClient {
  /**
   * Envia o pedido ao worker. O ArrayBuffer de input.image.data e TRANSFERIDO (fica inutilizavel
   * no chamador); passe uma copia se precisar dele depois.
   */
  suggest(input: SuggestInput): { id: number; result: Promise<SuggestResult> };
  /** Rejeita a promessa com NeumeDetectCancelledError e retira o pedido da fila do worker. */
  cancel(id: number): void;
  /** Rejeita tudo o que esta pendente e encerra o worker. */
  dispose(): void;
}

export interface NeumeDetectClientOptions {
  createWorker?: () => WorkerLike;
  /** Encerra o worker apos este tempo sem pedidos pendentes. Padrao 60 s. */
  idleMs?: number;
}

const defaultCreateWorker = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function createNeumeDetectClient(opts: NeumeDetectClientOptions = {}): NeumeDetectClient {
  const create = opts.createWorker ?? defaultCreateWorker;
  const idleMs = opts.idleMs ?? 60_000;
  let worker: WorkerLike | null = null;
  let nextId = 1;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<number, { resolve: (r: SuggestResult) => void; reject: (e: Error) => void }>();

  const stopIdle = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  };
  const shutdown = () => {
    stopIdle();
    worker?.terminate();
    worker = null;
  };
  const armIdle = () => {
    stopIdle();
    if (pending.size === 0) idleTimer = setTimeout(shutdown, idleMs);
  };
  const failAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker;
    const w = create();
    w.onmessage = (e) => {
      const msg = e.data as WorkerResponse;
      if (!msg || msg.protocol !== PROTOCOL) return;
      const p = pending.get(msg.id);
      if (!p) return; // cancelado ou obsoleto
      pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg.result);
      else if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.reject(new NeumeDetectCancelledError(msg.id));
      armIdle();
    };
    w.onerror = () => {
      failAll(new Error('neume-detect worker failed'));
      shutdown();
    };
    w.onmessageerror = () => {
      failAll(new Error('neume-detect worker messageerror (deserialization failed)'));
      shutdown();
    };
    worker = w;
    return w;
  };

  return {
    suggest(input) {
      stopIdle();
      const id = nextId++;
      const result = new Promise<SuggestResult>((resolve, reject) => pending.set(id, { resolve, reject }));
      try {
        const buf = input.image.data.buffer;
        const transfer = buf instanceof ArrayBuffer ? [buf] : [];
        ensureWorker().postMessage({ protocol: PROTOCOL, type: 'suggest', id, input }, transfer);
      } catch (err) {
        const p = pending.get(id);
        pending.delete(id);
        armIdle();
        p?.reject(err instanceof Error ? err : new Error(String(err)));
      }
      return { id, result };
    },
    cancel(id) {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      p.reject(new NeumeDetectCancelledError(id));
      worker?.postMessage({ protocol: PROTOCOL, type: 'cancel', id });
      armIdle();
    },
    dispose() {
      failAll(new Error('neume-detect client disposed'));
      shutdown();
    },
  };
}
