import { describe, it, expect } from "vitest";
import { parseHashTags, resolveTagNames, removeTagEverywhere, mergeTags, findTagByName } from "./tags";

describe("etiquetas", () => {
  it("#nome na observação, com acentos e hífens; ignora # no meio da palavra", () => {
    expect(parseHashTags("Traço curto. #raspagem e #correção-posterior; a#b")).toEqual(["raspagem", "correção-posterior"]);
  });
  it("resolveTagNames reaproveita sem diferenciar caixa/acento e cria as novas", () => {
    const r = resolveTagNames([{ id: "t1", name: "Raspagem" }], ["raspagem", "nova"]);
    expect(r.ids[0]).toBe("t1");
    expect(r.tags).toHaveLength(2);
    expect(findTagByName(r.tags, "NOVA")?.id).toBe(r.ids[1]);
  });
  const project = () => ({
    tags: [{ id: "a", name: "a" }, { id: "b", name: "b" }],
    sources: [{ annotations: { 0: { neumes: [{ kind: "pes", tags: ["a"] }], tags: ["a", "b"] } } }],
  });
  it("excluir remove de sílabas e neumas", () => {
    const p = removeTagEverywhere(project(), "a");
    expect(p.tags.map((t) => t.id)).toEqual(["b"]);
    expect(p.sources[0].annotations![0]).toEqual({ neumes: [{ kind: "pes" }], tags: ["b"] });
  });
  it("juntar troca a por b sem duplicar", () => {
    const p = mergeTags(project(), "a", "b");
    expect(p.tags.map((t) => t.id)).toEqual(["b"]);
    expect(p.sources[0].annotations![0]).toEqual({ neumes: [{ kind: "pes", tags: ["b"] }], tags: ["b"] });
  });
});
