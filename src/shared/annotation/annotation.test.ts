import { describe, it, expect } from "vitest";
import { createDefaultVocabulary } from "./default-vocabulary";
import { effectiveNotes, normalizeAnnotation, withAnnotation } from "./annotation";

const v = createDefaultVocabulary((k) => k);

describe("anotação", () => {
  it("total efetivo soma notas do item ou o padrão do tipo", () => {
    expect(effectiveNotes({ neumes: [{ kind: "pes" }, { kind: "virga", notes: 2 }], tags: [] }, v)).toBe(4);
  });
  it("lista vazia usa o total manual; sem total é indefinido", () => {
    expect(effectiveNotes({ neumes: [], notes: 5, tags: [] }, v)).toBe(5);
    expect(effectiveNotes({ neumes: [], tags: [] }, v)).toBeUndefined();
    expect(effectiveNotes(undefined, v)).toBeUndefined();
  });
  it("tipo desconhecido sem notas conta como indefinido, não como zero", () => {
    expect(effectiveNotes({ neumes: [{ kind: "sumido" }], tags: [] }, v)).toBeUndefined();
  });
  it("tipo sem notas padrão: indefinido sem notas no item, soma quando o item informa", () => {
    const w = { ...v, kinds: [...v.kinds, { id: "solto", name: "solto" }] };
    expect(effectiveNotes({ neumes: [{ kind: "solto" }, { kind: "pes" }], tags: [] }, w)).toBeUndefined();
    expect(effectiveNotes({ neumes: [{ kind: "solto", notes: 3 }, { kind: "pes" }], tags: [] }, w)).toBe(5);
  });
  it("normalizar tira campos vazios e devolve null se nada sobrar", () => {
    expect(normalizeAnnotation({ neumes: [], tags: [], comment: "" })).toBeNull();
    expect(normalizeAnnotation({ neumes: [{ kind: "pes", letters: [], comment: "" }], tags: [] }))
      .toEqual({ neumes: [{ kind: "pes" }], tags: [] });
  });
  it("withAnnotation grava, substitui e remove a chave", () => {
    const s = { annotations: { 1: { neumes: [], tags: [], comment: "a" } } };
    expect(withAnnotation(s, 2, { neumes: [], tags: [], comment: "b" }).annotations).toHaveProperty("2");
    expect(withAnnotation(s, 1, null).annotations).toBeUndefined();
  });
});
