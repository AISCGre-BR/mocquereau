// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { ProjectContext, createNewProject, useProjectReducer, type HistoryApi, type ProjectState } from "../../hooks/useProject";
import type { ManuscriptLine, MocquereauProject } from "../../lib/models";
import { blobs, boxesIn, page } from "../../lib/box-frame-detect.fixtures";
import { RealignBoxesDialog } from "./RealignBoxesDialog";

afterEach(cleanup);

const W = 600;
const H = 400;
const BLOBS = blobs(W, H);
const RASTER = page(W, H, BLOBS);
const R0 = { rotation: 0, flipH: false, flipV: false };
const R5 = { rotation: 5, flipH: false, flipV: false };
const ADJ5 = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, rotation: 5, flipH: false, flipV: false };

function project(): MocquereauProject {
  const p = createNewProject("Gloria", "");
  const line: ManuscriptLine = {
    id: "L",
    image: { dataUrl: "data:,", width: W, height: H, mimeType: "image/png" },
    syllableRange: { start: 0, end: 0 },
    dividers: [],
    gaps: [],
    confirmed: true,
    imageAdjustments: ADJ5,
    boxFrame: R5,
    syllableBoxes: boxesIn(R0, RASTER, BLOBS),
  };
  p.sources = [
    {
      id: "S",
      order: 1,
      metadata: { siglum: "X", library: "", city: "", century: "", classes: [null, null, null] },
      lines: [line],
      syllableCuts: {},
    },
  ];
  return p;
}

const probe: { state?: ProjectState; history?: HistoryApi; loaded?: MocquereauProject | null } = {};

function Harness({ onClosed }: { onClosed?: () => void }) {
  const [state, dispatch, history] = useProjectReducer();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    dispatch({ type: "SET_PROJECT", payload: project() });
    setOpen(true);
  }, [dispatch]);
  probe.state = state;
  probe.history = history;
  if (open && probe.loaded === undefined) probe.loaded = state.project;
  const line = state.project?.sources[0]?.lines[0] ?? null;
  return (
    <ProjectContext.Provider value={{ state, dispatch, history }}>
      <RealignBoxesDialog
        open={open && !!line}
        line={line}
        loadRaster={async () => RASTER}
        onClose={() => {
          setOpen(false);
          onClosed?.();
        }}
      />
    </ProjectContext.Provider>
  );
}

const lineOf = () => probe.state!.project!.sources[0].lines[0];

async function openDialog() {
  probe.loaded = undefined;
  render(<Harness />);
  await waitFor(() => expect(screen.getAllByRole("radio").length).toBeGreaterThan(1));
}

describe("RealignBoxesDialog", () => {
  it("lists candidates by score with 0 degrees first and marks best/current", async () => {
    await openDialog();
    const radios = screen.getAllByRole("radio");
    const firstRow = radios[0].closest("label")!;
    expect(firstRow.textContent).toContain("0°");
    expect(firstRow.textContent).toContain("melhor");
    expect(screen.getByText("atual").closest("label")!.textContent).toContain("5°");
    // Stored frame starts selected.
    expect((screen.getByText("atual").closest("label")!.querySelector("input") as HTMLInputElement).checked).toBe(true);
  });

  it("selecting previews without history; Cancel restores the exact project", async () => {
    await openDialog();
    const loaded = probe.state!.project;
    act(() => fireEvent.click(screen.getAllByRole("radio")[0]));
    expect(lineOf().boxFrame).toEqual(R0);
    expect(probe.history!.canUndo).toBe(false);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })));
    expect(probe.state!.project).toBe(loaded);
    expect(probe.state!.isDirty).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Apply records one undoable step and keeps the adjustments", async () => {
    await openDialog();
    act(() => fireEvent.click(screen.getAllByRole("radio")[0]));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Aplicar" })));
    expect(lineOf().boxFrame).toEqual(R0);
    expect(lineOf().imageAdjustments).toEqual(ADJ5);
    expect(probe.state!.isDirty).toBe(true);
    expect(probe.history!.canUndo).toBe(true);
    act(() => probe.history!.undo());
    expect(lineOf().boxFrame).toEqual(R5);
    expect(probe.state!.isDirty).toBe(false);
  });
});
