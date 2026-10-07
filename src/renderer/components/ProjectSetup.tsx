import { useState, useMemo, useEffect, useRef } from 'react';
import { syllabifyText, type HyphenationMode } from '../lib/syllabify';
import { useProject } from '../hooks/useProject';
import { SectionPanel } from './SectionPanel';
import { migrateHyphenation, previewMigration } from '../lib/migrate-hyphenation';
import type { SyllabifiedWord } from '../lib/models';
import { useTranslation } from 'react-i18next';

const MODE_LABELS: Record<HyphenationMode, string> = {
  'sung': 'projectSetup.mode.sung',
  'liturgical-typographic': 'projectSetup.mode.liturgicalTypographic',
  'classical': 'projectSetup.mode.classical',
  'modern': 'projectSetup.mode.modern',
  'manual': 'projectSetup.mode.manual',
};

// Tooltip copy locked by D-02 pt.4 (08-CONTEXT.md).
const MODE_TOOLTIPS: Record<HyphenationMode, string> = {
  'sung': 'projectSetup.modeTooltip.sung',
  'liturgical-typographic': 'projectSetup.modeTooltip.liturgicalTypographic',
  'classical': 'projectSetup.modeTooltip.classical',
  'modern': 'projectSetup.modeTooltip.modern',
  'manual': 'projectSetup.modeTooltip.manual',
};

const MODES: HyphenationMode[] = [
  'sung',
  'liturgical-typographic',
  'classical',
  'modern',
  'manual',
];

/** Convert SyllabifiedWord[] to a human-readable hyphenated string */
function wordsToHyphenated(words: SyllabifiedWord[]): string {
  return words.map((w) => w.syllables.join('-')).join(' ');
}

/** Build the confirmation message shown before migrating syllable indices. */
function buildMigrationMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  newMode: HyphenationMode,
  stats: ReturnType<typeof previewMigration>,
): string {
  const head = t('projectSetup.migration.head', { mode: t(MODE_LABELS[newMode]) });
  const kept = t('projectSetup.migration.kept', { count: stats.preservedBoxes });
  const dropped = t('projectSetup.migration.dropped', { count: stats.droppedBoxes });
  const total = t('projectSetup.migration.total', {
    oldCount: stats.oldSyllableCount,
    newCount: stats.newSyllableCount,
  });
  const wordsList =
    stats.changedWords.length > 0
      ? t('projectSetup.migration.changedWordsHeader') +
        stats.changedWords
          .slice(0, 10)
          .map((w) => t('projectSetup.migration.changedWordItem', { word: w.word, oldSplit: w.oldSplit, newSplit: w.newSplit }))
          .join('\n') +
        (stats.changedWords.length > 10 ? '\n' + t('projectSetup.migration.changedWordsMore', { count: stats.changedWords.length - 10 }) : '')
      : t('projectSetup.migration.noChangedWords');
  const foot = stats.droppedBoxes > 0
    ? t('projectSetup.migration.footDropped')
    : t('projectSetup.migration.footContinue');
  return [head, kept, dropped, total, wordsList, foot].join('');
}

/** Parse a hyphenated string back into SyllabifiedWord[] */
function hyphenatedToWords(text: string): SyllabifiedWord[] {
  if (!text.trim()) return [];
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const syllables = token.split('-').filter(Boolean);
      const original = syllables.join('');
      return { original, syllables };
    });
}

export function ProjectSetup() {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();

  // ── Local state ────────────────────────────────────────────────────────────
  const [rawText, setRawText] = useState<string>(
    () => state.project?.text.raw ?? ''
  );
  const [debouncedText, setDebouncedText] = useState<string>(rawText);
  const [hyphenationMode, setHyphenationMode] = useState<HyphenationMode>(
    () => state.project?.text.hyphenationMode ?? 'sung'
  );
  // Sílabas que não coincidem com a silabificação automática (editadas à mão aqui ou
  // na Tabela) abrem em modo manual, para a montagem da vista não sobrescrevê-las.
  const [hasManualEdits, setHasManualEdits] = useState<boolean>(() => {
    const text = state.project?.text;
    if (!text) return false;
    return JSON.stringify(text.words) !== JSON.stringify(syllabifyText(text.raw, text.hyphenationMode));
  });
  const [title, setTitle] = useState<string>(
    () => state.project?.meta.title ?? ''
  );
  const [author, setAuthor] = useState<string>(
    () => state.project?.meta.author ?? ''
  );

  // Hyphenated text for the editable textarea
  const [syllabifiedText, setSyllabifiedText] = useState<string>(
    () => wordsToHyphenated(state.project?.text.words ?? [])
  );

  // Só grava no projeto depois de uma edição nesta vista: montar (trocar de vista,
  // abrir projeto) não pode marcar o projeto como editado.
  const userEdited = useRef(false);

  // ── Debounce ───────────────────────────────────────────────────────────────
  const lastRawText = useRef(rawText);
  useEffect(() => {
    // When the raw text changes, reset manual edits so auto-syllabification takes over
    // (só quando o texto mudou de fato: montar a vista não descarta edições manuais).
    if (lastRawText.current !== rawText) {
      lastRawText.current = rawText;
      setHasManualEdits(false);
    }
    const timer = setTimeout(() => setDebouncedText(rawText), 300);
    return () => clearTimeout(timer);
  }, [rawText]);

  // Auto-syllabify when debounced text or mode changes
  const autoSyllabified = useMemo(
    () => syllabifyText(debouncedText, hyphenationMode),
    [debouncedText, hyphenationMode]
  );

  // Update the syllabified textarea when auto-syllabification runs
  // (only if user hasn't manually edited it)
  useEffect(() => {
    if (!hasManualEdits) {
      setSyllabifiedText(wordsToHyphenated(autoSyllabified));
    }
  }, [autoSyllabified, hasManualEdits]);

  // Dispatch to project state when syllabified text changes
  useEffect(() => {
    if (!state.project || !userEdited.current) return;
    const words = hasManualEdits
      ? hyphenatedToWords(syllabifiedText)
      : autoSyllabified;
    dispatch({
      type: 'SET_TEXT',
      payload: { raw: rawText, words, hyphenationMode },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syllabifiedText, autoSyllabified, hasManualEdits]);

  // Persist title/author edits to project state (debounced).
  // Without this, local input changes were lost — name reverted on save/export
  // because handleSave/DOCX read from state.project.meta, not local state.
  useEffect(() => {
    if (!state.project) return;
    const t = title.trim();
    if (t === '') return; // não permite gravar título vazio
    if (
      state.project.meta.title === title &&
      state.project.meta.author === author
    ) {
      return; // nada mudou — evita re-dispatch em loop
    }
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_META', payload: { title, author } });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, author]);

  // Ao sair da vista o debounce de 300 ms acima é cancelado; grava título/autor
  // pendentes antes de desmontar.
  const pendingMeta = useRef({ title, author });
  pendingMeta.current = { title, author };
  const savedMeta = useRef(state.project?.meta);
  savedMeta.current = state.project?.meta;
  useEffect(() => {
    return () => {
      const pending = pendingMeta.current;
      const saved = savedMeta.current;
      if (!saved || pending.title.trim() === '') return;
      if (saved.title === pending.title && saved.author === pending.author) return;
      dispatch({ type: 'SET_META', payload: { title: pending.title, author: pending.author } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Syllabified text editing ──────────────────────────────────────────────
  function handleSyllabifiedChange(value: string) {
    userEdited.current = true;
    setSyllabifiedText(value);
    setHasManualEdits(true);
  }

  // ── Mode change ────────────────────────────────────────────────────────────
  function handleModeChange(newMode: HyphenationMode) {
    userEdited.current = true;
    if (hasManualEdits && newMode !== 'manual') {
      const ok = window.confirm(
        t('projectSetup.confirmDiscardManualEdits')
      );
      if (!ok) return;
      setHasManualEdits(false);
    }

    // If the project has any syllable-indexed data (boxes, gaps, cuts) we
    // need to remap indices because word splits may differ between modes.
    // Offer automatic migration (preserves boxes on unchanged words, drops
    // boxes on words whose syllable count shifts).
    if (state.project && newMode !== 'manual' && hyphenationMode !== 'manual') {
      const hasAnyBoxes = state.project.sources.some((s) =>
        s.lines.some(
          (l) =>
            (l.syllableBoxes && Object.keys(l.syllableBoxes).length > 0) ||
            (l.gaps && l.gaps.length > 0)
        )
      );
      if (hasAnyBoxes) {
        const stats = previewMigration(state.project, newMode);
        const msg = buildMigrationMessage(t, newMode, stats);
        const confirmed = window.confirm(msg);
        if (!confirmed) return;
        const { project: migrated } = migrateHyphenation(state.project, newMode);
        dispatch({ type: 'SET_PROJECT', payload: migrated });
        setHyphenationMode(newMode);
        setSyllabifiedText(wordsToHyphenated(migrated.text.words));
        return;
      }
    }

    setHyphenationMode(newMode);
    // Re-syllabify immediately
    const words = syllabifyText(rawText, newMode);
    setSyllabifiedText(wordsToHyphenated(words));
    if (state.project) {
      dispatch({
        type: 'SET_TEXT',
        payload: { raw: rawText, words, hyphenationMode: newMode },
      });
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
        {/* Metadata card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {t('projectSetup.projectInfo')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('projectSetup.projectTitle')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('projectSetup.projectTitlePlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('projectSetup.author')}
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t('projectSetup.authorPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {/* Text input card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {t('projectSetup.liturgicalText')}
            </h2>
            {hasManualEdits && (
              <span className="text-xs text-amber-600">
                {t('projectSetup.manualEditsWarning')}
              </span>
            )}
          </div>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => {
              userEdited.current = true;
              setRawText(e.target.value);
            }}
            placeholder={t('projectSetup.liturgicalTextPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono"
          />

          {/* Mode selector */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-gray-500 mr-1">{t('projectSetup.modeLabel')}</span>
            {MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                title={t(MODE_TOOLTIPS[mode])}
                className={[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  hyphenationMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
                ].join(' ')}
              >
                {t(MODE_LABELS[mode])}
              </button>
            ))}
          </div>
        </div>

        {/* Syllabification result card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {t('projectSetup.syllabification')}
            </h2>
            {hasManualEdits && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                {t('projectSetup.editedManually')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-2">
            {t('projectSetup.syllabificationHint')}
          </p>
          <textarea
            rows={4}
            value={syllabifiedText}
            onChange={(e) => handleSyllabifiedChange(e.target.value)}
            placeholder={t('projectSetup.syllabificationPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono"
          />
        </div>

        {/* Section panel card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <SectionPanel
            words={
              hasManualEdits
                ? hyphenatedToWords(syllabifiedText)
                : state.project?.text.words ?? autoSyllabified
            }
            sections={state.project?.sections ?? []}
            onAdd={(s) => dispatch({ type: 'ADD_SECTION', payload: s })}
            onRemove={(id) =>
              dispatch({ type: 'REMOVE_SECTION', payload: id })
            }
            onUpdate={(s) => dispatch({ type: 'UPDATE_SECTION', payload: s })}
          />
        </div>
      </div>
    </div>
  );
}
