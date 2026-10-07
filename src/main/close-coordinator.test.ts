import { describe, expect, it, vi } from "vitest";
import { CloseFlow, SaveThenClose, closeChoiceFromResponse, createQuitGuard, type TimerApi } from "./close-coordinator";

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
    c.onSaveStarted(1);
    c.onSaveFinished(1, true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(c.isArmed).toBe(false);
  });

  it("keeps the window open when the save is cancelled or fails", () => {
    const close = vi.fn();
    const c = new SaveThenClose(close, 5000, manualTimers().api);
    c.arm();
    c.onSaveStarted(1);
    c.onSaveFinished(1, false);
    expect(close).not.toHaveBeenCalled();
    expect(c.isArmed).toBe(false);
  });

  it("ignores saves that were not requested by the close dialog (autosave)", () => {
    const close = vi.fn();
    const c = new SaveThenClose(close, 5000, manualTimers().api);
    c.onSaveStarted(1);
    c.onSaveFinished(1, true);
    expect(close).not.toHaveBeenCalled();
  });

  it("disarms if no save starts before the timeout", () => {
    const close = vi.fn();
    const timers = manualTimers();
    const c = new SaveThenClose(close, 5000, timers.api);
    c.arm();
    timers.fireAll();
    expect(c.isArmed).toBe(false);
    c.onSaveStarted(1);
    c.onSaveFinished(1, true);
    expect(close).not.toHaveBeenCalled();
  });

  it("does not time out once the save has started (a Save As dialog may stay open)", () => {
    const close = vi.fn();
    const timers = manualTimers();
    const c = new SaveThenClose(close, 5000, timers.api);
    c.arm();
    c.onSaveStarted(1);
    expect(timers.pending.size).toBe(0);
    c.onSaveFinished(1, true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("close-while-autosaving: an autosave that started before the prompt does not close the window", () => {
    const close = vi.fn();
    const c = new SaveThenClose(close, 5000, manualTimers().api);
    c.onSaveStarted(7); // autosave in flight
    c.arm(); // user picks "Save" in the close prompt
    c.onSaveFinished(7, true); // autosave lands: not the save the prompt asked for
    expect(close).not.toHaveBeenCalled();
    expect(c.isArmed).toBe(true);
    c.onSaveStarted(8); // the save requested by the prompt
    c.onSaveFinished(8, true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("waits for the save it claimed, not for any save that finishes first", () => {
    const close = vi.fn();
    const c = new SaveThenClose(close, 5000, manualTimers().api);
    c.arm();
    c.onSaveStarted(3);
    c.onSaveStarted(4); // a second save (e.g. autosave) starts meanwhile
    c.onSaveFinished(4, true);
    expect(close).not.toHaveBeenCalled();
    c.onSaveFinished(3, true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reports an abort (failure, cancel, timeout) so a pending quit can be cancelled", () => {
    const abort = vi.fn();
    const timers = manualTimers();
    const c = new SaveThenClose(vi.fn(), 5000, timers.api, abort);
    c.arm();
    c.onSaveStarted(1);
    c.onSaveFinished(1, false);
    expect(abort).toHaveBeenCalledTimes(1);
    c.arm();
    timers.fireAll();
    expect(abort).toHaveBeenCalledTimes(2);
  });
});

describe("createQuitGuard", () => {
  function setup(busy: boolean) {
    let release!: () => void;
    const state = { busy };
    const dispose = vi.fn();
    const quit = vi.fn();
    const guard = createQuitGuard({
      isBusy: () => state.busy,
      idle: () =>
        new Promise<void>((r) => {
          release = () => {
            state.busy = false;
            r();
          };
        }),
      dispose,
      quit,
    });
    return { guard, dispose, quit, release: () => release(), state };
  }
  const event = () => ({ preventDefault: vi.fn() });

  it("disposes the session right away when no save is in flight", () => {
    const { guard, dispose, quit } = setup(false);
    const e = event();
    guard(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();
  });

  it("holds the quit until in-flight saves finish, then quits again and disposes", async () => {
    const { guard, dispose, quit, release } = setup(true);
    const e = event();
    guard(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    guard(event()); // a second will-quit while waiting does not start another wait
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(quit).toHaveBeenCalledTimes(1);
    guard(event()); // the re-emitted will-quit
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});


describe("CloseFlow (N2: macOS close/quit bookkeeping)", () => {
  it("lets exactly one close through after Discard/Save, then prompts again", () => {
    const f = new CloseFlow();
    expect(f.shouldPrompt(true)).toBe(true);
    f.allowNextClose();
    expect(f.shouldPrompt(true)).toBe(false);
    f.onClosed(); // window really closed (macOS keeps the app alive)
    expect(f.shouldPrompt(true)).toBe(true);
  });

  it("resets the bypass when the close is cancelled or the save fails", () => {
    const f = new CloseFlow();
    f.allowNextClose();
    f.onCloseAborted();
    expect(f.shouldPrompt(true)).toBe(true);
  });

  it("never prompts for a clean project", () => {
    expect(new CloseFlow().shouldPrompt(false)).toBe(false);
  });

  it("Cmd+Q -> prompt -> Save: quits once the window has closed after saving", () => {
    const f = new CloseFlow();
    f.onBeforeQuit();
    expect(f.shouldPrompt(true)).toBe(true); // the quit is held by the prompt
    f.allowNextClose(); // save succeeded
    expect(f.shouldPrompt(true)).toBe(false);
    expect(f.onClosed()).toBe("quit");
  });

  it("Cmd+Q -> prompt -> Cancel: a later window close does not quit", () => {
    const f = new CloseFlow();
    f.onBeforeQuit();
    expect(f.shouldPrompt(true)).toBe(true);
    f.onCloseAborted();
    f.allowNextClose();
    expect(f.onClosed()).toBe("stay");
  });

  it("a plain window close (no quit requested) keeps the app running", () => {
    const f = new CloseFlow();
    expect(f.shouldPrompt(true)).toBe(true);
    f.allowNextClose();
    expect(f.onClosed()).toBe("stay");
  });
});
