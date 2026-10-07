import { useState } from "react";
import type { ManuscriptSource } from "../lib/models";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceModalProps {
  source: ManuscriptSource;
  onSave: (updated: ManuscriptSource) => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTATION_OPTIONS: { value: ManuscriptSource["metadata"]["notation"]; label: string }[] = [
  { value: "adiastematic", label: "sourceModal.notation.adiastematic" },
  { value: "diastematic", label: "sourceModal.notation.diastematic" },
  { value: "square", label: "sourceModal.notation.square" },
  { value: "modern", label: "sourceModal.notation.modern" },
  { value: "other", label: "sourceModal.notation.other" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceModal({ source, onSave, onClose }: SourceModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ManuscriptSource["metadata"]>(() => ({
    ...source.metadata,
  }));

  function handleSave() {
    onSave({ ...source, metadata: draft });
  }

  function update(patch: Partial<ManuscriptSource["metadata"]>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div
      className="fixed inset-0 bg-ink/20 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
        <h2 className="text-base font-semibold text-ink mb-5">
          {t("sourceModal.title")}
        </h2>

        <div className="space-y-4">
          {/* Sigla */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.siglum")}
            </label>
            <input
              type="text"
              value={draft.siglum}
              onChange={(e) => update({ siglum: e.target.value })}
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none font-mono"
              placeholder={t("sourceModal.siglumPlaceholder")}
            />
          </div>

          {/* Biblioteca */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.library")}
            </label>
            <input
              type="text"
              value={draft.library}
              onChange={(e) => update({ library: e.target.value })}
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
              placeholder={t("sourceModal.libraryPlaceholder")}
            />
          </div>

          {/* Cidade */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.city")}
            </label>
            <input
              type="text"
              value={draft.city}
              onChange={(e) => update({ city: e.target.value })}
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
              placeholder={t("sourceModal.cityPlaceholder")}
            />
          </div>

          {/* Século */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.century")}
            </label>
            <input
              type="text"
              value={draft.century}
              onChange={(e) => update({ century: e.target.value })}
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
              placeholder={t("sourceModal.centuryPlaceholder")}
            />
          </div>

          {/* Fólio */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.folio")}
            </label>
            <input
              type="text"
              value={draft.folio}
              onChange={(e) => update({ folio: e.target.value })}
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
              placeholder={t("sourceModal.folioPlaceholder")}
            />
          </div>

          {/* Cantus ID */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.cantusId")}
            </label>
            <input
              type="text"
              value={draft.cantusId ?? ""}
              onChange={(e) =>
                update({ cantusId: e.target.value || undefined })
              }
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none font-mono"
              placeholder={t("sourceModal.cantusIdPlaceholder")}
            />
          </div>

          {/* URL da fonte */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.sourceUrl")}
            </label>
            <input
              type="text"
              value={draft.sourceUrl ?? ""}
              onChange={(e) =>
                update({ sourceUrl: e.target.value || undefined })
              }
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
              placeholder={t("sourceModal.sourceUrlPlaceholder")}
            />
          </div>

          {/* Manifesto IIIF */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.iiifManifest")}
            </label>
            <input
              type="text"
              value={draft.iiifManifest ?? ""}
              onChange={(e) =>
                update({ iiifManifest: e.target.value || undefined })
              }
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
              placeholder={t("sourceModal.iiifManifestPlaceholder")}
            />
            <p className="text-xs text-ink-muted mt-1">
              {t("sourceModal.iiifManifestHint")}
            </p>
          </div>

          {/* Notação */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {t("sourceModal.notationLabel")}
            </label>
            <select
              value={draft.notation}
              onChange={(e) =>
                update({
                  notation: e.target.value as ManuscriptSource["metadata"]["notation"],
                })
              }
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none bg-surface"
            >
              {NOTATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-rule-soft">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-soft border border-rule rounded-lg hover:bg-ink-wash transition-colors"
          >
            {t("sourceModal.cancel")}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-rubric text-on-rubric rounded-lg hover:bg-rubric-soft transition-colors"
          >
            {t("sourceModal.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
