// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NewProjectGuide } from "./NewProjectGuide";
import { syllabifyText } from "../lib/syllabify";
import ptBR from "../i18n/locales/pt-BR.json";

afterEach(cleanup);

function toStep3() {
  fireEvent.change(screen.getByPlaceholderText("Título da peça"), { target: { value: "Gloria VIII" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.change(screen.getByPlaceholderText("Cole ou digite o texto litúrgico"), {
    target: { value: "Grátias ágimus tibi propter magnam" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("NewProjectGuide", () => {
  it("walks the four steps and creates with the chosen mode and edits", async () => {
    const onCreate = vi.fn();
    render(<NewProjectGuide onCancel={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText("Título da peça"), { target: { value: "Gloria VIII" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const ta = screen.getByPlaceholderText("Cole ou digite o texto litúrgico");
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(ta, { target: { value: "Grátias ágimus tibi propter magnam" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect((screen.getByRole("radio", { name: /Cantado/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Recomendado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByTestId("word-3")); // propter is ambiguous
    fireEvent.click(await screen.findByRole("menuitem", { name: /prop·ter/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "Gloria VIII", mode: "sung" }));
    expect(onCreate.mock.calls[0][0].words[3].syllables).toEqual(["prop", "ter"]);
  });

  it("Alterar reopens a completed step", () => {
    render(<NewProjectGuide onCancel={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Título da peça"), { target: { value: "Gloria VIII" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByPlaceholderText("Título da peça")).toBeNull();
    expect(screen.getByText("Gloria VIII")).toBeTruthy();
    const piece = screen.getByText("Peça").closest("li")!;
    fireEvent.click(within(piece).getByRole("button", { name: "Alterar" }));
    expect((screen.getByPlaceholderText("Título da peça") as HTMLInputElement).value).toBe("Gloria VIII");
  });

  it("Enter in the title advances and an empty title becomes untitled", () => {
    const onCreate = vi.fn();
    render(<NewProjectGuide onCancel={vi.fn()} onCreate={onCreate} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Título da peça"), { key: "Enter" });
    expect(screen.getByPlaceholderText("Cole ou digite o texto litúrgico")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Cole ou digite o texto litúrgico"), { target: { value: "Deo" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    expect(onCreate.mock.calls[0][0].title).toBe("Sem título");
  });

  it("Manual mode uses the typed hyphens and shows no sample", () => {
    const onCreate = vi.fn();
    render(<NewProjectGuide onCancel={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(screen.getByPlaceholderText("Cole ou digite o texto litúrgico"), {
      target: { value: "Glo-ri-a in" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const manual = screen.getByRole("radio", { name: /Manual/ });
    fireEvent.click(manual);
    expect((manual as HTMLInputElement).checked).toBe(true);
    expect(manual.closest("label")!.querySelector("[data-sample]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    const draft = onCreate.mock.calls[0][0];
    expect(draft.mode).toBe("manual");
    expect(draft.words[0].syllables).toEqual(["Glo", "ri", "a"]);
  });

  it("changing the mode recomputes the words and drops the review edits", async () => {
    const onCreate = vi.fn();
    render(<NewProjectGuide onCancel={vi.fn()} onCreate={onCreate} />);
    toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByTestId("word-3"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /prop·ter/ }));
    const division = screen.getByText("Divisão silábica").closest("li")!;
    fireEvent.click(within(division).getByRole("button", { name: "Alterar" }));
    fireEvent.click(screen.getByRole("radio", { name: /Clássico/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    // sem ambiguidades fora dos modos cantado/tipográfico
    expect(screen.getByTestId("word-3").getAttribute("role")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    const draft = onCreate.mock.calls[0][0];
    expect(draft.mode).toBe("classical");
    expect(draft.words).toEqual(syllabifyText("Grátias ágimus tibi propter magnam", "classical"));
  });

  it("changing only the title keeps the review edits", async () => {
    const onCreate = vi.fn();
    render(<NewProjectGuide onCancel={vi.fn()} onCreate={onCreate} />);
    toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByTestId("word-3"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /prop·ter/ }));
    const piece = screen.getByText("Peça").closest("li")!;
    fireEvent.click(within(piece).getByRole("button", { name: "Alterar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    expect(onCreate.mock.calls[0][0].words[3].syllables).toEqual(["prop", "ter"]);
  });

  it("Cancelar and Esc call onCancel", () => {
    const onCancel = vi.fn();
    render(<NewProjectGuide onCancel={onCancel} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("Esc typed in a field or while composing does not cancel", () => {
    const onCancel = vi.fn();
    render(<NewProjectGuide onCancel={onCancel} onCreate={vi.fn()} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Título da peça"), { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape", isComposing: true });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Esc with a draft asks before cancelling", () => {
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NewProjectGuide onCancel={onCancel} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Título da peça"), { target: { value: "Gloria VIII" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(confirm).toHaveBeenCalledWith(ptBR["newProject.confirmCancel"]);
    expect(onCancel).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("Esc that closes the alternatives menu does not cancel", async () => {
    const onCancel = vi.fn();
    render(<NewProjectGuide onCancel={onCancel} onCreate={vi.fn()} />);
    toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByTestId("word-3"));
    const item = await screen.findByRole("menuitem", { name: /prop·ter/ });
    fireEvent.keyDown(item, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
