import { useState } from 'react';
import type { Section, SyllabifiedWord } from '../lib/models';
import { useTranslation } from 'react-i18next';

interface SectionPanelProps {
  /** All words in the project (needed to show word options for range selection) */
  words: SyllabifiedWord[];
  /** Current sections */
  sections: Section[];
  /** Add a new section */
  onAdd: (section: Section) => void;
  /** Remove section by id */
  onRemove: (id: string) => void;
  /** Update an existing section */
  onUpdate: (section: Section) => void;
}

interface FormState {
  name: string;
  startIdx: number;
  endIdx: number;
}

const EMPTY_FORM: FormState = { name: '', startIdx: 0, endIdx: 0 };

export function SectionPanel({
  words,
  sections,
  onAdd,
  onRemove,
  onUpdate,
}: SectionPanelProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openAddForm() {
    setEditingId(null);
    setForm({
      name: '',
      startIdx: 0,
      endIdx: Math.max(0, words.length - 1),
    });
    setShowForm(true);
  }

  function openEditForm(section: Section) {
    setEditingId(section.id);
    setForm({
      name: section.name,
      startIdx: section.wordRange[0],
      endIdx: section.wordRange[1],
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      alert(t('sectionPanel.nameRequired'));
      return;
    }
    if (form.endIdx < form.startIdx) {
      alert(t('sectionPanel.endIndexMustBeAfterStart'));
      return;
    }

    if (editingId !== null) {
      onUpdate({
        id: editingId,
        name: form.name.trim(),
        wordRange: [form.startIdx, form.endIdx],
      });
    } else {
      onAdd({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        wordRange: [form.startIdx, form.endIdx],
      });
    }
    cancelForm();
  }

  function handleStartChange(newStart: number) {
    setForm((prev) => ({
      ...prev,
      startIdx: newStart,
      endIdx: Math.max(newStart, prev.endIdx),
    }));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
          {t('sectionPanel.title')}
        </h2>
        {!showForm && (
          <button
            onClick={openAddForm}
            className="text-sm text-rubric hover:text-rubric font-medium"
          >
            {t('sectionPanel.add')}
          </button>
        )}
      </div>

      {/* Section list */}
      {sections.length === 0 && !showForm && (
        <p className="text-sm text-ink-muted italic">{t('sectionPanel.empty')}</p>
      )}

      {sections.length > 0 && (
        <ul className="space-y-1 mb-3">
          {sections.map((section) => (
            <li
              key={section.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg border border-rule-soft bg-parchment"
            >
              <div>
                <span className="font-medium text-sm text-ink">
                  {section.name}
                </span>
                <span className="ml-2 text-xs text-ink-muted">
                  {t('sectionPanel.wordsRange', { start: section.wordRange[0] + 1, end: section.wordRange[1] + 1 })}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditForm(section)}
                  className="text-xs text-rubric hover:underline"
                >
                  {t('sectionPanel.edit')}
                </button>
                <button
                  onClick={() => onRemove(section.id)}
                  className="text-xs text-danger hover:underline"
                >
                  {t('sectionPanel.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="border border-rubric-soft rounded-lg p-4 bg-rubric-wash space-y-3">
          {words.length === 0 ? (
            <p className="text-sm text-ink-muted italic">
              {t('sectionPanel.addTextFirst')}
            </p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  {t('sectionPanel.name')}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t('sectionPanel.namePlaceholder')}
                  autoFocus
                  className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1">
                    {t('sectionPanel.startWord')}
                  </label>
                  <select
                    value={form.startIdx}
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus outline-none"
                  >
                    {words.map((w, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {w.original}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1">
                    {t('sectionPanel.endWord')}
                  </label>
                  <select
                    value={form.endIdx}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, endIdx: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-rule rounded-lg text-sm focus:ring-2 focus:ring-focus outline-none"
                  >
                    {words.slice(form.startIdx).map((w, offset) => {
                      const i = form.startIdx + offset;
                      return (
                        <option key={i} value={i}>
                          {i + 1}. {w.original}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 text-sm text-ink-soft border border-rule rounded-lg hover:bg-ink-wash"
            >
              {t('sectionPanel.cancel')}
            </button>
            {words.length > 0 && (
              <button
                onClick={handleSubmit}
                className="px-3 py-1.5 text-sm bg-rubric text-on-rubric rounded-lg hover:bg-rubric-soft"
              >
                {editingId !== null ? t('sectionPanel.save') : t('sectionPanel.addAction')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
