// src/renderer/components/sources/SourceDialog.tsx
//
// Diálogo Fonte: edita a fonte ao vivo (cada campo é um passo de desfazer por
// fonte e campo). A sigla é o título editável; os três níveis de classificação
// escolhem um valor ou criam um novo, que vai também à biblioteca do usuário.
// Campos sem lugar aqui (Cantus ID, IIIF, folioHint) passam intactos.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Input } from "../../ui/Field";
import { mergeClassification } from "@shared/classification";
import type { Classification, SourceClasses } from "@shared/project-schema";
import type { ManuscriptSource } from "../../lib/models";

export interface SourceDialogProps {
  sourceId: string;
  onClose(): void;
}

type TextField = "siglum" | "library" | "city" | "century";

const NEW_VALUE = "__new__";

/** A biblioteca do usuário recebe o valor criado aqui, sem avisar (falha é silenciosa). */
function addToLibrary(project: Classification) {
  void window.mocquereau
    .getClassification()
    .then((lib) => window.mocquereau.setClassification(mergeClassification(lib, project)))
    .catch(() => {});
}

export function SourceDialog({ sourceId, onClose }: SourceDialogProps) {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const source = project?.sources.find((s) => s.id === sourceId) ?? null;
  const [confirming, setConfirming] = useState(false);
  const [creatingLevel, setCreatingLevel] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  // Nível com o campo "Novo valor" aberto; o ref evita gravar duas vezes
  // (Enter e o blur que a remoção do campo pode disparar).
  const pendingLevel = useRef<number | null>(null);
  const focusLevel = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (creatingLevel !== null || focusLevel.current === null) return;
    bodyRef.current?.querySelector<HTMLElement>(`[data-level="${focusLevel.current}"]`)?.focus();
    focusLevel.current = null;
  }, [creatingLevel]);

  if (!project || !source) return null;
  const classification = project.classification;

  function update(next: ManuscriptSource, field: string) {
    dispatch({ type: "UPDATE_SOURCE", payload: next, field });
  }

  function setText(field: TextField, value: string) {
    update({ ...source!, metadata: { ...source!.metadata, [field]: value } }, field);
  }

  function setLink(value: string) {
    const { sourceUrl: _drop, ...rest } = source!.metadata;
    update({ ...source!, metadata: value.trim() === "" ? rest : { ...rest, sourceUrl: value } }, "sourceUrl");
  }

  function setClass(level: number, id: string | null) {
    const classes = [...source!.metadata.classes] as SourceClasses;
    classes[level] = id;
    update({ ...source!, metadata: { ...source!.metadata, classes } }, `classes.${level}`);
  }

  function startNewValue(level: number) {
    pendingLevel.current = level;
    setCreatingLevel(level);
    setNewName("");
  }

  function closeNewValue() {
    focusLevel.current = pendingLevel.current;
    pendingLevel.current = null;
    setCreatingLevel(null);
  }

  function commitNewValue() {
    const level = pendingLevel.current;
    const name = newName.trim();
    closeNewValue();
    if (level === null || name === "") return;
    const value = { id: crypto.randomUUID(), name };
    const next = classification.map((l, i) =>
      i === level ? { ...l, values: [...l.values, value] } : l,
    ) as Classification;
    // Valor novo e a escolha dele: um passo de desfazer.
    const coalesceKey = `NEW_CLASS_VALUE:${value.id}`;
    dispatch({ type: "SET_CLASSIFICATION", payload: next, meta: { coalesceKey } });
    const classes = [...source!.metadata.classes] as SourceClasses;
    classes[level] = value.id;
    dispatch({
      type: "UPDATE_SOURCE",
      payload: { ...source!, metadata: { ...source!.metadata, classes } },
      meta: { coalesceKey },
    });
    addToLibrary(next);
  }

  function onNewValueKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitNewValue();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeNewValue();
    }
  }

  function deleteSource() {
    dispatch({ type: "REMOVE_SOURCE", payload: sourceId });
    onClose();
  }

  // Diálogos não se empilham (cada um prende o foco): a confirmação toma o lugar.
  if (confirming) {
    return (
      <Dialog
        key="confirm"
        open
        title={t("sourceTree.deleteSource.title")}
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="elevated" data-autofocus onClick={() => setConfirming(false)}>
              {t("sourceTree.cancel")}
            </Button>
            <Button variant="danger" onClick={deleteSource}>
              {t("sourceTree.deleteSource.confirm")}
            </Button>
          </>
        }
      >
        {t("sourceTree.deleteSource.body")}
      </Dialog>
    );
  }

  const md = source.metadata;
  return (
    <Dialog
      key="main"
      open
      title={t("sourceDialog.title")}
      onClose={onClose}
      onConfirm={onClose}
      className="w-[min(560px,100%)] gap-[18px] p-6"
      header={
        <div className="flex items-center gap-2">
          <input
            data-autofocus
            aria-label={t("sourceDialog.siglum")}
            placeholder={t("sourceDialog.siglum")}
            value={md.siglum}
            onChange={(e) => setText("siglum", e.target.value)}
            className="-mx-2 h-10 min-w-0 flex-1 rounded-md bg-transparent px-2 font-serif text-title-lg font-semibold text-ink outline-none placeholder:text-ink-muted hover:bg-ink-wash focus:bg-ink-wash"
          />
          <IconButton label={t("sourceDialog.close")} icon={<X aria-hidden="true" />} onClick={onClose} />
        </div>
      }
    >
      <div ref={bodyRef} className="flex flex-col gap-[18px] text-ink">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Input
            className="col-span-2"
            label={t("sourceDialog.library")}
            value={md.library}
            onChange={(e) => setText("library", e.target.value)}
          />
          <Input label={t("sourceDialog.city")} value={md.city} onChange={(e) => setText("city", e.target.value)} />
          <Input label={t("sourceDialog.date")} value={md.century} onChange={(e) => setText("century", e.target.value)} />
          <Input
            className="col-span-2"
            label={t("sourceDialog.link")}
            placeholder="https://"
            value={md.sourceUrl ?? ""}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>

        <div className="h-px bg-rule-soft" />

        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5">
          {classification.map((level, i) => (
            <ClassRow
              key={level.id}
              level={i}
              name={level.name}
              values={level.values}
              selected={md.classes[i]}
              creating={creatingLevel === i}
              newName={newName}
              newValueLabel={t("sourceDialog.newValue")}
              newValueInputLabel={t("sourceDialog.newValueLabel", { level: level.name })}
              onSelect={(id) => (id === NEW_VALUE ? startNewValue(i) : setClass(i, id || null))}
              onNewNameChange={setNewName}
              onNewNameKeyDown={onNewValueKeyDown}
              onNewNameBlur={commitNewValue}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t("sourceDialog.delete")}
          </Button>
          <Button variant="filled" onClick={onClose}>
            {t("sourceDialog.done")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface ClassRowProps {
  level: number;
  name: string;
  values: { id: string; name: string }[];
  selected: string | null;
  creating: boolean;
  newName: string;
  newValueLabel: string;
  newValueInputLabel: string;
  onSelect(id: string): void;
  onNewNameChange(v: string): void;
  onNewNameKeyDown(e: KeyboardEvent<HTMLInputElement>): void;
  onNewNameBlur(): void;
}

function ClassRow(p: ClassRowProps) {
  // Valor que não está mais na classificação: mostra vazio, sem regravar a fonte.
  const known = p.selected !== null && p.values.some((v) => v.id === p.selected);
  return (
    <label className="contents">
      <span className="text-caption font-medium text-ink-soft">{p.name}</span>
      {p.creating ? (
        <input
          autoFocus
          className="sc-input"
          aria-label={p.newValueInputLabel}
          placeholder={p.newValueLabel}
          value={p.newName}
          onChange={(e) => p.onNewNameChange(e.target.value)}
          onKeyDown={p.onNewNameKeyDown}
          onBlur={p.onNewNameBlur}
        />
      ) : (
        <select data-level={p.level} className="sc-select" value={known ? p.selected! : ""} onChange={(e) => p.onSelect(e.target.value)}>
          <option value="">—</option>
          {p.values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <hr />
          <option value={NEW_VALUE}>{p.newValueLabel}</option>
        </select>
      )}
    </label>
  );
}
