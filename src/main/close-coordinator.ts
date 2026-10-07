// src/main/close-coordinator.ts
//
// "Save" in the close dialog (wave A2). The renderer saves; the main process
// only learns the outcome through the project:save handler hooks. Wave B
// replaces this with lifecycle:close-requested handled by the renderer.
export type CloseChoice = "save" | "discard" | "cancel";

export function closeChoiceFromResponse(response: number): CloseChoice {
  if (response === 0) return "save";
  if (response === 1) return "discard";
  return "cancel";
}

export interface TimerApi {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * "Save" in the close prompt: close the window once the save requested by the
 * prompt succeeds. Every save carries a token (SaveQueue.nextToken); the first
 * save that STARTS after arm() is the one the prompt requested, and only its
 * outcome counts. A save already in flight when the prompt was answered (an
 * autosave) is ignored, and so is any other save finishing in between.
 */
export class SaveThenClose {
  private armed = false;
  private claimed: number | null = null;
  private timer: unknown = null;

  constructor(
    private readonly closeWindow: () => void,
    private readonly startTimeoutMs: number = 5000,
    private readonly timers: TimerApi = realTimers,
    /** Called when an armed close gives up (save failed, cancelled, never started). */
    private readonly onAbort: () => void = () => {},
  ) {}

  get isArmed(): boolean {
    return this.armed;
  }

  arm(): void {
    this.armed = true;
    this.claimed = null;
    this.clearTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (this.armed && this.claimed === null) {
        this.disarm();
        this.onAbort();
      }
    }, this.startTimeoutMs);
  }

  onSaveStarted(token: number): void {
    if (!this.armed || this.claimed !== null) return;
    this.claimed = token;
    this.clearTimer();
  }

  onSaveFinished(token: number, ok: boolean): void {
    if (!this.armed || this.claimed === null || token !== this.claimed) return;
    this.disarm();
    if (ok) this.closeWindow();
    else this.onAbort();
  }

  private disarm(): void {
    this.armed = false;
    this.claimed = null;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }
}

/**
 * will-quit handler (B3): never delete the working session while a save is
 * still reading its images. If saves are in flight, hold the quit, wait for
 * them, then quit again (which re-emits will-quit, now idle).
 */
export function createQuitGuard(deps: {
  isBusy: () => boolean;
  idle: () => Promise<void>;
  dispose: () => void;
  quit: () => void;
}): (event: { preventDefault(): void }) => void {
  let waiting = false;
  return (event) => {
    if (waiting) {
      event.preventDefault();
      return;
    }
    if (deps.isBusy()) {
      event.preventDefault();
      waiting = true;
      void deps
        .idle()
        .catch(() => undefined)
        .then(() => {
          waiting = false;
          deps.quit();
        });
      return;
    }
    deps.dispose();
  };
}
