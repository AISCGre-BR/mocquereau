import { useState, useEffect } from 'react';

interface SyllableChipProps {
  syllable: string;
  /** True when this chip is in inline-edit mode */
  isEditing: boolean;
  /** Enter edit mode — triggered by double-click */
  onEnterEdit: () => void;
  /** Commit edit with the typed text (may contain hyphens for split) */
  onCommitEdit: (value: string) => void;
  /** Cancel edit without changes */
  onCancelEdit: () => void;
}

export function SyllableChip({
  syllable,
  isEditing,
  onEnterEdit,
  onCommitEdit,
  onCancelEdit,
}: SyllableChipProps) {
  const [inputValue, setInputValue] = useState(syllable);

  // Sync input value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setInputValue(syllable);
    }
  }, [isEditing, syllable]);

  if (isEditing) {
    return (
      <input
        type="text"
        value={inputValue}
        autoFocus
        size={Math.max(inputValue.length + 2, 3)}
        className="px-1 py-0.5 rounded border border-blue-500 text-sm text-gray-900 outline-none ring-1 ring-blue-500"
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            onCommitEdit(inputValue);
          } else if (e.key === 'Escape') {
            onCancelEdit();
          }
        }}
        onBlur={() => onCommitEdit(inputValue)}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full border border-gray-300 bg-white text-sm text-gray-800 cursor-default select-none hover:border-blue-400 hover:bg-blue-50"
      onDoubleClick={onEnterEdit}
    >
      {syllable}
    </span>
  );
}
