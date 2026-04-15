// src/renderer/lib/models.ts

/** Imagem armazenada localmente */
export interface StoredImage {
  /** Data URL (base64) da imagem — blob URLs são session-scoped e não serializáveis */
  dataUrl: string;
  /** Largura original em pixels */
  width: number;
  /** Altura original em pixels */
  height: number;
  /** Tipo MIME (ex.: "image/png", "image/jpeg") */
  mimeType: string;
}

export interface SyllabifiedWord {
  /** Palavra original sem hifenização */
  original: string;
  /** Sílabas resultantes da divisão */
  syllables: string[];
}

export interface Section {
  id: string;
  /** Nome da seção (ex.: "Sanctus", "Pleni sunt", "Hosanna") */
  name: string;
  /** Índices das palavras desta seção no array text.words [startIndex, endIndex] */
  wordRange: [startIndex: number, endIndex: number];
}

/**
 * Bounding box for a single syllable on a manuscript line.
 * All coordinates are fractions of image dimensions (0.0–1.0),
 * making them resolution-independent.
 */
export interface SyllableBox {
  /** Left edge as fraction of image width */
  x: number;
  /** Top edge as fraction of image height */
  y: number;
  /** Width as fraction of image width */
  w: number;
  /** Height as fraction of image height */
  h: number;
}

/**
 * Uma linha de manuscrito carregada no editor.
 * Cada linha cobre um subconjunto contíguo de sílabas globais.
 */
export interface ManuscriptLine {
  id: string;

  /** Imagem carregada (fólio completo ou recorte da linha) */
  image: StoredImage;

  /**
   * Mapeamento: quais sílabas globais esta linha cobre.
   * syllableRange.start e .end são índices globais (0-based, inclusive).
   */
  syllableRange: {
    start: number;
    end: number;
  };

  /**
   * Posições dos divisores (0.0 a 1.0, relativas à largura da imagem).
   * Número de divisores = (end - start + 1 - gaps.length - 1)
   * (uma fatia por sílaba ativa, menos um para dividir N fatias).
   */
  dividers: number[];

  /**
   * Índices globais de sílabas dentro do range que não têm
   * neuma visível nesta linha (gap explícito).
   */
  gaps: number[];

  /**
   * Bounding boxes per global syllable index (Phase 5.1+).
   * Key: global syllable index. Value: box in fractions, or null (gap).
   * Absent key also means gap / not yet drawn.
   * Replaces the divider model. Optional for backward-compat with Phase 4/5 projects.
   */
  syllableBoxes?: Record<number, SyllableBox | null>;

  /** Se os recortes desta linha já foram confirmados */
  confirmed: boolean;
}

/** Uma fonte manuscrita (uma linha da tabela comparativa) */
export interface ManuscriptSource {
  id: string;
  /** Ordem de exibição na tabela */
  order: number;

  /** Metadados do manuscrito */
  metadata: {
    siglum: string;
    library: string;
    city: string;
    century: string;
    folio: string;
    cantusId?: string;
    sourceUrl?: string;
    iiifManifest?: string;
    notation: "adiastematic" | "diastematic" | "square" | "modern" | "other";
  };

  /**
   * Lista de imagens/linhas carregadas para esta fonte.
   * Cada linha cobre um subconjunto contíguo de sílabas.
   */
  lines: ManuscriptLine[];

  /**
   * Recortes finais indexados por sílaba global.
   * Chave: índice global da sílaba (0-based).
   * Valor: imagem recortada ou null (gap explícito).
   */
  syllableCuts: Record<number, StoredImage | null>;
}

/** Projeto completo de tabela neumática */
export interface MocquereauProject {
  /** Metadados do projeto */
  meta: {
    title: string;
    author: string;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
  };

  /** Texto litúrgico com silabificação */
  text: {
    raw: string;
    words: SyllabifiedWord[];
    hyphenationMode: "liturgical" | "classical" | "modern" | "manual";
  };

  /** Seções da peça */
  sections: Section[];

  /** Lista de fontes/manuscritos (linhas da tabela) */
  sources: ManuscriptSource[];
}

// ── Gueranger import format ─────────────────────────────────────────────────

export interface GuerangerManuscript {
  siglum: string;
  library: string;
  city: string;
  century: string;
  incipit: string;
  genre: string;
  feast: string;
  folio: string;
  cantusId: string;
  iiifManifest: string;
  imageAvailable: boolean;
  sourceUrl: string;
  sourceDatabase: string;
}

export interface GuerangerExport {
  version: "1.0";
  searchQuery: string;
  exportedAt: string; // ISO 8601
  manuscripts: GuerangerManuscript[];
}

// ── IPC bridge type ──────────────────────────────────────────────────────────

/** API exposta como window.mocquereau pelo preload bridge */
export interface MocquereauAPI {
  // Projeto
  saveProject: (project: MocquereauProject, existingPath?: string) => Promise<{ filePath: string } | null>;
  openProject: () => Promise<{ project: MocquereauProject; filePath: string } | null>;
  importGueranger: () => Promise<GuerangerExport | null>;

  // Exportação
  exportDocx: (project: MocquereauProject) => Promise<{ filePath: string } | null>;

  // Imagens
  fetchIiifImage: (url: string) => Promise<{ dataUrl: string; width: number; height: number } | null>;
  readClipboardImage: () => Promise<{ dataUrl: string; width: number; height: number } | null>;
  openImageFile: () => Promise<{ dataUrl: string; width: number; height: number } | null>;

  // Sistema
  openExternal: (url: string) => Promise<void>;
  getLanguage: () => Promise<string>;
  setLanguage: (lang: string) => Promise<string>;
  getTheme: () => Promise<string>;
  setTheme: (theme: string) => Promise<boolean>;
}

// ── DOCX Export Payload ──────────────────────────────────────────────────────

/**
 * Data for a single table cell in the DOCX export.
 * Renderer pre-computes crops; main process uses these directly.
 */
export interface DocxCellData {
  /** PNG image bytes, or null for gap/unfilled cells */
  pngBuffer: ArrayBuffer | null;
  /** Original crop width in pixels (needed for aspect ratio calculation in main) */
  cropWidth: number;
  /** Original crop height in pixels */
  cropHeight: number;
  /** True if this syllable is a gap (explicit gap marker) */
  isGap: boolean;
  /** True if this syllable index is the last syllable of a word (thicker right border) */
  isWordBoundary: boolean;
}

/**
 * Metadata row for a single manuscript source (first column of DOCX table).
 */
export interface DocxSourceMeta {
  siglum: string;
  city: string;
  century: string;
  folio: string;
}

/**
 * Complete payload sent from renderer to main via IPC for DOCX generation.
 * Renderer performs all canvas crops; main only builds the docx Document.
 */
export interface DocxExportPayload {
  /** Project title (used in document header) */
  title: string;
  /** Project author (used in document header) */
  author: string;
  /** Raw liturgical text (used in document header) */
  rawText: string;
  /**
   * Flat array of syllable strings in text order.
   * Length = total number of columns in the table.
   */
  syllables: string[];
  /**
   * Per-source rows. Each row has cells[syllableIdx] for each syllable.
   * Length matches sources order in project.
   */
  rows: Array<{
    meta: DocxSourceMeta;
    /** Indexed by global syllable index (0-based). Length = syllables.length */
    cells: DocxCellData[];
  }>;
  /**
   * Word boundary flags indexed by global syllable index.
   * Duplicated from DocxCellData.isWordBoundary for convenience when building header rows.
   */
  wordBoundaries: boolean[];
}
