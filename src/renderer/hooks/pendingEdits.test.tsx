// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createPendingEdits, usePendingFlush, type PendingEdits } from "./pendingEdits";
import { ProjectContext, initialStateForTest } from "./useProject";

afterEach(cleanup);

function View({ flush }: { flush: () => boolean }) {
  usePendingFlush(flush);
  return null;
}

function mount(pending: PendingEdits, flush: () => boolean) {
  return render(
    <ProjectContext.Provider value={{ state: initialStateForTest, dispatch: vi.fn(), pending }}>
      <View flush={flush} />
    </ProjectContext.Provider>,
  );
}

describe("pendingEdits", () => {
  it("flushAll chama as vistas registradas e diz se alguma gravou algo", () => {
    const pending = createPendingEdits();
    const a = vi.fn(() => false);
    const b = vi.fn(() => true);
    pending.register(a);
    const unregister = pending.register(b);
    expect(pending.flushAll()).toBe(true);
    unregister();
    expect(pending.flushAll()).toBe(false);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("desmontar executa o flush na mesma época", () => {
    const flush = vi.fn(() => true);
    const { unmount } = mount(createPendingEdits(), flush);
    unmount();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("desmontar depois de trocar o documento (bump) não executa o flush", () => {
    const pending = createPendingEdits();
    const flush = vi.fn(() => true);
    const { unmount } = mount(pending, flush);
    pending.bump();
    unmount();
    expect(flush).not.toHaveBeenCalled();
    expect(pending.flushAll()).toBe(false); // e saiu do registro
  });

  it("markPending avisa o main (setDirty(true)) uma vez por ciclo; settle reabre o ciclo", () => {
    const setDirty = vi.fn().mockResolvedValue(undefined);
    window.mocquereau = { setDirty } as unknown as typeof window.mocquereau;
    const pending = createPendingEdits();
    pending.markPending();
    pending.markPending();
    expect(setDirty).toHaveBeenCalledOnce();
    expect(setDirty).toHaveBeenCalledWith(true);
    pending.settle();
    pending.markPending();
    expect(setDirty).toHaveBeenCalledTimes(2);
  });
});

