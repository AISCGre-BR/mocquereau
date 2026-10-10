import { describe, expect, it } from 'vitest';
import { findTextLine, isTextComponent, isTextDebris, wordSpans } from './text-line';

const c = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, area: w * h });

/** Texto: palavras de letras 12 x 16 (base 200, vao 4 px), separadas por `space` px. */
function textRow(words: number[], x0 = 50, space = 30, base = 200) {
  const out: ReturnType<typeof c>[] = [];
  let x = x0;
  for (const n of words) {
    for (let k = 0; k < n; k++) {
      out.push(c(x, base - 16, 12, 16));
      x += 16;
    }
    x += space;
  }
  return out;
}

describe('text-line', () => {
  const neumes = [c(60, 40, 10, 21), c(150, 60, 12, 21), c(260, 50, 9, 21), c(380, 45, 12, 21), c(470, 70, 6, 21)];

  it('acha a linha de texto sob os neumas (pico mais baixo)', () => {
    const text = textRow([4, 3, 5]);
    const tl = findTextLine([...neumes, ...text], 600, { kind: 'lowest' }, 6)!;
    expect(tl.baseline).toBe(200);
    expect(tl.xHeight).toBe(16);
    expect(tl.top).toBe(168);
    expect(text.every((t) => isTextComponent(t, tl))).toBe(true);
    expect(neumes.some((n) => isTextComponent(n, tl))).toBe(false);
  });

  it('neuma que desce ate as ascendentes nao e descartado; descendente e ascendente sao texto', () => {
    const text = textRow([4, 3, 5]);
    const tl = findTextLine([...neumes, ...text], 600, { kind: 'lowest' }, 6)!;
    expect(isTextComponent(c(300, 160, 10, 20), tl)).toBe(false);
    expect(isTextComponent(c(300, 150, 10, 40), tl)).toBe(false);
    expect(isTextComponent(c(300, 184, 12, 26), tl)).toBe(true); // descendente: topo na altura-x
    expect(isTextComponent(c(300, 168, 12, 32), tl)).toBe(true); // ascendente
    expect(isTextDebris(c(300, 176, 4, 4), tl)).toBe(true); // pingo do i
  });

  it('neumas alinhados por acaso (esparsos) nao viram texto; altura-x minima', () => {
    const aligned = [0, 1, 2, 3, 4, 5].map((k) => c(40 + k * 90, 80, 12, 21));
    expect(findTextLine(aligned, 600, { kind: 'lowest' }, 6)).toBeNull();
    expect(findTextLine(textRow([4, 3, 5]), 600, { kind: 'lowest' }, 20)).toBeNull();
  });

  it('sílabas curtas com letras de haste: as hastes contam como vizinhas no espaçamento', () => {
    // 'Do mi nus di xit ad me fi li': letras 12 x 16, hastes 12 x 32 (D d t f l), sílabas afastadas
    const sy = ['Do', 'mi', 'nus', 'di', 'xit', 'ad', 'me', 'fi', 'li'];
    const comps: ReturnType<typeof c>[] = [];
    sy.forEach((t, j) => {
      let x = 40 + j * 160;
      for (const ch of t) {
        const tall = /[Ddtfl]/.test(ch);
        comps.push(c(x, tall ? 168 : 184, 12, tall ? 32 : 16));
        x += 16;
      }
    });
    const tl = findTextLine(comps, 1500, { kind: 'lowest' }, 6);
    expect(tl?.baseline).toBe(200);
    expect(tl?.xHeight).toBe(16);
  });

  it('modo D: primeiro pico abaixo da pauta', () => {
    const upper = textRow([5, 5], 50, 30, 100);
    const lower = textRow([5, 5], 50, 30, 200);
    expect(findTextLine([...upper, ...lower], 400, { kind: 'below', y: 120 }, 6)!.baseline).toBe(200);
  });

  it('wordSpans: W - 1 maiores vaos quando coerentes', () => {
    const text = textRow([4, 3, 5]);
    expect(wordSpans(text, 3)).toEqual([
      { x0: 50, x1: 110 },
      { x0: 144, x1: 188 },
      { x0: 222, x1: 298 },
    ]);
    expect(wordSpans(text, 1)).toEqual([{ x0: 50, x1: 298 }]);
    // 4 palavras pedidas com 3 vaos iguais grandes: o 4o vao (letra) e muito menor -> coerente;
    // 2 palavras pedidas com 2 vaos iguais: incoerente
    expect(wordSpans(text, 2)).toBeNull();
    expect(wordSpans([], 2)).toBeNull();
  });
});
