import { describe, expect, it, vi } from "vitest";
import { SaveThenClose, closeChoiceFromResponse, type TimerApi } from "./close-coordinator";

function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  const api: TimerApi = {
    set: (fn) => {
      const id = next++;
      pending.set(id, fn);
      return id;
    },
    clear: (h) => void pending.delete(h as number),
  };
  const fireAll = () => {
    for (const [id, fn] of [...pending]) {
      pending.delete(id);
      fn();
    }
  };
  return { api, fireAll, pending };
}

describe("closeChoiceFromResponse", () => {
  it("maps button indexes; anything else (Esc, window close) is cancel", () => {
    expect(closeChoiceFromResponse(0)).toBe("save");
    expect(closeChoiceFromResponse(1)).toBe("discard");
    expect(closeChoiceFromResponse(2)).toBe("cancel");
    expect(closeChoiceFromResponse(-1)).toBe("cancel");
  });
});

describe("SaveThenClose", () => {
  it("closes after an armed save succeeds", () => {
    const close = vi.fn();
    const { api } = manualTimers();
    const c = new SaveThenClose(close, 5000, api);
    c.arm();
    expect(c.isArmed).toBe(true);
    c.onSaveStarted();
    c.onSaveFinished(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(c.isArmed).toBe(false);
  });

  it("keeps the window open when the save is cancelled or fails", () => {
    const close = vi.fn();
    const c = new SaveThenClose(close, 5000, manualTimers().api);
    c.arm();
    c.onSaveStarted();
    c.onSaveFinished(false);
    expect(close).not.toHaveBeenCalled();
    expect(c.isArmed).toBe(false);
  });

  it("ignores saves that were not requested by the close dialog (autosave)", () => {
    const close = vi.fn();
    const c = new SaveThenClose(close, 5000, manualTimers().api);
    c.onSaveStarted();
    c.onSaveFinished(true);
    expect(close).not.toHaveBeenCalled();
  });

  it("disarms if no save starts before the timeout", () => {
    const close = vi.fn();
    const timers = manualTimers();
    const c = new SaveThenClose(close, 5000, timers.api);
    c.arm();
    timers.fireAll();
    expect(c.isArmed).toBe(false);
    c.onSaveStarted();
    c.onSaveFinished(true);
    expect(close).not.toHaveBeenCalled();
  });

  it("does not time out once the save has started (a Save As dialog may stay open)", () => {
    const close = vi.fn();
    const timers = manualTimers();
    const c = new SaveThenClose(close, 5000, timers.api);
    c.arm();
    c.onSaveStarted();
    expect(timers.pending.size).toBe(0);
    c.onSaveFinished(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
