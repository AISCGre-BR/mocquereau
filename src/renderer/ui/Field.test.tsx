// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Input, Select, Textarea } from "./Field";
import { Panel } from "./Panel";

afterEach(cleanup);

describe("Field", () => {
  it("Input associa o rótulo ao campo", () => {
    render(<Input label="Título" defaultValue="Puer natus est" />);
    const input = screen.getByLabelText("Título") as HTMLInputElement;
    expect(input.value).toBe("Puer natus est");
    expect(input.className).toBe("sc-input");
  });

  it("erro marca o campo e mostra a frase", () => {
    const { container } = render(<Input label="Sigla" error="Informe a sigla." />);
    expect(container.querySelector(".sc-field--error")).not.toBeNull();
    expect(screen.getByLabelText(/Sigla/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Informe a sigla.").tagName).toBe("SMALL");
  });

  it("Textarea litúrgico usa a serifa; o comum usa a sans", () => {
    render(
      <>
        <Textarea label="Texto litúrgico" liturgical />
        <Textarea label="Notas" />
      </>,
    );
    expect(screen.getByLabelText("Texto litúrgico").className).toBe("sc-textarea");
    expect(screen.getByLabelText("Notas").className).toBe("sc-textarea font-sans text-body");
  });

  it("Select nativo com opções", () => {
    render(
      <Select label="Notação" defaultValue="b">
        <option value="a">Adiastemática</option>
        <option value="b">Diastemática</option>
      </Select>,
    );
    expect((screen.getByLabelText("Notação") as HTMLSelectElement).value).toBe("b");
  });
});

describe("Panel", () => {
  it("mostra título e ação no cabeçalho", () => {
    render(
      <Panel title="Recentes" action={<button type="button">Limpar</button>}>
        <p>conteúdo</p>
      </Panel>,
    );
    expect(screen.getByRole("heading", { name: "Recentes" }).className).toBe("sc-panel__title");
    expect(screen.getByRole("button", { name: "Limpar" })).toBeTruthy();
    expect(screen.getByText("conteúdo").closest(".sc-panel")).not.toBeNull();
  });
});
