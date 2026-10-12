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
});
