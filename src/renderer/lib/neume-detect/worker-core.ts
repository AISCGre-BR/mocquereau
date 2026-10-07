// SPDX-License-Identifier: GPL-3.0-or-later
// Logica do worker sem dependencia de DOM: fila serial, cancelamento de pedidos ainda na fila.
// suggestBoxes e sincrono; um pedido em execucao nao e interrompido (o cliente descarta o resultado).
import { suggestBoxes } from './pipeline';
import { PROTOCOL, type WorkerRequest, type WorkerResponse } from './protocol';
import type { SuggestInput } from './types';

export type Schedule = (fn: () => void) => void;

const defaultSchedule: Schedule = (fn) => {
  setTimeout(fn, 0);
};

export function createWorkerHandler(
  post: (msg: WorkerResponse) => void,
  schedule: Schedule = defaultSchedule,
): (msg: unknown) => void {
  const queue: { id: number; input: SuggestInput }[] = [];
  let scheduled = false;

  const pump = () => {
    scheduled = false;
    const job = queue.shift();
    if (!job) return;
    try {
      post({ protocol: PROTOCOL, type: 'result', id: job.id, result: suggestBoxes(job.input) });
    } catch (e) {
      post({ protocol: PROTOCOL, type: 'error', id: job.id, message: e instanceof Error ? e.message : String(e) });
    }
    if (queue.length) {
      scheduled = true;
      schedule(pump);
    }
  };

  return (raw: unknown) => {
    const msg = raw as WorkerRequest;
    if (!msg || msg.protocol !== PROTOCOL) return;
    if (msg.type === 'cancel') {
      const i = queue.findIndex((j) => j.id === msg.id);
      if (i >= 0) {
        queue.splice(i, 1);
        post({ protocol: PROTOCOL, type: 'cancelled', id: msg.id });
      }
      return;
    }
    if (msg.type === 'suggest') {
      queue.push({ id: msg.id, input: msg.input });
      if (!scheduled) {
        scheduled = true;
        schedule(pump);
      }
    }
  };
}
