// src/renderer/components/slice-editor/ImageMetadataModal.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ImageMetadataModalProps {
  /** When non-null, modal is open and editing this line */
  line: { id: string; folio?: string; label?: string } | null;
  onSave: (lineId: string, folio: string | undefined, label: string | undefined) => void;
  onClose: () => void;
}

export function ImageMetadataModal({ line, onSave, onClose }: ImageMetadataModalProps) {
  const { t } = useTranslation();
  const [folio, setFolio] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (line) {
      setFolio(line.folio ?? '');
      setLabel(line.label ?? '');
    }
  }, [line]);

  if (!line) return null;

  const handleSave = () => {
    const nextFolio = folio.trim() === '' ? undefined : folio.trim();
    const nextLabel = label.trim() === '' ? undefined : label.trim();
    onSave(line.id, nextFolio, nextLabel);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-ink/20 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-lg shadow-xl max-w-sm w-full p-5">
        <h2 className="text-base font-semibold mb-3 text-ink">{t('imageMetadataModal.title')}</h2>

        <label className="block text-xs font-medium text-ink-soft mb-1">{t('imageMetadataModal.folio')}</label>
        <input
          type="text"
          value={folio}
          onChange={(e) => setFolio(e.target.value)}
          placeholder={t('imageMetadataModal.folioPlaceholder')}
          className="w-full px-2 py-1 mb-3 text-sm border border-rule rounded focus:outline-none focus:ring-1 focus:ring-focus"
          autoFocus
        />

        <label className="block text-xs font-medium text-ink-soft mb-1">{t('imageMetadataModal.label')}</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('imageMetadataModal.labelPlaceholder')}
          className="w-full px-2 py-1 mb-4 text-sm border border-rule rounded focus:outline-none focus:ring-1 focus:ring-focus"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1 text-sm text-ink-soft hover:bg-ink-wash rounded"
            onClick={onClose}
          >
            {t('imageMetadataModal.cancel')}
          </button>
          <button
            type="button"
            className="px-3 py-1 text-sm bg-rubric text-on-rubric rounded hover:bg-rubric-soft"
            onClick={handleSave}
          >
            {t('imageMetadataModal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
