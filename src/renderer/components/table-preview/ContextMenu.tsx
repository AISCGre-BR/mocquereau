// src/renderer/components/table-preview/ContextMenu.tsx

import { useEffect, useRef } from 'react';

export interface ContextMenuProps {
  /** Pixel position of the menu (from click event clientX/Y). */
  x: number;
  y: number;
  /** True if the cell currently has a filled state (enables "Remover recorte"). */
  hasCrop: boolean;
  /** True if the cell is currently a gap (changes "Marcar como gap" label). */
  isGap: boolean;
  onEditInEditor: () => void;
  onRemoveCrop: () => void;
  onMarkAsGap: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x, y,
  hasCrop,
  isGap,
  onEditInEditor,
  onRemoveCrop,
  onMarkAsGap,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Keep menu inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  };

  const itemClass =
    'w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div
      ref={menuRef}
      className="bg-white border border-gray-200 rounded shadow-lg py-1 min-w-48 outline-none"
      style={style}
      role="menu"
    >
      <button
        className={itemClass}
        role="menuitem"
        onClick={() => { onEditInEditor(); onClose(); }}
      >
        Editar no editor
      </button>
      <button
        className={itemClass}
        role="menuitem"
        disabled={!hasCrop}
        onClick={() => { onRemoveCrop(); onClose(); }}
      >
        Remover recorte
      </button>
      <button
        className={itemClass}
        role="menuitem"
        onClick={() => { onMarkAsGap(); onClose(); }}
      >
        {isGap ? 'Desmarcar gap' : 'Marcar como gap'}
      </button>
    </div>
  );
}
