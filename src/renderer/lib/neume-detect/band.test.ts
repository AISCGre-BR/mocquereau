import { describe, expect, it } from 'vitest';
import { fracToPxRect, selectBand } from './band';

describe('band', () => {
  it('fracToPxRect arredonda para fora e corta ao raster', () => {
    expect(fracToPxRect({ x: 0.101, y: 0.5, w: 0.2, h: 0.6 }, 100, 10)).toEqual({ x: 10, y: 5, w: 21, h: 5 });
  });

  it('prioridade: usuario > ancoras > pauta > linha > nenhuma', () => {
    const anchors = [{ index: 0, box: { x: 0.1, y: 0.4, w: 0.05, h: 0.2 } }];
    expect(selectBand({ notation: 'adiastematic', band: { x: 0, y: 0.5, w: 1, h: 0.2 } }, 1000, 100)).toEqual({
      source: 'user',
      rect: { x: 0, y: 48, w: 1000, h: 24 },
      inner: { x: 0, y: 50, w: 1000, h: 20 },
    });
    expect(selectBand({ notation: 'adiastematic', anchors }, 1000, 100)).toEqual({ source: 'anchors', rect: { x: 0, y: 0, w: 1000, h: 100 } });
    // folio: uniao vertical das ancoras +50% da altura mediana (+10% de margem)
    expect(selectBand({ notation: 'adiastematic', anchors }, 1000, 1000)).toEqual({
      source: 'anchors',
      rect: { x: 0, y: 260, w: 1000, h: 480 },
      inner: { x: 0, y: 300, w: 1000, h: 400 },
    });
    expect(selectBand({ notation: 'diastematic' }, 500, 500).source).toBe('staff');
    expect(selectBand({ notation: 'adiastematic' }, 300, 100).source).toBe('image');
    expect(selectBand({ notation: 'adiastematic' }, 299, 100).source).toBe('none');
  });

  it('faixa do usuário: rect com margem de 10% e inner sem margem', () => {
    const s = selectBand({ band: { x: 0, y: 0.2, w: 1, h: 0.5 }, notation: 'adiastematic' }, 100, 100);
    expect(s.inner).toEqual({ x: 0, y: 20, w: 100, h: 50 });
    expect(s.rect).toEqual({ x: 0, y: 15, w: 100, h: 60 });
  });
});
