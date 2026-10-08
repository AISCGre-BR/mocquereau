import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../ui/SegmentedControl";
import { formatAccelerator } from "./accelerator";

export type ViewId = "texto" | "recortes" | "tabela";
export const VIEW_ORDER: readonly ViewId[] = ["texto", "recortes", "tabela"];

export interface ToolbarProps {
  view: ViewId;
  onViewChange: (view: ViewId) => void;
  /** Ferramentas da vista: grupos segmentados só de ícones (onda B). */
  tools?: ReactNode;
  /** Ação principal da vista: o único botão preenchido, na ponta direita. */
  primaryAction?: ReactNode;
  platform?: string;
}

export function Toolbar({ view, onViewChange, tools, primaryAction, platform = "" }: ToolbarProps) {
  const { t } = useTranslation();
  const options = VIEW_ORDER.map((id, i) => ({
    value: id,
    label: t(`shell.view.${id}`),
    shortcut: formatAccelerator(`Ctrl+${i + 1}`, platform),
  }));
  return (
    <div className="sc-toolbar shrink-0" role="toolbar" aria-label={t("shell.toolbar")}>
      <SegmentedControl aria-label={t("shell.views")} options={options} value={view} onChange={onViewChange} />
      {tools && (
        <>
          <span className="sc-toolbar__sep" aria-hidden="true" />
          {tools}
        </>
      )}
      <span className="sc-toolbar__spacer" />
      {primaryAction}
    </div>
  );
}
