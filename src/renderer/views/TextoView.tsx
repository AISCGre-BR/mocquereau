import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useProject } from "../hooks/useProject";
import { usePendingFlush } from "../hooks/pendingEdits";
import { useHyphenationMode, withRawText } from "../hooks/useHyphenationMode";
import { SyllableText } from "../components/texto/SyllableText";
import { RawTextEditor } from "../components/texto/RawTextEditor";
import { SectionMargin } from "../components/texto/SectionMargin";
import { MODE_ORDER, modeName } from "../components/new-project/ModeOptions";
import { replaceWordSyllables } from "../lib/syllable-edit";
import { ambiguousWords } from "../lib/syllable-alternatives";
import type { HyphenationMode } from "../lib/syllabify";
import type { Section } from "../lib/models";
import { formatAccelerator, matchAccelerator } from "../shell/accelerator";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input, Select } from "../ui/Field";
import { MenuItem, MenuSeparator, MenuSurface } from "../ui/Menu";

const EDIT_TEXT_ACCEL = "Ctrl+Shift+E";

export interface TextoViewProps {
  onAddSource(): void;
  onImportGueranger(): void;
}

type ContextMenu =
  | { kind: "word"; x: number; y: number; wordIdx: number }
  | { kind: "body"; x: number; y: number }
  | { kind: "section"; x: number; y: number; section: Section };

type SectionDialog = { kind: "new"; wordIdx: number } | { kind: "rename"; section: Section };

/** Vista Texto: a peça numa folha, com as sílabas editáveis no lugar e as seções na margem. */
export function TextoView({ onAddSource, onImportGueranger }: TextoViewProps) {
  const { state, dispatch, pending } = useProject();
  const { t } = useTranslation();
  const { mode, changeMode, changeText } = useHyphenationMode();
  const project = state.project;
  const raw = project?.text.raw ?? "";
  const words = project?.text.words ?? [];

  // ── Título e autor: cópias locais gravadas com debounce de 300 ms ──────────
  const [title, setTitle] = useState(() => project?.meta.title ?? "");
  const [author, setAuthor] = useState(() => project?.meta.author ?? "");

  // ── Texto bruto: null = mostrando as sílabas; string = editor aberto ───────
  const [draft, setDraft] = useState<string | null>(() => (raw.trim() ? null : raw));
  const editorOpen = draft !== null;
  // Esc fecha o editor e a remoção do textarea pode disparar um blur logo depois:
  // a segunda saída não aplica de novo.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [sectionDialog, setSectionDialog] = useState<SectionDialog | null>(null);
  const [sectionName, setSectionName] = useState("");
  const textRef = useRef<HTMLDivElement>(null);

  // Projeto da última renderização (lido pelos flushes e timers).
  const savedProject = useRef(project);
  savedProject.current = project;

  useEffect(() => {
    if (!project) return;
    if (title.trim() === "") return; // não permite gravar título vazio
    if (project.meta.title === title && project.meta.author === author) return;
    const timer = setTimeout(() => {
      const meta = savedProject.current?.meta;
      if (meta && meta.title === title && meta.author === author) return; // já gravado por um flush
      dispatch({ type: "SET_META", payload: { title, author } });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, author]);

  // Ao sair da vista o debounce acima é cancelado; grava o que ficou pendente
  // (título/autor e o texto ainda no editor). O mesmo flush roda antes de
  // Novo/Abrir/Fechar/Salvar/Desfazer (registro de pendências). Sem perguntas:
  // o texto é re-silabificado e as caixas, remapeadas.
  const latest = useRef({ title, author, draft });
  latest.current = { title, author, draft };
  usePendingFlush(() => {
    const saved = savedProject.current;
    if (!saved) return false;
    const p = latest.current;
    let flushed = false;
    if (p.title.trim() !== "" && (saved.meta.title !== p.title || saved.meta.author !== p.author)) {
      dispatch({ type: "SET_META", payload: { title: p.title, author: p.author } });
      flushed = true;
    }
    if (p.draft !== null && p.draft !== saved.text.raw) {
      dispatch({ type: "REPLACE_PROJECT", payload: withRawText(saved, p.draft) });
      flushed = true;
    }
    return flushed;
  });

  const rawRef = useRef(raw);
  rawRef.current = raw;
  function openEditor() {
    setMenu(null);
    setDraft((d) => d ?? rawRef.current);
  }

  function closeEditor() {
    const text = draftRef.current;
    if (text === null) return;
    if (!changeText(text)) return; // recusou a confirmação: o editor fica aberto
    if (!text.trim()) return; // sem texto, o editor continua no lugar
    draftRef.current = null;
    setDraft(null);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!matchAccelerator(EDIT_TEXT_ACCEL, e)) return;
      e.preventDefault();
      openEditor();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ambiguities = useMemo(
    () => (mode === "sung" || mode === "liturgical-typographic" ? ambiguousWords(raw) : undefined),
    [raw, mode],
  );

  if (!project) return null;
  const sections = project.sections;

  // ── Seções ─────────────────────────────────────────────────────────────────
  function openSectionDialog(dialog: SectionDialog) {
    setMenu(null);
    setSectionName(dialog.kind === "rename" ? dialog.section.name : "");
    setSectionDialog(dialog);
  }

  function confirmSectionDialog() {
    const name = sectionName.trim();
    if (!sectionDialog || !name) return;
    if (sectionDialog.kind === "rename") {
      dispatch({ type: "UPDATE_SECTION", payload: { ...sectionDialog.section, name } });
    } else {
      const start = sectionDialog.wordIdx;
      // Vai até antes da próxima seção (ou o fim); a seção em que começa termina antes dela.
      const nextStart = Math.min(...sections.map((s) => s.wordRange[0]).filter((s) => s > start), words.length);
      const containing = sections.find((s) => s.wordRange[0] < start && s.wordRange[1] >= start);
      if (containing) {
        dispatch({ type: "UPDATE_SECTION", payload: { ...containing, wordRange: [containing.wordRange[0], start - 1] } });
      }
      dispatch({
        type: "ADD_SECTION",
        payload: { id: crypto.randomUUID(), name, wordRange: [start, nextStart - 1] },
      });
    }
    setSectionDialog(null);
  }

  const at = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });
  const shortcut = formatAccelerator(EDIT_TEXT_ACCEL, window.mocquereau?.platform ?? "");

  function renderMenu(m: ContextMenu) {
    const editItem = <MenuItem label={t("texto.editText")} shortcut={shortcut} onSelect={openEditor} />;
    return (
      <MenuSurface
        aria-label={m.kind === "section" ? m.section.name : t("texto.menu")}
        className="fixed z-[130]"
        style={{ left: m.x, top: m.y }}
        onClose={() => setMenu(null)}
      >
        {m.kind === "section" ? (
          <>
            <MenuItem
              label={t("texto.section.rename")}
              onSelect={() => openSectionDialog({ kind: "rename", section: m.section })}
            />
            <MenuItem
              label={t("texto.section.remove")}
              onSelect={() => dispatch({ type: "REMOVE_SECTION", payload: m.section.id })}
            />
          </>
        ) : m.kind === "word" ? (
          <>
            <MenuItem
              label={t("texto.section.start")}
              disabled={sections.some((s) => s.wordRange[0] === m.wordIdx)}
              onSelect={() => openSectionDialog({ kind: "new", wordIdx: m.wordIdx })}
            />
            <MenuSeparator />
            {editItem}
          </>
        ) : (
          editItem
        )}
      </MenuSurface>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex flex-col items-center gap-5 px-4 pt-8 pb-10">
        <div className="grid w-full max-w-[860px] grid-cols-[148px_minmax(0,1fr)] rounded-lg bg-surface pt-12 pr-[72px] pb-4 shadow-[var(--elev-2),var(--highlight)]">
          <div />
          <div className="mb-5 flex flex-col gap-1 border-b border-rule-soft pb-6">
            <input
              type="text"
              value={title}
              aria-label={t("texto.titlePlaceholder")}
              placeholder={t("texto.titlePlaceholder")}
              onChange={(e) => {
                pending?.markPending();
                setTitle(e.target.value);
              }}
              className="w-full rounded-xs bg-transparent font-serif text-[26px] leading-8 font-semibold text-ink outline-none placeholder:text-ink-muted focus-visible:shadow-[0_0_0_3px_var(--rubric-wash)]"
            />
            <input
              type="text"
              value={author}
              aria-label={t("newProject.authorPlaceholder")}
              placeholder={t("newProject.authorPlaceholder")}
              onChange={(e) => {
                pending?.markPending();
                setAuthor(e.target.value);
              }}
              className="w-full rounded-xs bg-transparent text-body text-ink-muted outline-none placeholder:text-ink-muted placeholder:opacity-80 focus-visible:shadow-[0_0_0_3px_var(--rubric-wash)]"
            />
          </div>

          <SectionMargin
            sections={sections}
            textRef={textRef}
            layoutKey={editorOpen ? null : words}
            onSectionMenu={(section, e) => setMenu({ kind: "section", section, ...at(e) })}
          />
          <div
            ref={textRef}
            data-testid="texto-body"
            className="min-h-[260px]"
            onDoubleClick={(e) => {
              // Na palavra, o clique separa sílabas: o duplo clique abre o editor só fora delas.
              if ((e.target as HTMLElement).closest('[data-testid^="word-"]')) return;
              openEditor();
            }}
            onContextMenu={(e) => {
              if (editorOpen || e.defaultPrevented) return;
              e.preventDefault();
              setMenu({ kind: "body", ...at(e) });
            }}
          >
            {editorOpen ? (
              <RawTextEditor
                value={draft}
                onChange={(value) => {
                  pending?.markPending();
                  setDraft(value);
                }}
                onDone={closeEditor}
              />
            ) : (
              <SyllableText
                raw={raw}
                words={words}
                ambiguities={ambiguities}
                className="text-[19px] leading-[34px] text-ink"
                onWordsChange={(next, wordIdx) =>
                  dispatch({
                    type: "REPLACE_PROJECT",
                    payload: replaceWordSyllables(project, wordIdx, next[wordIdx].syllables),
                  })
                }
                onWordContextMenu={(wordIdx, e) => {
                  e.preventDefault();
                  setMenu({ kind: "word", wordIdx, ...at(e) });
                }}
              />
            )}
          </div>

          <div />
          <div className="mt-4 flex items-center border-t border-rule-soft pt-3">
            <Select
              label={t("texto.syllabification")}
              value={mode}
              onChange={(e) => changeMode(e.target.value as HyphenationMode)}
              className="flex-row items-center gap-1 [&>span]:text-label [&>span]:font-normal [&>span]:text-ink-muted [&_select]:h-7 [&_select]:w-auto [&_select]:cursor-pointer [&_select]:border-transparent [&_select]:bg-transparent [&_select]:py-0 [&_select]:font-medium [&_select]:text-ink-soft [&_select]:shadow-none [&_select:hover]:bg-ink-wash"
            >
              {MODE_ORDER.map((m) => (
                <option key={m} value={m}>
                  {modeName(t, m)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {project.sources.length === 0 && (
          <div className="flex w-full max-w-[860px] items-center justify-end gap-2">
            <Button onClick={onImportGueranger}>{t("shell.file.importGueranger")}</Button>
            <Button variant="filled" icon={<Plus aria-hidden="true" />} onClick={onAddSource}>
              {t("texto.addSource")}
            </Button>
          </div>
        )}
      </div>

      {menu && renderMenu(menu)}

      <Dialog
        open={sectionDialog !== null}
        title={sectionDialog?.kind === "rename" ? t("texto.section.renameTitle") : t("texto.section.newTitle")}
        onClose={() => setSectionDialog(null)}
        onConfirm={confirmSectionDialog}
        actions={
          <>
            <Button variant="elevated" onClick={() => setSectionDialog(null)}>
              {t("texto.cancel")}
            </Button>
            <Button variant="filled" disabled={!sectionName.trim()} onClick={confirmSectionDialog}>
              {t("texto.section.save")}
            </Button>
          </>
        }
      >
        <Input
          label={t("texto.section.name")}
          value={sectionName}
          data-autofocus
          onChange={(e) => setSectionName(e.target.value)}
        />
      </Dialog>
    </div>
  );
}
