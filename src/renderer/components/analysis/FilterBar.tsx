// src/renderer/components/analysis/FilterBar.tsx
//
// Filters of the Análise view, in the toolbar: five menu buttons with checkable items.
// The button shows the filter name and, when active, its first chosen value (no counter).
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { AnalysisFilters } from "@shared/analysis";
import { FAMILY_LEVEL_ID, NO_SECTION } from "@shared/analysis/cells";
import { useProject } from "../../hooks/useProject";
import { Button } from "../../ui/Button";
import { MenuItem, MenuSurface, type MenuCloseReason } from "../../ui/Menu";
import { useAnalysisFilters, useEffectiveAnalysisFilters } from "./AnalysisContext";

type FilterKey = "sourceIds" | "classValueIds" | "sectionIds" | "tagIds" | "certainty";
interface Option { value: string; label: string }

function FilterMenu({
  name,
  options,
  selected,
  onToggle,
}: {
  name: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const first = options.find((o) => selected.includes(o.value));
  const more = options.filter((o) => selected.includes(o.value)).length > 1;
  const label = first ? `${name}: ${first.label}${more ? "…" : ""}` : name;
  // Toggling keeps the menu open (several values at once); Esc, Tab or a click outside close it.
  const close = (reason: MenuCloseReason) => {
    if (reason !== "select") setOpen(false);
  };
  return (
    <div ref={wrapRef} className="relative">
      <Button
        size="sm"
        variant={first ? "tonal" : "elevated"}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
      </Button>
      {open && (
        <MenuSurface aria-label={name} anchor={wrapRef.current} className="absolute left-0 top-full z-30 mt-1" onClose={close}>
          {options.map((o) => (
            <MenuItem key={o.value} label={o.label} checked={selected.includes(o.value)} onSelect={() => onToggle(o.value)} />
          ))}
        </MenuSurface>
      )}
    </div>
  );
}

export function FilterBar() {
  const { t } = useTranslation();
  const { state } = useProject();
  const [, setFilters] = useAnalysisFilters();
  const project = state.project;
  const filters = useEffectiveAnalysisFilters(project);
  if (!project) return null;

  const familyLevel = project.classification.find((l) => l.id === FAMILY_LEVEL_ID);
  const menus: Array<{ key: FilterKey; name: string; options: Option[] }> = [
    {
      key: "sourceIds",
      name: t("analysis.filter.sources"),
      options: [...project.sources].sort((a, b) => a.order - b.order).map((s) => ({ value: s.id, label: s.metadata.siglum || s.id })),
    },
    {
      key: "classValueIds",
      name: t("analysis.filter.family"),
      options: (familyLevel?.values ?? []).map((v) => ({ value: v.id, label: v.name })),
    },
    {
      key: "sectionIds",
      name: t("analysis.filter.section"),
      options:
        project.sections.length === 0
          ? []
          : [...project.sections.map((s) => ({ value: s.id, label: s.name })), { value: NO_SECTION, label: t("indicators.noSection") }],
    },
    {
      key: "tagIds",
      name: t("analysis.filter.tags"),
      options: (project.tags ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
    },
    {
      key: "certainty",
      name: t("analysis.filter.certainty"),
      options: [
        { value: "secure", label: t("annotation.certainty.secure") },
        { value: "probable", label: t("annotation.certainty.probable") },
        { value: "illegible", label: t("annotation.certainty.illegible") },
        { value: "unset", label: t("analysis.filter.unset") },
      ],
    },
  ];

  function toggle(key: FilterKey, value: string) {
    const current = (filters[key] ?? []) as string[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const out: AnalysisFilters = { ...filters };
    if (next.length === 0) delete out[key];
    else (out as Record<FilterKey, string[]>)[key] = next;
    setFilters(out);
  }

  return (
    <div role="group" aria-label={t("analysis.filters")} className="flex items-center gap-1.5">
      {menus.map((m) => (
        <FilterMenu
          key={m.key}
          name={m.name}
          options={m.options}
          selected={(filters[m.key] ?? []) as string[]}
          onToggle={(v) => toggle(m.key, v)}
        />
      ))}
    </div>
  );
}
