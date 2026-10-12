import { describe, expect, it } from "vitest";
import { registerAnnotationPanelPrefHandlers } from "./annotation-pref";

function setup(initial?: boolean) {
  const data: { annotationPanelOpen?: boolean } = initial === undefined ? {} : { annotationPanelOpen: initial };
  const store = {
    get: (key: "annotationPanelOpen") => data[key],
    set: (key: "annotationPanelOpen", value: boolean) => {
      data[key] = value;
    },
  };
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  registerAnnotationPanelPrefHandlers({ handle: (channel, fn) => void handlers.set(channel, fn) }, store);
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
  return { data, call };
}

describe("annotation panel preference (IPC)", () => {
  it("defaults to closed", async () => {
    const { call } = setup();
    expect(await call("settings:get-annotation-panel")).toBe(false);
  });

  it("stores and reads the choice", async () => {
    const { call, data } = setup();
    await call("settings:set-annotation-panel", true);
    expect(data.annotationPanelOpen).toBe(true);
    expect(await call("settings:get-annotation-panel")).toBe(true);
    await call("settings:set-annotation-panel", false);
    expect(await call("settings:get-annotation-panel")).toBe(false);
  });

  it("ignores values that are not booleans", async () => {
    const { call, data } = setup(true);
    await call("settings:set-annotation-panel", "no");
    expect(data.annotationPanelOpen).toBe(true);
  });
});
