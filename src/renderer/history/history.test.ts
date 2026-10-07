import { describe, expect, it } from "vitest";
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  isDirty,
  redoLabel,
  undoLabel,
  withHistory,
  type HistoryMeta,
  type HistoryState,
} from "./history";

interface Doc {
  n: number;
}
type Act = { type: "ADD"; by: number; meta?: HistoryMeta } | { type: "NOOP"; meta?: HistoryMeta };

const inner = (p: Doc | null, a: Act): Doc | null => {
  if (!p) return p;
  return a.type === "ADD" ? { n: p.n + a.by } : p;
};

function setup(start = 0) {
  let clock = 0;
  const reduce = withHistory<Doc, Act>(inner, { now: () => clock });
  return {
    reduce,
    tick: (ms: number) => {
      clock += ms;
    },
    h0: createHistory<Doc>({ n: start }),
  };
}

const add = (by: number, meta?: HistoryMeta): Act => ({ type: "ADD", by, meta });

describe("withHistory — basics", () => {
  it("starts clean, pushes undoable entries labelled by action type", () => {
    const { reduce, h0 } = setup();
    expect(isDirty(h0)).toBe(false);
    const h1 = reduce(h0, add(1));
    expect(h1.present).toEqual({ n: 1 });
    expect(isDirty(h1)).toBe(true);
    expect(canUndo(h1)).toBe(true);
    expect(undoLabel(h1)).toBe("ADD");
  });

  it("undo and redo move the present and the labels; a new action clears future", () => {
    const { reduce, h0 } = setup();
    const h2 = reduce(reduce(h0, add(1, { label: "one" })), add(2, { label: "two" }));
    const u1 = reduce(h2, { type: "UNDO" });
    expect(u1.present).toEqual({ n: 1 });
    expect(undoLabel(u1)).toBe("one");
    expect(redoLabel(u1)).toBe("two");
    const r1 = reduce(u1, { type: "REDO" });
    expect(r1.present).toEqual({ n: 3 });
    expect(canRedo(r1)).toBe(false);
    const branched = reduce(u1, add(10));
    expect(canRedo(branched)).toBe(false);
    expect(branched.present).toEqual({ n: 11 });
  });

  it("returns the same state for no-op actions and for undo/redo at the edges", () => {
    const { reduce, h0 } = setup();
    expect(reduce(h0, { type: "NOOP" })).toBe(h0);
    expect(reduce(h0, { type: "UNDO" })).toBe(h0);
    expect(reduce(h0, { type: "REDO" })).toBe(h0);
  });
});

describe("withHistory — coalescing", () => {
  it("merges actions with the same key inside the window (sliding)", () => {
    const { reduce, tick, h0 } = setup();
    let h: HistoryState<Doc> = h0;
    for (let i = 0; i < 5; i++) {
      h = reduce(h, add(1, { coalesceKey: "slider" }));
      tick(COALESCE_MS - 100);
    }
    expect(h.past).toHaveLength(1);
    expect(h.present).toEqual({ n: 5 });
    expect(reduce(h, { type: "UNDO" }).present).toEqual({ n: 0 });
  });

  it("starts a new entry after the window or with a different key", () => {
    const { reduce, tick, h0 } = setup();
    let h = reduce(h0, add(1, { coalesceKey: "a" }));
    tick(COALESCE_MS);
    h = reduce(h, add(1, { coalesceKey: "a" }));
    expect(h.past).toHaveLength(2);
    h = reduce(h, add(1, { coalesceKey: "b" }));
    expect(h.past).toHaveLength(3);
  });

  it("does not coalesce across undo", () => {
    const { reduce, h0 } = setup();
    let h = reduce(h0, add(1, { coalesceKey: "a" }));
    h = reduce(h, add(1, { coalesceKey: "a" }));
    h = reduce(h, { type: "UNDO" });
    h = reduce(h, add(5, { coalesceKey: "a" }));
    expect(h.past).toHaveLength(1);
    expect(h.present).toEqual({ n: 5 });
  });
});

describe("withHistory — limit, load, save", () => {
  it("defaults to 50 entries while snapshots still carry data URLs (S5)", () => {
    expect(HISTORY_LIMIT).toBe(50);
  });

  it(`keeps at most ${HISTORY_LIMIT} entries, dropping the oldest`, () => {
    const { reduce, h0 } = setup();
    let h = h0;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = reduce(h, add(1));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = reduce(h, { type: "UNDO" });
    expect(h.present).toEqual({ n: 5 });
  });

  it("LOAD_PROJECT resets history; dirty:true starts dirty", () => {
    const { reduce, h0 } = setup();
    const h = reduce(reduce(h0, add(1)), { type: "LOAD_PROJECT", payload: { project: { n: 42 } } });
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
    expect(isDirty(h)).toBe(false);
    const d = reduce(h, { type: "LOAD_PROJECT", payload: { project: { n: 1 }, dirty: true } });
    expect(isDirty(d)).toBe(true);
  });

  it("undoing back to the saved point is clean again; redo is dirty", () => {
    const { reduce, h0 } = setup();
    let h = reduce(h0, add(1));
    h = reduce(h, { type: "MARK_SAVED" });
    expect(isDirty(h)).toBe(false);
    h = reduce(h, add(1));
    expect(isDirty(h)).toBe(true);
    h = reduce(h, { type: "UNDO" });
    expect(isDirty(h)).toBe(false);
    h = reduce(h, { type: "REDO" });
    expect(isDirty(h)).toBe(true);
  });

  it("MARK_SAVED can record an older snapshot (save finished after more edits)", () => {
    const { reduce, h0 } = setup();
    const h1 = reduce(h0, add(1));
    const savedSnapshot = h1.present;
    const h2 = reduce(h1, add(1));
    const h3 = reduce(h2, { type: "MARK_SAVED", payload: { project: savedSnapshot } });
    expect(isDirty(h3)).toBe(true);
    expect(isDirty(reduce(h3, { type: "UNDO" }))).toBe(false);
  });

  it("MARK_SAVED breaks coalescing so the saved point stays reachable", () => {
    const { reduce, h0 } = setup();
    let h = reduce(h0, add(1, { coalesceKey: "t" }));
    h = reduce(h, { type: "MARK_SAVED" });
    h = reduce(h, add(1, { coalesceKey: "t" }));
    expect(h.past).toHaveLength(2);
    expect(isDirty(reduce(h, { type: "UNDO" }))).toBe(false);
  });

  it("undoable:false changes the present without an entry", () => {
    const { reduce, h0 } = setup();
    const h = reduce(h0, add(3, { undoable: false }));
    expect(h.present).toEqual({ n: 3 });
    expect(h.past).toHaveLength(0);
    expect(isDirty(h)).toBe(true);
  });
});
