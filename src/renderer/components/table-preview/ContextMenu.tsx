// src/renderer/components/table-preview/ContextMenu.tsx
//
// Menu of a Tabela cell, with the Recortes wording: "Sem neuma nesta página"
// is the same toggle as in the syllable strip.

import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSurface, type MenuCloseReason } from '../../ui/Menu';

export interface ContextMenuProps {
  /** Pixel position of the menu (pointer, or the cell when opened by keyboard). */
  x: number;
  y: number;
  /** True if the cell currently shows a crop (enables "Remover recorte"). */
  hasCrop: boolean;
  /** True if the cell currently has no neume (checks "Sem neuma nesta página"). */
  isGap: boolean;
  onEditInEditor: () => void;
  onRemoveCrop: () => void;
  onToggleGap: () => void;
  onClose: (reason: MenuCloseReason) => void;
}

export function ContextMenu({ x, y, hasCrop, isGap, onEditInEditor, onRemoveCrop, onToggleGap, onClose }: ContextMenuProps) {
  const { t } = useTranslation();
  return (
    <MenuSurface
      aria-label={t('tablePreview.menu.label')}
      className="fixed z-[130]"
      style={{ left: x, top: y }}
      onClose={onClose}
    >
      <MenuItem label={t('tablePreview.menu.editInRecortes')} onSelect={onEditInEditor} />
      <MenuItem label={t('tablePreview.menu.removeCrop')} disabled={!hasCrop} onSelect={onRemoveCrop} />
      <MenuItem label={t('tablePreview.menu.noNeume')} checked={isGap} onSelect={onToggleGap} />
    </MenuSurface>
  );
}
