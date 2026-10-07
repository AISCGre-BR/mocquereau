// Pigmentos do Parchment Design: paleta de destaque do conteúdo (caixas de
// recorte, chips de sílaba, seções). Ciclo padrão por sílaba, nesta ordem, escolhida
// para que vizinhos sejam distinguíveis também com deuteranopia.

export const PIGMENTS = ["lapis", "orpiment", "verdigris", "minium", "murex", "malachite"] as const;
export type Pigment = (typeof PIGMENTS)[number];
export type PigmentClass = `sc-pig-${Pigment}`;

/** Classe `sc-pig-*` da sílaba pelo índice global (0-based) no texto do projeto. */
export function pigmentOf(globalSyllableIndex: number): PigmentClass {
  const n = PIGMENTS.length;
  const i = Number.isFinite(globalSyllableIndex) ? Math.trunc(globalSyllableIndex) : 0;
  return `sc-pig-${PIGMENTS[((i % n) + n) % n]}`;
}
