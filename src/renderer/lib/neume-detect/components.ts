// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Componentes conexos 8-conexos (duas passadas, union-find) e filtros.
// Porte de components() de othmar/candidates.py.
import type { Params } from './scale';
import type { Mask, PxBox } from './types';

export interface Component extends PxBox {
  /** Rotulo em `labels` (1..count). */
  label: number;
  /** Pixels de tinta. */
  area: number;
}

export interface Labeling {
  /** 0 = fundo; 1..count = componente. */
  labels: Int32Array;
  count: number;
  /** components[i] tem label i + 1. */
  components: Component[];
}

function find(parent: Int32Array, a: number): number {
  while (parent[a] !== a) {
    parent[a] = parent[parent[a]];
    a = parent[a];
  }
  return a;
}

function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra === rb) return;
  if (ra < rb) parent[rb] = ra;
  else parent[ra] = rb;
}

/** Rotulagem 8-conexa. Rotulos finais em ordem de varredura (primeiro pixel de cada componente). */
export function labelComponents(m: Mask): Labeling {
  const { width: w, height: h, data } = m;
  const labels = new Int32Array(w * h);
  let parent = new Int32Array(1024);
  let next = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i]) continue;
      // vizinhos ja visitados: W, NW, N, NE
      const nW = x > 0 ? labels[i - 1] : 0;
      const nNW = x > 0 && y > 0 ? labels[i - w - 1] : 0;
      const nN = y > 0 ? labels[i - w] : 0;
      const nNE = x < w - 1 && y > 0 ? labels[i - w + 1] : 0;
      let l = 0;
      if (nW) l = nW;
      if (nNW && (l === 0 || nNW < l)) l = nNW;
      if (nN && (l === 0 || nN < l)) l = nN;
      if (nNE && (l === 0 || nNE < l)) l = nNE;
      if (l === 0) {
        if (next >= parent.length) {
          const np = new Int32Array(parent.length * 2);
          np.set(parent);
          parent = np;
        }
        parent[next] = next;
        l = next++;
      } else {
        if (nW && nW !== l) union(parent, l, nW);
        if (nNW && nNW !== l) union(parent, l, nNW);
        if (nN && nN !== l) union(parent, l, nN);
        if (nNE && nNE !== l) union(parent, l, nNE);
      }
      labels[i] = l;
    }
  }
  const remap = new Int32Array(next);
  let count = 0;
  const comps: Component[] = [];
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (!l) continue;
    const r = find(parent, l);
    if (!remap[r]) {
      remap[r] = ++count;
      comps.push({ label: count, x: Infinity, y: Infinity, w: 0, h: 0, area: 0 });
    }
    const f = remap[r];
    labels[i] = f;
    const c = comps[f - 1];
    const x = i % w;
    const y = (i - x) / w;
    if (x < c.x) c.x = x;
    if (y < c.y) c.y = y;
    // w/h guardam temporariamente x1/y1 inclusivos
    if (x > c.w) c.w = x;
    if (y > c.h) c.h = y;
    c.area++;
  }
  for (const c of comps) {
    c.w = c.w - c.x + 1;
    c.h = c.h - c.y + 1;
  }
  return { labels, count, components: comps };
}

/** Rotulos de componentes que tocam qualquer pixel ligado de `invalid`. */
export function labelsTouching(lab: Labeling, invalid: Mask): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < lab.labels.length; i++) if (invalid.data[i] && lab.labels[i]) out.add(lab.labels[i]);
  return out;
}

/** Filtros de area, lado e aspecto (porte direto, limites de Params). */
export function passesFilters(c: Component, p: Params): boolean {
  const big = Math.max(c.w, c.h);
  const small = Math.min(c.w, c.h);
  if (c.area < p.minArea || c.area > p.maxArea) return false;
  if (big > p.maxSide || small < 1) return false;
  if (big < p.minSide) return false;
  if (big / small > p.maxAspect) return false;
  return true;
}

export function filterComponents(lab: Labeling, p: Params, reject?: Set<number>): Component[] {
  return lab.components.filter((c) => !(reject && reject.has(c.label)) && passesFilters(c, p));
}
