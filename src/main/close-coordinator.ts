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

export class SaveThenClose {
  private armed = false;
  private started = false;
  private timer: unknown = null;

  constructor(
    private readonly closeWindow: () => void,
    private readonly startTimeoutMs: number = 5000,
    private readonly timers: TimerApi = realTimers,
  ) {}

  get isArmed(): boolean {
    return this.armed;
  }

  arm(): void {
    this.armed = true;
    this.started = false;
    this.clearTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (this.armed && !this.started) this.disarm();
    }, this.startTimeoutMs);
  }

  onSaveStarted(): void {
    if (!this.armed) return;
    this.started = true;
    this.clearTimer();
  }

  onSaveFinished(ok: boolean): void {
    if (!this.armed || !this.started) return;
    this.disarm();
    if (ok) this.closeWindow();
  }

  private disarm(): void {
    this.armed = false;
    this.started = false;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }
}
