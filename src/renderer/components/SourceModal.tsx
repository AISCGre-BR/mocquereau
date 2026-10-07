import { useState } from "react";
import type { ManuscriptSource } from "../lib/models";
import { useTranslation } from "react-i18next";
import { useProject } from "../hooks/useProject";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceModalProps {
  source: ManuscriptSource;
  onSave: (updated: ManuscriptSource) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceModal({ source, onSave, onClose }: SourceModalProps) {
  const { t } = useTranslation();
  const { state } = useProject();
  const level1 = state.project?.classification[0] ?? { name: "", values: [] };
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

          {/* Classification level 1 */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              {level1.name}
            </label>
            <select
              value={draft.classes[0] ?? ""}
              onChange={(e) =>
                update({ classes: [e.target.value || null, draft.classes[1], draft.classes[2]] })
              }
              className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none bg-surface"
            >
              <option value="">—</option>
              {level1.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
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
