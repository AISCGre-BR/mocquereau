import { describe, it, expect } from "vitest";
import { migrateSource } from "./migrate-colors.mjs";

const cases = [
  ["bg-gray-50", "bg-parchment"],
  ["bg-gray-100", "bg-parchment-deep"],
  ["bg-gray-200", "bg-rule-soft"],
  ["bg-white", "bg-surface"],
  ["hover:bg-gray-50", "hover:bg-ink-wash"],
  ["hover:bg-gray-50/30", "hover:bg-ink-wash"],
  ["text-gray-900", "text-ink"],
  ["text-gray-700", "text-ink-soft"],
  ["text-gray-400", "text-ink-muted"],
  ["border-gray-200", "border-rule-soft"],
  ["border-gray-300", "border-rule"],
  ["border-gray-400", "border-rule-strong"],
  ["hover:border-gray-300", "hover:border-rule"],
  ["divide-gray-100", "divide-rule-soft"],
  ["bg-blue-600", "bg-rubric"],
  ["hover:bg-blue-700", "hover:bg-rubric-soft"],
  ["active:bg-blue-800", "active:bg-rubric-deep"],
  ["bg-blue-50", "bg-rubric-wash"],
  ["text-blue-600", "text-rubric"],
  ["text-white", "text-on-rubric"],
  ["focus:ring-blue-500", "focus:ring-focus"],
  ["focus:border-blue-500", "focus:border-rubric"],
  ["accent-blue-600", "accent-rubric"],
  ["outline-blue-500", "outline-rubric"],
  ["bg-red-50", "bg-rubric-wash"],
  ["text-red-600", "text-danger"],
  ["border-red-300", "border-danger"],
  ["text-amber-600", "text-warning"],
  ["bg-amber-100", "bg-orpiment-wash"],
  ["bg-orange-50", "bg-orpiment-wash"],
  ["text-green-600", "text-success"],
  ["bg-green-100", "bg-verdigris-wash"],
  ["bg-green-400", "bg-success"],
  ["bg-indigo-100", "bg-lapis-wash"],
  ["ring-indigo-400", "ring-lapis"],
  ["text-purple-800", "text-murex"],
  ["bg-black/50", "bg-ink/20"],
];

describe("migrate-colors", () => {
  it.each(cases)("%s -> %s", (from, to) => {
    expect(migrateSource(`className="${from}"`)).toBe(`className="${to}"`);
  });

  it("preserva utilitários sem cor", () => {
    const s = 'className="border-l-2 ring-offset-1 text-[10px] text-sm bg-transparent"';
    expect(migrateSource(s)).toBe(s);
  });

  it("troca vários tokens na mesma string", () => {
    expect(migrateSource('"px-4 bg-blue-600 text-white hover:bg-blue-700"')).toBe(
      '"px-4 bg-rubric text-on-rubric hover:bg-rubric-soft"',
    );
  });
});
