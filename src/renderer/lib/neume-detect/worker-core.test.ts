import { describe, expect, it } from 'vitest';
import { PROTOCOL, type WorkerResponse } from './protocol';
import { buildAdiastematicLine } from './synthetic';
import { createWorkerHandler } from './worker-core';

function setup() {
  const out: WorkerResponse[] = [];
  const tasks: (() => void)[] = [];
  const handle = createWorkerHandler((m) => out.push(m), (fn) => tasks.push(fn));
  const run = () => {
    while (tasks.length) tasks.shift()!();
  };
  return { out, handle, run };
}

describe('worker-core', () => {
  const fx = buildAdiastematicLine();
  const input = { image: fx.raster, notation: 'adiastematic' as const, syllables: fx.syllables };

  it('responde result com o mesmo id', () => {
    const { out, handle, run } = setup();
    handle({ protocol: PROTOCOL, type: 'suggest', id: 7, input });
    run();
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('result');
    expect(out[0].id).toBe(7);
  });

  it('cancelamento de pedido na fila responde cancelled e nao processa', () => {
    const { out, handle, run } = setup();
    handle({ protocol: PROTOCOL, type: 'suggest', id: 1, input });
    handle({ protocol: PROTOCOL, type: 'suggest', id: 2, input });
    handle({ protocol: PROTOCOL, type: 'cancel', id: 2 });
    run();
    expect(out.map((m) => [m.type, m.id])).toEqual([
      ['cancelled', 2],
      ['result', 1],
    ]);
  });

  it('erro vira mensagem error; mensagens de outro protocolo sao ignoradas', () => {
    const { out, handle, run } = setup();
    handle({ protocol: 'outro', type: 'suggest', id: 3, input });
    handle({
      protocol: PROTOCOL,
      type: 'suggest',
      id: 4,
      input: { ...input, image: { data: new Uint8ClampedArray(3), width: 1, height: 1 } },
    });
    run();
    expect(out).toEqual([{ protocol: PROTOCOL, type: 'error', id: 4, message: expect.stringMatching(/width \* height \* 4/) }]);
  });
});
