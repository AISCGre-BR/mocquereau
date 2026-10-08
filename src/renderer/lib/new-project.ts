// Rascunho do guia de criação: o que o guia entrega para criar o projeto.
import type { SyllabifiedWord } from "./models";
import type { HyphenationMode } from "./syllabify";

export interface NewProjectDraft {
  title: string;
  author: string;
  raw: string;
  mode: HyphenationMode;
  words: SyllabifiedWord[];
}
