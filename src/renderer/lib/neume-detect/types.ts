// SPDX-License-Identifier: GPL-3.0-or-later
// Tipos da biblioteca de deteccao de neumas (onda A3). Sem dependencias de DOM.

/** Imagem RGBA 8 bits por canal, linha a linha (mesmo layout de ImageData). */
export interface RasterRGBA {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Imagem de um canal, 0 = preto, 255 = branco. */
export interface GrayImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Mascara binaria: 1 = ligado (tinta, regiao valida), 0 = desligado. */
export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Caixa em pixels inteiros do raster de trabalho: [x, x + w) x [y, y + h). */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retangulo em fracoes (0..1) da largura/altura do raster de entrada (mesma forma de SyllableBox). */
export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Notation = 'adiastematic' | 'diastematic';
export type SuggestMode = 'sequential' | 'candidates';
export type ChannelName = 'r' | 'g' | 'b' | 'gray';

export interface SuggestSyllable {
  /** Indice global da silaba (chave do resultado). */
  index: number;
  /** Letras da silaba; o comprimento alimenta o prior de posicao. */
  text: string;
  /** Silabas com o mesmo wordIndex formam uma palavra; muda de valor na fronteira de palavra. */
  wordIndex: number;
  /** false = silaba ocupa espaco na particao (ex.: rejeitada na sessao) mas nao recebe sugestao. Padrao true. */
  suggest?: boolean;
}

export interface SuggestAnchor {
  /** Indice global; precisa existir em `syllables`. */
  index: number;
  box: FracRect;
}

export interface SuggestInput {
  /** Raster ja na geometria visual (rotacao e espelhamento aplicados pelo chamador). */
  image: RasterRGBA;
  notation: Notation;
  /** Silabas da linha, em ordem de leitura. O chamador exclui gaps e silabas cobertas por outra imagem. */
  syllables: SuggestSyllable[];
  /** Caixas existentes (desenhadas, aceitas ou confirmadas) na imagem. */
  anchors?: SuggestAnchor[];
  /** Faixa de neumas desenhada pelo usuario, em fracoes do raster. */
  band?: FracRect;
  /**
   * Varias faixas de neumas desenhadas pelo usuario (fracoes do raster), em ordem de leitura (o
   * chamador entrega de cima para baixo). Tem prioridade sobre `band`. As faixas formam uma unica
   * linha virtual: as silabas se distribuem por elas em ordem e nenhuma caixa atravessa faixas.
   */
  bands?: FracRect[];
  /** 'candidates': todos os grupos de neumas das áreas, sem sílaba; `syllables` é ignorado. Padrão 'sequential'. */
  mode?: SuggestMode;
  /** Confiança mínima de uma sugestão (modo sequencial). Padrão MIN_CONFIDENCE; a avaliação varre o valor. */
  minConfidence?: number;
}

export type BandSource = 'user' | 'anchors' | 'staff' | 'image' | 'none';

export interface Suggestion {
  index: number;
  box: FracRect;
  /** 0..1, interna (avaliacao e ordenacao da revisao). */
  confidence: number;
}

export interface Candidate {
  /** Caixa do grupo (mesmo pós-processamento de uma sugestão: pad, pauta, corte no texto), em frações do raster. */
  box: FracRect;
  /** Índice da área em `bands` (0 sem `bands`). */
  band: number;
}

export interface StaffDebug {
  /** Posicao y media de cada linha, em fracao da altura do raster. */
  lines: number[];
  /** Espaco de pauta s = d + t, em px do raster de trabalho. */
  spacing: number;
  lineThickness: number;
  /** true quando a pauta existe no cinza mas some no canal R (pauta vermelha): remocao pulada. */
  red: boolean;
}

export interface BandDebug {
  /** Faixa efetivamente processada, em fracoes do raster. */
  band: FracRect;
  mode: 'A' | 'D';
  glyphs: number;
  /** Binarizacao usada na faixa (ausente quando a faixa nao foi analisada). */
  channel?: ChannelName;
  sauvolaK?: number;
}

export interface SuggestDebug {
  mode: 'A' | 'D';
  bandSource: BandSource;
  /** Faixa efetivamente processada, em fracoes do raster. */
  band: FracRect | null;
  /** Fator raster de trabalho / raster de entrada. */
  scale: number;
  /** Espessura de traco estimada u, em px do raster de trabalho. */
  strokeWidth: number;
  channel: ChannelName;
  sauvolaK: number;
  staff?: StaffDebug;
  textLine?: { baseline: number; xHeight: number };
  counts: { components: number; text: number; glyphs: number; bars: number; ignored: number };
  /** true quando a imagem e um folio sem faixa inferivel: a UI deve pedir a faixa. */
  needsBand: boolean;
  /** Com `bands`: uma entrada por faixa, na ordem dada. */
  bands?: BandDebug[];
  ms: Record<string, number>;
}

export interface SuggestResult {
  /** Uma entrada por silaba que recebeu sugestao, ordenada por index. */
  suggestions: Suggestion[];
  /** Só no modo 'candidates': em ordem de leitura (área, depois centro x). */
  candidates?: Candidate[];
  debug: SuggestDebug;
}
