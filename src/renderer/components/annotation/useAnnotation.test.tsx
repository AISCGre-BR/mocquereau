// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useAnnotation } from "./useAnnotation";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import type { MocquereauProject } from "../../lib/models";

type Api = ReturnType<typeof useAnnotation>;

function mount(project: MocquereauProject, target = { sourceId: "s1", syllable: 0 }) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi; api?: Api } = {};
  function Inner() {
    ref.api = useAnnotation(target);
    return null;
  }
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <Inner />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  return ref as Required<typeof ref>;
}

function mkProject(): MocquereauProject {
  const p = createNewProject("t", "a");
  const src = (id: string) => ({
    id,
    order: 1,
    metadata: { siglum: id, library: "", city: "", century: "", classes: [null, null, null] as [null, null, null] },
    lines: [],
    syllableCuts: {},
  });
  return { ...p, sources: [src("s1"), src("s2")] } as MocquereauProject;
}

const ann = (r: { state: ProjectState }, id = "s1", n = 0) =>
  r.state.project!.sources.find((s) => s.id === id)!.annotations?.[n];

afterEach(cleanup);

describe("useAnnotation", () => {
  it("returns an empty annotation when none exists", () => {
    const r = mount(mkProject());
    expect(r.api.annotation).toEqual({ neumes: [], tags: [] });
  });

  it("seeds the default vocabulary on first neume and undoes both in one step", () => {
    const r = mount(mkProject());
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
    act(() => r.api.update({ neumes: [{ kind: "virga" }], tags: [] }, "neumes"));
    expect(r.state.project!.neumeVocabulary).toBeDefined();
    expect(ann(r)?.neumes).toHaveLength(1);
    act(() => r.history.undo());
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
    expect(ann(r)).toBeUndefined();
  });

  it("does not seed the vocabulary without neumes", () => {
    const r = mount(mkProject());
    act(() => r.api.update({ neumes: [], tags: [], certainty: "secure" }, "certainty"));
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
    expect(ann(r)?.certainty).toBe("secure");
  });

  it("setTagNames creates the tag and applies its id", () => {
    const r = mount(mkProject());
    act(() => r.api.setTagNames(["nova"]));
    const tags = r.state.project!.tags!;
    expect(tags.map((t) => t.name)).toEqual(["nova"]);
    expect(ann(r)?.tags).toEqual([tags[0].id]);
  });

  it("setTagNames targets a neume when an index is given", () => {
    const r = mount(mkProject());
    act(() => r.api.update({ neumes: [{ kind: "virga" }], tags: [] }, "neumes"));
    act(() => r.api.setTagNames(["x"], 0));
    const id = r.state.project!.tags![0].id;
    expect(ann(r)?.neumes[0].tags).toEqual([id]);
    expect(ann(r)?.tags).toEqual([]);
  });

  it("setComment applies completed hashtags and keeps the text", () => {
    const r = mount(mkProject());
    act(() => r.api.setComment("traço #raspagem "));
    expect(r.state.project!.tags!.map((t) => t.name)).toEqual(["raspagem"]);
    expect(ann(r)?.comment).toBe("traço #raspagem ");
    expect(ann(r)?.tags).toEqual([r.state.project!.tags![0].id]);
  });

  it("setComment ignores a hashtag still being typed, but takes it on blur", () => {
    const r = mount(mkProject());
    act(() => r.api.setComment("traço #rasp"));
    expect(r.state.project!.tags ?? []).toEqual([]);
    expect(ann(r)?.comment).toBe("traço #rasp");
    act(() => r.api.setComment("traço #rasp", { final: true }));
    expect(r.state.project!.tags!.map((t) => t.name)).toEqual(["rasp"]);
  });

  it("copyNeumesFrom copies only the neumes", () => {
    const r = mount(mkProject());
    act(() =>
      r.dispatch({
        type: "SET_ANNOTATION",
        payload: {
          sourceId: "s2",
          syllable: 0,
          annotation: { neumes: [{ kind: "virga" }], tags: ["t"], certainty: "secure", comment: "c", notes: 3 },
        },
      }),
    );
    act(() => r.api.copyNeumesFrom("s2"));
    expect(ann(r)).toEqual({ neumes: [{ kind: "virga" }], tags: [] });
  });

  it("copyNeumesFrom does nothing when the origin has no neumes", () => {
    const r = mount(mkProject());
    act(() =>
      r.dispatch({
        type: "SET_ANNOTATION",
        payload: { sourceId: "s2", syllable: 0, annotation: { neumes: [], tags: [], certainty: "secure" } },
      }),
    );
    act(() => r.api.copyNeumesFrom("s2"));
    expect(ann(r)).toBeUndefined();
  });

  it("createKind adds kind and category and undoes together with the sequence", () => {
    const r = mount(mkProject());
    act(() => {
      const id = r.api.createKind({ name: "climacus sub", categoryName: "Formas raras", defaultNotes: 5 });
      r.api.update({ neumes: [{ kind: id }], tags: [] }, "neumes");
    });
    const voc = r.state.project!.neumeVocabulary!;
    const kind = voc.kinds.find((k) => k.name === "climacus sub")!;
    expect(kind.id).toMatch(/^kind\./);
    expect(kind.defaultNotes).toBe(5);
    const cat = voc.categories.find((c) => c.id === kind.categoryId)!;
    expect(cat.name).toBe("Formas raras");
    expect(cat.id).toMatch(/^cat\./);
    expect(ann(r)?.neumes).toEqual([{ kind: kind.id }]);
    act(() => r.history.undo());
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
    expect(ann(r)).toBeUndefined();
  });

  it("createKind reuses an existing category by folded name", () => {
    const r = mount(mkProject());
    act(() => r.api.update({ neumes: [{ kind: "virga" }], tags: [] }, "neumes"));
    const compound = r.state.project!.neumeVocabulary!.categories.find((c) => c.id === "cat.compound")!;
    let id = "";
    act(() => {
      id = r.api.createKind({ name: "x", categoryName: ` ${(compound.name ?? "Compostos").toUpperCase()} `, defaultNotes: 2 });
    });
    const voc = r.state.project!.neumeVocabulary!;
    expect(voc.kinds.find((k) => k.id === id)!.categoryId).toBe("cat.compound");
    expect(voc.categories).toHaveLength(3);
  });

  it("createKind with only a name: no category, no default notes, one undo step", () => {
    const r = mount(mkProject());
    act(() => {
      const id = r.api.createKind({ name: " solto " });
      r.api.update({ neumes: [{ kind: id }], tags: [] }, "neumes");
    });
    const voc = r.state.project!.neumeVocabulary!;
    const kind = voc.kinds.find((k) => k.name === "solto")!;
    expect(kind).toEqual({ id: kind.id, name: "solto" });
    expect(voc.categories).toHaveLength(3);
    expect(ann(r)?.neumes).toEqual([{ kind: kind.id }]);
    act(() => r.history.undo());
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
    expect(ann(r)).toBeUndefined();
  });

  it("createKind with an empty category name creates no category", () => {
    const r = mount(mkProject());
    let id = "";
    act(() => {
      id = r.api.createKind({ name: "x", categoryName: "  ", defaultNotes: 2 });
      r.api.update({ neumes: [{ kind: id }], tags: [] }, "neumes");
    });
    const voc = r.state.project!.neumeVocabulary!;
    expect(voc.kinds.find((k) => k.id === id)).toEqual({ id, name: "x", defaultNotes: 2 });
    expect(voc.categories).toHaveLength(3);
  });

  it("several creates in the same event keep every kind (one undo step)", () => {
    const r = mount(mkProject());
    act(() => {
      const a = r.api.createKind({ name: "a" });
      const b = r.api.createKind({ name: "b" });
      r.api.update({ neumes: [{ kind: a }, { kind: b }], tags: [] }, "neumes");
    });
    const names = r.state.project!.neumeVocabulary!.kinds.map((k) => k.name);
    expect(names).toContain("a");
    expect(names).toContain("b");
    expect(ann(r)?.neumes).toHaveLength(2);
    act(() => r.history.undo());
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
  });

  it("seeds the vocabulary again after a create is undone", () => {
    const r = mount(mkProject());
    act(() => {
      const id = r.api.createKind({ name: "climacus sub", categoryName: "Formas raras", defaultNotes: 5 });
      r.api.update({ neumes: [{ kind: id }], tags: [] }, "neumes");
    });
    act(() => r.history.undo());
    expect(r.state.project!.neumeVocabulary).toBeUndefined();
    act(() => r.api.update({ neumes: [{ kind: "virga" }], tags: [] }, "neumes"));
    expect(r.state.project!.neumeVocabulary).toBeDefined();
    expect(ann(r)?.neumes).toEqual([{ kind: "virga" }]);
  });
});
