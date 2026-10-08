// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SyllableBoxOverlay, cropBoxClass } from "./SyllableBoxOverlay";

afterEach(cleanup);

function setup(syllableIdx = 7) {
  const container = document.createElement("div");
  Object.defineProperty(container, "offsetWidth", { value: 1000 });
  Object.defineProperty(container, "offsetHeight", { value: 500 });
  const onBoxCommit = vi.fn();
  const utils = render(
    <SyllableBoxOverlay
      box={{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }}
      syllableIdx={syllableIdx}
      label="na"
      containerRef={{ current: container }}
      onBoxChange={vi.fn()}
      onBoxCommit={onBoxCommit}
    />,
  );
  const box = utils.container.querySelector("[data-box-overlay]") as HTMLElement;
  return { box, onBoxCommit };
}

describe("SyllableBoxOverlay", () => {
  it("caixa ativa: sc-box em rubrica com o pigmento da sílaba, etiqueta e 8 alças", () => {
    const { box } = setup(7);
    expect(box.className).toContain("sc-box");
    expect(box.className).toContain("sc-box--active");
    expect(box.className).toContain("sc-pig-orpiment");
    expect(box.querySelector(".sc-box__tag")?.textContent).toBe("na");
    const handles = Array.from(box.querySelectorAll(".sc-box__h")).map((h) => h.getAttribute("data-handle"));
    expect(handles.sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
    for (const id of handles) expect(box.querySelector(`.sc-box__h--${id}`)).not.toBeNull();
  });

  it("setas e Delete não são tratados pela caixa (atalhos da vista Recortes, um só caminho)", () => {
    const { box, onBoxCommit } = setup();
    fireEvent.keyDown(box, { key: "ArrowRight" });
    fireEvent.keyDown(box, { key: "Delete" });
    expect(onBoxCommit).not.toHaveBeenCalled();
  });

  it("cropBoxClass cobre confirmada, ativa e sugerida", () => {
    expect(cropBoxClass("confirmed", 0)).toBe("sc-box sc-pig-lapis");
    expect(cropBoxClass("active", 1)).toBe("sc-box sc-pig-orpiment sc-box--active");
    expect(cropBoxClass("suggested", 3)).toBe("sc-box sc-pig-minium sc-box--suggested");
  });
});
