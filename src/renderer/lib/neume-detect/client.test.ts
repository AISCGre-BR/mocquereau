import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNeumeDetectClient, NeumeDetectCancelledError, type WorkerLike } from './client';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { buildAdiastematicLine } from './synthetic';
import { createWorkerHandler } from './worker-core';

/** Worker falso que roda worker-core no mesmo processo, com entrega assincrona. */
function fakeWorkerFactory() {
  const created: { worker: WorkerLike; transfers: Transferable[][]; terminated: boolean }[] = [];
  const factory = (): WorkerLike => {
    const rec = { worker: null as unknown as WorkerLike, transfers: [] as Transferable[][], terminated: false };
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(msg: WorkerRequest, transfer?: Transferable[]) {
        rec.transfers.push(transfer ?? []);
        queueMicrotask(() => handle(msg));
      },
      terminate() {
        rec.terminated = true;
      },
    };
    const handle = createWorkerHandler(
      (m: WorkerResponse) => queueMicrotask(() => w.onmessage?.({ data: m })),
      (fn) => setTimeout(fn, 0),
    );
    rec.worker = w;
    created.push(rec);
    return w;
  };
  return { factory, created };
}

const input = () => {
  const fx = buildAdiastematicLine();
  return { image: fx.raster, notation: 'adiastematic' as const, syllables: fx.syllables };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createNeumeDetectClient', () => {
  it('cria o worker so no primeiro pedido, resolve o resultado e transfere o buffer', async () => {
    const { factory, created } = fakeWorkerFactory();
    const client = createNeumeDetectClient({ createWorker: factory });
    expect(created).toHaveLength(0);
    const inp = input();
    const { id, result } = client.suggest(inp);
    expect(id).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0].transfers[0]).toEqual([inp.image.data.buffer]);
    const res = await result;
    expect(res.suggestions).toHaveLength(5);
    client.dispose();
  });

  it('cancel rejeita com NeumeDetectCancelledError e ignora a resposta tardia', async () => {
    const { factory } = fakeWorkerFactory();
    const client = createNeumeDetectClient({ createWorker: factory });
    const a = client.suggest(input());
    const b = client.suggest(input());
    client.cancel(a.id);
    await expect(a.result).rejects.toBeInstanceOf(NeumeDetectCancelledError);
    await expect(b.result).resolves.toHaveProperty('suggestions');
    client.dispose();
  });

  it('encerra o worker apos idleMs sem pendencias e recria no proximo pedido', async () => {
    const { factory, created } = fakeWorkerFactory();
    const client = createNeumeDetectClient({ createWorker: factory, idleMs: 20 });
    await client.suggest(input()).result;
    await new Promise((r) => setTimeout(r, 40));
    expect(created[0].terminated).toBe(true);
    await client.suggest(input()).result;
    expect(created).toHaveLength(2);
    client.dispose();
  });

  it('erro do worker rejeita todos os pendentes', async () => {
    const { factory, created } = fakeWorkerFactory();
    const client = createNeumeDetectClient({ createWorker: factory });
    const a = client.suggest(input());
    created[0].worker.onerror?.(new Error('boom'));
    await expect(a.result).rejects.toThrow(/worker failed/);
    expect(created[0].terminated).toBe(true);
  });
});
