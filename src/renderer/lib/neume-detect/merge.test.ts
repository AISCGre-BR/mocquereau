// Casos de tests/test_candidates.py do Othmar neo, portados um a um.
import { describe, expect, it } from 'vitest';
import { mergeBoxes, mergeBoxesIndexed } from './merge';

const b = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('mergeBoxes', () => {
  it('junta proximas', () => {
    expect(mergeBoxes([b(0, 0, 10, 10), b(12, 0, 10, 10)], 4, 4, 60, 60)).toEqual([b(0, 0, 22, 10)]);
  });

  it('respeita distancia e tamanho maximo', () => {
    expect(mergeBoxes([b(0, 0, 10, 10), b(30, 0, 10, 10)], 4, 4, 60, 60)).toHaveLength(2);
    expect(mergeBoxes([b(0, 0, 10, 10), b(12, 0, 10, 10)], 4, 4, 15, 60)).toHaveLength(2);
  });

  it('cadeia e sobreposicao; lista vazia', () => {
    expect(mergeBoxes([b(0, 0, 10, 10), b(5, 5, 10, 10), b(17, 5, 10, 10)], 4, 4, 60, 60)).toEqual([b(0, 0, 27, 15)]);
    expect(mergeBoxes([], 4, 4, 60, 60)).toEqual([]);
  });

  it('versao indexada informa os membros', () => {
    const out = mergeBoxesIndexed([b(0, 0, 10, 10), b(100, 0, 5, 5), b(12, 0, 10, 10)], 4, 4, 60, 60);
    expect(out.map((m) => m.members)).toEqual([[0, 2], [1]]);
  });
});
