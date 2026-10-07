// src/renderer/history/history.ts
//
// Generic undo/redo around a reducer (spec D5/D7, section 7). Snapshots are
// immutable and share structure; projects carry no image bytes in the state
// that matters for wave B, so 200 entries are cheap. "Dirty" is reference
// identity between present and the last saved snapshot.

export interface FocusHint {
  sourceId?: string;
  lineId?: string;
  syllableIdx?: number;
}

export interface HistoryMeta {
  label?: string;
  coalesceKey?: string;
  focus?: FocusHint;
  undoable?: boolean;
}

export interface Entry<P> {
  project: P | null;
  label: string;
  focus?: FocusHint;
}

export interface HistoryState<P> {
  past: Entry<P>[];
  present: P | null;
  future: Entry<P>[];
  savedRef: P | null;
  lastCoalesce?: { key: string; at: number };
}

export type HistoryControl<P> =
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "MARK_SAVED"; payload?: { project: P | null } }
  | { type: "LOAD_PROJECT"; payload: { project: P | null; dirty?: boolean } };

export interface HistoryOptions<A> {
  limit?: number;
  coalesceMs?: number;
  now?: () => number;
  metaFor?: (action: A) => HistoryMeta | undefined;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 1000;

export function createHistory<P>(present: P | null = null, dirty = false): HistoryState<P> {
  return { past: [], present, future: [], savedRef: dirty ? null : present };
}

export function canUndo<P>(h: HistoryState<P>): boolean {
  return h.past.length > 0;
}

export function canRedo<P>(h: HistoryState<P>): boolean {
  return h.future.length > 0;
}

export function isDirty<P>(h: HistoryState<P>): boolean {
  return h.present !== h.savedRef;
}

export function undoLabel<P>(h: HistoryState<P>): string | null {
  return h.past.length > 0 ? h.past[h.past.length - 1].label : null;
}

export function redoLabel<P>(h: HistoryState<P>): string | null {
  return h.future.length > 0 ? h.future[0].label : null;
}

export function undo<P>(h: HistoryState<P>): HistoryState<P> {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return {
    ...h,
    past: h.past.slice(0, -1),
    present: prev.project,
    future: [{ project: h.present, label: prev.label, focus: prev.focus }, ...h.future],
    lastCoalesce: undefined,
  };
}

export function redo<P>(h: HistoryState<P>): HistoryState<P> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return {
    ...h,
    past: [...h.past, { project: h.present, label: next.label, focus: next.focus }],
    present: next.project,
    future: rest,
    lastCoalesce: undefined,
  };
}

export function markSaved<P>(h: HistoryState<P>, project?: P | null): HistoryState<P> {
  return { ...h, savedRef: project === undefined ? h.present : project, lastCoalesce: undefined };
}

export function push<P>(
  h: HistoryState<P>,
  next: P | null,
  meta: HistoryMeta,
  now: number,
  opts: { limit: number; coalesceMs: number },
): HistoryState<P> {
  if (next === h.present) return h;
  if (meta.undoable === false) return { ...h, present: next };
  const key = meta.coalesceKey;
  if (
    key &&
    h.lastCoalesce &&
    h.lastCoalesce.key === key &&
    now - h.lastCoalesce.at < opts.coalesceMs &&
    h.past.length > 0
  ) {
    return { ...h, present: next, future: [], lastCoalesce: { key, at: now } };
  }
  const past = [...h.past, { project: h.present, label: meta.label ?? "edit", focus: meta.focus }];
  return {
    ...h,
    past: past.length > opts.limit ? past.slice(past.length - opts.limit) : past,
    present: next,
    future: [],
    lastCoalesce: key ? { key, at: now } : undefined,
  };
}

const CONTROL_TYPES = new Set(["UNDO", "REDO", "MARK_SAVED", "LOAD_PROJECT"]);

function isControl<P>(action: { type: string }): action is HistoryControl<P> {
  return CONTROL_TYPES.has(action.type);
}

export function withHistory<P, A extends { type: string; meta?: HistoryMeta }>(
  reducer: (present: P | null, action: A) => P | null,
  options: HistoryOptions<A> = {},
): (h: HistoryState<P>, action: A | HistoryControl<P>) => HistoryState<P> {
  const limit = options.limit ?? HISTORY_LIMIT;
  const coalesceMs = options.coalesceMs ?? COALESCE_MS;
  const now = options.now ?? Date.now;

  return (h, action) => {
    if (isControl<P>(action)) {
      switch (action.type) {
        case "UNDO":
          return undo(h);
        case "REDO":
          return redo(h);
        case "MARK_SAVED":
          return markSaved(h, action.payload?.project);
        case "LOAD_PROJECT":
          return createHistory(action.payload.project, action.payload.dirty ?? false);
      }
    }
    const a = action as A;
    const next = reducer(h.present, a);
    if (next === h.present) return h;
    const meta: HistoryMeta = { label: a.type, ...options.metaFor?.(a), ...a.meta };
    return push(h, next, meta, now(), { limit, coalesceMs });
  };
}
