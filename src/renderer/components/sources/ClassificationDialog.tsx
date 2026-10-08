// src/renderer/components/sources/ClassificationDialog.tsx
//
// Diálogo Classificação: os três níveis lado a lado, com os nomes e os valores
// editáveis no lugar. Toda mudança vai ao projeto (SET_CLASSIFICATION) e à
// biblioteca do usuário (applyClassificationEdits: o que foi editado aqui vale).
// Remover um valor em uso limpa-o nas fontes numa só entrada de desfazer.

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import type { HistoryMeta } from "../../history/history";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { MenuItem, MenuSurface } from "../../ui/Menu";
import { belowElement } from "../texto/SyllableText";
import { applyClassificationEdits } from "@shared/classification";
import type { ClassLevel, Classification, SourceClasses } from "@shared/project-schema";

export interface ClassificationDialogProps {
  onClose(): void;
}

type ValueRef = { level: number; id: string };
type Editing = { kind: "level"; level: number } | { kind: "value"; level: number; id: string } | { kind: "add"; level: number };
type Menu = ValueRef & { x: number; y: number };

const isMenuKey = (e: KeyboardEvent) => e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

function withLevel(c: Classification, level: number, update: (l: ClassLevel) => ClassLevel): Classification {
  return c.map((l, i) => (i === level ? update(l) : l)) as Classification;
}

function moveValue(c: Classification, ref: ValueRef, to: number): Classification {
  return withLevel(c, ref.level, (l) => {
    const from = l.values.findIndex((v) => v.id === ref.id);
    const target = Math.max(0, Math.min(l.values.length - 1, to));
    if (from < 0 || from === target) return l;
    const values = [...l.values];
    const [moved] = values.splice(from, 1);
    values.splice(target, 0, moved);
    return { ...l, values };
  });
}

export function ClassificationDialog({ onClose }: ClassificationDialogProps) {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ValueRef | null>(null);
  const [dragging, setDragging] = useState<ValueRef | null>(null);
  // O campo aberto, para Enter e o blur da remoção do campo não gravarem duas vezes.
  const editingRef = useRef<Editing | null>(null);
  // Gravações na biblioteca em fila: cada uma lê a anterior já gravada.
  const libraryQueue = useRef<Promise<void>>(Promise.resolve());
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<string | null>(null);
  useEffect(() => {
    const selector = focusRequest.current;
    if (!selector) return;
    focusRequest.current = null;
    bodyRef.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  if (!project) return null;
  const classification = project.classification;
  const nameOf = (ref: ValueRef) => classification[ref.level].values.find((v) => v.id === ref.id)?.name ?? "";
  const usersOf = (ref: ValueRef) => project.sources.filter((s) => s.metadata.classes[ref.level] === ref.id).length;
  const focusValue = (id: string) => (focusRequest.current = `[data-value-id="${id}"]`);

  function syncLibrary(next: Classification) {
    libraryQueue.current = libraryQueue.current
      .then(() => window.mocquereau.getClassification())
      .then((lib) => window.mocquereau.setClassification(applyClassificationEdits(lib, next)))
      .catch(() => {});
  }

  function commit(next: Classification, meta: HistoryMeta = { coalesceKey: undefined }) {
    dispatch({ type: "SET_CLASSIFICATION", payload: next, meta });
    syncLibrary(next);
  }

  // ── Inline edits ──────────────────────────────────────────────────────────

  function startEdit(next: Editing) {
    setMenu(null);
    editingRef.current = next;
    setEditing(next);
    setDraft(
      next.kind === "level"
        ? classification[next.level].name
        : next.kind === "value"
          ? nameOf(next)
          : "",
    );
  }

  function finishEdit(save: boolean) {
    const current = editingRef.current;
    if (!current) return;
    editingRef.current = null;
    setEditing(null);
    const name = draft.trim();
    if (current.kind === "level") {
      focusRequest.current = `[data-level-name="${current.level}"]`;
      if (save && name && name !== classification[current.level].name) {
        commit(withLevel(classification, current.level, (l) => ({ ...l, name })));
      }
    } else if (current.kind === "value") {
      focusValue(current.id);
      if (save && name && name !== nameOf(current)) {
        commit(
          withLevel(classification, current.level, (l) => ({
            ...l,
            values: l.values.map((v) => (v.id === current.id ? { ...v, name } : v)),
          })),
        );
      }
    } else {
      focusRequest.current = `[data-add="${current.level}"]`;
      if (save && name) {
        const value = { id: crypto.randomUUID(), name };
        commit(withLevel(classification, current.level, (l) => ({ ...l, values: [...l.values, value] })));
      }
    }
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    finishEdit(e.key === "Enter");
  }

  const editInput = (label: string) => (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onEditKeyDown}
      onBlur={() => finishEdit(true)}
      className="my-0.5 h-8 rounded-sm bg-surface px-2.5 text-body text-ink shadow-inset outline-none ring-2 ring-rubric"
    />
  );

  // ── Remove ────────────────────────────────────────────────────────────────

  function requestRemove(ref: ValueRef) {
    setMenu(null);
    if (usersOf(ref) > 0) setConfirmRemove(ref);
    else commit(withLevel(classification, ref.level, (l) => ({ ...l, values: l.values.filter((v) => v.id !== ref.id) })));
  }

  function confirmRemoval() {
    const ref = confirmRemove;
    setConfirmRemove(null);
    if (!ref) return;
    const next = withLevel(classification, ref.level, (l) => ({ ...l, values: l.values.filter((v) => v.id !== ref.id) }));
    const sources = project!.sources.map((s) => {
      if (s.metadata.classes[ref.level] !== ref.id) return s;
      const classes = [...s.metadata.classes] as SourceClasses;
      classes[ref.level] = null;
      return { ...s, metadata: { ...s.metadata, classes } };
    });
    // Classificação e fontes juntas: uma entrada de desfazer.
    dispatch({ type: "REPLACE_PROJECT", payload: { ...project!, classification: next, sources } });
    syncLibrary(next);
  }

  // ── Value rows: keyboard, menu, drag ──────────────────────────────────────

  function move(ref: ValueRef, to: number) {
    const next = moveValue(classification, ref, to);
    if (next[ref.level] === classification[ref.level]) return;
    focusValue(ref.id);
    // Alt+setas seguidas no mesmo valor: um passo de desfazer.
    commit(next, { coalesceKey: `CLASS_MOVE:${ref.id}` });
  }

  function onValueKeyDown(ref: ValueRef, index: number, e: KeyboardEvent<HTMLLIElement>) {
    const values = classification[ref.level].values;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      move(ref, index + (e.key === "ArrowUp" ? -1 : 1));
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const next = values[index + (e.key === "ArrowUp" ? -1 : 1)];
      if (next) bodyRef.current?.querySelector<HTMLElement>(`[data-value-id="${next.id}"]`)?.focus();
    } else if (e.key === "F2" || (e.key === "Enter" && !e.altKey)) {
      startEdit({ kind: "value", ...ref });
    } else if (e.key === "Delete") {
      requestRemove(ref);
    } else if (isMenuKey(e)) {
      setMenu({ ...ref, ...belowElement(e.currentTarget) });
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onValueContextMenu(ref: ValueRef, e: MouseEvent<HTMLLIElement>) {
    e.preventDefault();
    setMenu({ ...ref, ...(e.clientX === 0 && e.clientY === 0 ? belowElement(e.currentTarget) : { x: e.clientX, y: e.clientY }) });
  }

  function onDrop(level: number, index: number, e: DragEvent<HTMLLIElement>) {
    e.preventDefault();
    const from = dragging;
    setDragging(null);
    if (from && from.level === level) move(from, index);
  }

  if (confirmRemove) {
    const count = usersOf(confirmRemove);
    return (
      <Dialog
        key="confirm"
        open
        title={t("classificationDialog.removeInUse.title", { name: nameOf(confirmRemove) })}
        onClose={() => setConfirmRemove(null)}
        actions={
          <>
            <Button variant="elevated" data-autofocus onClick={() => setConfirmRemove(null)}>
              {t("classificationDialog.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmRemoval}>
              {t("classificationDialog.removeInUse.confirm")}
            </Button>
          </>
        }
      >
        {t("classificationDialog.removeInUse.body", { count })}
      </Dialog>
    );
  }

  return (
    <Dialog
      key="main"
      open
      title={t("classificationDialog.title")}
      onClose={onClose}
      className="w-[min(920px,100%)] gap-5 p-6"
      actions={
        <Button variant="filled" onClick={onClose}>
          {t("classificationDialog.done")}
        </Button>
      }
    >
      <div ref={bodyRef} className="grid grid-cols-3 gap-4 text-ink">
        {classification.map((level, li) => (
          <section key={level.id} className="flex min-h-[420px] flex-col gap-0.5 rounded-lg bg-parchment px-2 pt-3 pb-2 shadow-inset">
            <div className="mb-1.5 flex items-center gap-2 border-b border-rule-soft px-2 pt-1 pb-2.5">
              <span className="text-overline font-semibold tracking-[0.06em] text-ink-muted" aria-hidden="true">
                {li + 1}
              </span>
              {editing?.kind === "level" && editing.level === li ? (
                editInput(t("classificationDialog.levelName", { n: li + 1 }))
              ) : (
                <button
                  type="button"
                  data-level-name={li}
                  aria-label={t("classificationDialog.levelName", { n: li + 1 })}
                  className="min-w-0 flex-1 truncate rounded-sm text-left text-title font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  onClick={() => startEdit({ kind: "level", level: li })}
                >
                  {level.name}
                </button>
              )}
            </div>
            <ul aria-label={t("classificationDialog.values", { level: level.name })} className="flex flex-col gap-0.5">
              {level.values.map((v, vi) => {
                const ref = { level: li, id: v.id };
                if (editing?.kind === "value" && editing.level === li && editing.id === v.id) {
                  return (
                    <li key={v.id} className="flex flex-col">
                      {editInput(t("classificationDialog.valueName"))}
                    </li>
                  );
                }
                return (
                  <li
                    key={v.id}
                    tabIndex={0}
                    data-value-id={v.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(ref);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => {
                      if (dragging?.level === li) e.preventDefault();
                    }}
                    onDrop={(e) => onDrop(li, vi, e)}
                    onDoubleClick={() => startEdit({ kind: "value", ...ref })}
                    onContextMenu={(e) => onValueContextMenu(ref, e)}
                    onKeyDown={(e) => onValueKeyDown(ref, vi, e)}
                    className={[
                      "group flex cursor-default items-center gap-2 rounded-sm px-2 py-[7px] text-body outline-none hover:bg-ink-wash focus-visible:ring-2 focus-visible:ring-focus",
                      dragging?.id === v.id ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <GripVertical
                      aria-hidden="true"
                      className="h-4 w-4 flex-none cursor-grab text-ink-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  </li>
                );
              })}
            </ul>
            {editing?.kind === "add" && editing.level === li && editInput(t("classificationDialog.newValue"))}
            <div className="flex-1" />
            <Button
              data-add={li}
              className="self-start text-ink-soft"
              size="sm"
              icon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => startEdit({ kind: "add", level: li })}
            >
              {t("classificationDialog.add")}
            </Button>
          </section>
        ))}
        {menu && (
          <MenuSurface
            aria-label={t("classificationDialog.valueMenu")}
            className="fixed z-[130]"
            style={{ left: menu.x, top: menu.y }}
            onClose={(reason) => {
              setMenu(null);
              if (reason === "escape") focusValue(menu.id);
            }}
          >
            <MenuItem label={t("classificationDialog.rename")} onSelect={() => startEdit({ kind: "value", level: menu.level, id: menu.id })} />
            <MenuItem label={t("classificationDialog.remove")} onSelect={() => requestRemove({ level: menu.level, id: menu.id })} />
          </MenuSurface>
        )}
      </div>
    </Dialog>
  );
}
