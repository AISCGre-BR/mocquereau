// src/renderer/components/annotation/VocabularyDialog.tsx
//
// Diálogo Vocabulário de neumas (Arquivo > Vocabulário de neumas…): categorias e
// tipos de neuma com equivalências, e as letras significativas. Abrir não grava
// nada: o vocabulário padrão só entra no projeto na primeira alteração. Não há
// exclusão (só ocultar), para não deixar anotações órfãs.

import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { MoreVertical, Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import type { HistoryMeta } from "../../history/history";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { MenuItem, MenuSubmenu, MenuSurface } from "../../ui/Menu";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { categoryLabel } from "@shared/annotation/default-vocabulary";
import { belowElement } from "../texto/SyllableText";
import {
  fold as foldName,
  getVocabulary,
  isCategorized,
  restoreDefaults,
  resolveEquivalent,
} from "@shared/annotation/vocabulary";
import type { NeumeCategory, NeumeKind, NeumeVocabulary, SignificantLetter } from "@shared/annotation/types";

export interface VocabularyDialogProps {
  onClose(): void;
}

type Tab = "neumes" | "letters";
type Target = "category" | "kind" | "letter";
/** `id: null`: a new item, created when the edit is confirmed. */
type Editing = { target: Target; id: string | null };
type Menu = { target: Target; id: string; x: number; y: number };

const fold = (s: string) => foldName(s).trim();

/** Selection key of the "No category" entry (kinds without a category, or of a missing one). */
const NO_CATEGORY = ":none";

const INPUT_CLASS =
  "h-8 min-w-0 rounded-sm bg-surface px-2.5 text-body text-ink shadow-inset outline-none ring-2 ring-rubric aria-invalid:ring-danger";

/** Copies `item` applying `patch`; keys patched to undefined are removed. */
function patched<T extends object>(item: T, patch: Partial<Record<keyof T, unknown>>): T {
  const out = { ...item } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  return out as T;
}

function swap<T>(list: T[], a: number, b: number): T[] {
  if (a < 0 || b < 0 || a >= list.length || b >= list.length) return list;
  const out = [...list];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

export function VocabularyDialog({ onClose }: VocabularyDialogProps) {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const [tab, setTab] = useState<Tab>("neumes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listId = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [equivalent, setEquivalent] = useState("");
  const [abbr, setAbbr] = useState("");
  const [meaning, setMeaning] = useState("");
  // O campo aberto, para Enter e o blur da remoção do campo não gravarem duas vezes.
  const editingRef = useRef<Editing | null>(null);

  if (!project) return null;
  const translate = (key: string) => t(key);
  const vocab = getVocabulary(project, translate);
  const categoryIds = new Set(vocab.categories.map((c) => c.id));
  // undefined = "No category" (chosen, or no category exists at all).
  const selected = selectedId === NO_CATEGORY ? undefined : (vocab.categories.find((c) => c.id === selectedId) ?? vocab.categories[0]);
  /** Group of a kind in the category column: its category id, or NO_CATEGORY. */
  const groupOf = (k: NeumeKind) => (isCategorized(k, categoryIds) ? k.categoryId! : NO_CATEGORY);

  function commit(next: NeumeVocabulary, coalesce?: string) {
    const meta: HistoryMeta = { coalesceKey: coalesce };
    dispatch({ type: "SET_NEUME_VOCABULARY", payload: next, meta });
  }

  const patchCategory = (id: string, patch: Partial<NeumeCategory>, key?: string) =>
    commit({ ...vocab, categories: vocab.categories.map((c) => (c.id === id ? patched(c, patch) : c)) }, key);
  const patchKind = (id: string, patch: Partial<NeumeKind>, key?: string) =>
    commit({ ...vocab, kinds: vocab.kinds.map((k) => (k.id === id ? patched(k, patch) : k)) }, key);
  const patchLetter = (id: string, patch: Partial<SignificantLetter>, key?: string) =>
    commit({ ...vocab, letters: vocab.letters.map((l) => (l.id === id ? patched(l, patch) : l)) }, key);

  // ── Equivalência ──────────────────────────────────────────────────────────

  /** `ok: false`: unknown name, the item itself or a cycle. Empty text clears it. */
  function checkEquivalent(kindId: string | null, text: string): { ok: boolean; id?: string } {
    const typed = fold(text);
    if (typed === "") return { ok: true };
    const target = vocab.kinds.find((k) => fold(k.name) === typed);
    if (!target || target.id === kindId) return { ok: false };
    if (kindId) {
      const trial = { ...vocab, kinds: vocab.kinds.map((k) => (k.id === kindId ? { ...k, equivalentTo: target.id } : k)) };
      // A chain that ends on an item that still points somewhere was cut as a cycle.
      const root = resolveEquivalent(trial, kindId);
      if (trial.kinds.find((k) => k.id === root)?.equivalentTo) return { ok: false };
    }
    return { ok: true, id: target.id };
  }

  /** Nothing is presumed: name must be unique; notes optional, but an integer >= 1 when typed. */
  function kindProblems(kindId: string | null) {
    const typed = fold(name);
    const notesOk = notes.trim() === "" || (/^\d+$/.test(notes.trim()) && Number.parseInt(notes, 10) >= 1);
    return {
      name: typed === "" || vocab.kinds.some((k) => k.id !== kindId && fold(k.name) === typed),
      notes: !notesOk,
      equivalent: !checkEquivalent(kindId, equivalent).ok,
    };
  }

  // ── Edição em linha ───────────────────────────────────────────────────────

  function start(next: Editing) {
    setMenu(null);
    editingRef.current = next;
    setEditing(next);
    const kind = next.target === "kind" ? vocab.kinds.find((k) => k.id === next.id) : undefined;
    const letter = next.target === "letter" ? vocab.letters.find((l) => l.id === next.id) : undefined;
    const category = next.target === "category" ? vocab.categories.find((c) => c.id === next.id) : undefined;
    setName(kind?.name ?? (category ? categoryLabel(category, t) : ""));
    setNotes(kind?.defaultNotes !== undefined ? String(kind.defaultNotes) : "");
    setEquivalent(kind?.equivalentTo ? (vocab.kinds.find((k) => k.id === kind.equivalentTo)?.name ?? "") : "");
    setAbbr(letter?.abbr ?? "");
    setMeaning(letter?.meaning ?? "");
  }

  function stop() {
    editingRef.current = null;
    setEditing(null);
  }

  /** Returns false when it kept the edit open (invalid equivalence on Enter). */
  function finish(save: boolean, byBlur = false): boolean {
    const current = editingRef.current;
    if (!current) return true;
    if (!save) {
      stop();
      return true;
    }
    if (current.target === "category") {
      stop();
      const next = name.trim();
      if (!next) return true;
      if (current.id === null) {
        const added: NeumeCategory = { id: `cat.${crypto.randomUUID()}`, name: next };
        commit({ ...vocab, categories: [...vocab.categories, added] });
        setSelectedId(added.id);
      } else if (next !== categoryLabel(vocab.categories.find((c) => c.id === current.id) ?? { id: "" }, t)) {
        patchCategory(current.id, { name: next }, `VOCAB:${current.id}:name`);
      }
      return true;
    }
    if (current.target === "letter") {
      stop();
      const a = abbr.trim();
      const m = meaning.trim();
      if (current.id === null) {
        if (a) commit({ ...vocab, letters: [...vocab.letters, { id: `letter.${crypto.randomUUID()}`, abbr: a, meaning: m }] });
        return true;
      }
      const letter = vocab.letters.find((l) => l.id === current.id);
      if (!letter) return true;
      let next = vocab;
      if (a && a !== letter.abbr) {
        next = { ...next, letters: next.letters.map((l) => (l.id === letter.id ? { ...l, abbr: a } : l)) };
        commit(next, `VOCAB:${letter.id}:abbr`);
      }
      if (m !== letter.meaning) {
        next = { ...next, letters: next.letters.map((l) => (l.id === letter.id ? { ...l, meaning: m } : l)) };
        commit(next, `VOCAB:${letter.id}:meaning`);
      }
      return true;
    }
    // kind
    const problems = kindProblems(current.id);
    if (problems.name || problems.notes || problems.equivalent) {
      if (!byBlur) return false;
      stop();
      return true;
    }
    const check = checkEquivalent(current.id, equivalent);
    stop();
    const typedName = name.trim();
    const parsed = notes.trim() === "" ? undefined : Number.parseInt(notes, 10);
    if (current.id === null) {
      const added: NeumeKind = {
        id: `kind.${crypto.randomUUID()}`,
        ...(selected ? { categoryId: selected.id } : {}),
        name: typedName,
        ...(parsed !== undefined ? { defaultNotes: parsed } : {}),
        ...(check.id ? { equivalentTo: check.id } : {}),
      };
      commit({ ...vocab, kinds: [...vocab.kinds, added] });
      return true;
    }
    const kind = vocab.kinds.find((k) => k.id === current.id);
    if (!kind) return true;
    let next = vocab;
    const apply = (patch: Partial<NeumeKind>, field: string) => {
      next = { ...next, kinds: next.kinds.map((k) => (k.id === kind.id ? patched(k, patch) : k)) };
      commit(next, `VOCAB:${kind.id}:${field}`);
    };
    if (typedName !== kind.name) apply({ name: typedName }, "name");
    if (parsed !== kind.defaultNotes) apply({ defaultNotes: parsed }, "notes");
    if (check.id !== kind.equivalentTo) apply({ equivalentTo: check.id }, "equivalent");
    return true;
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    finish(e.key === "Enter");
  }

  // O foco passa de um campo a outro da mesma linha: só sair dela grava.
  function onRowBlur(e: FocusEvent<HTMLElement>) {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    finish(true, true);
  }

  // ── Ações dos menus ───────────────────────────────────────────────────────

  function toggleHidden(target: Target, id: string) {
    const item =
      target === "category"
        ? vocab.categories.find((c) => c.id === id)
        : target === "kind"
          ? vocab.kinds.find((k) => k.id === id)
          : vocab.letters.find((l) => l.id === id);
    const hidden = item?.hidden ? undefined : true;
    if (target === "category") patchCategory(id, { hidden });
    else if (target === "kind") patchKind(id, { hidden });
    else patchLetter(id, { hidden });
  }

  function moveCategory(id: string, delta: number) {
    const i = vocab.categories.findIndex((c) => c.id === id);
    commit({ ...vocab, categories: swap(vocab.categories, i, i + delta) });
  }

  function moveKind(id: string, delta: number) {
    const kind = vocab.kinds.find((k) => k.id === id);
    if (!kind) return;
    const peers = vocab.kinds.filter((k) => groupOf(k) === groupOf(kind));
    const neighbour = peers[peers.indexOf(kind) + delta];
    if (!neighbour) return;
    commit({ ...vocab, kinds: swap(vocab.kinds, vocab.kinds.indexOf(kind), vocab.kinds.indexOf(neighbour)) });
  }

  function restore() {
    const next = restoreDefaults(vocab, translate);
    const same =
      next.categories.length === vocab.categories.length &&
      next.kinds.length === vocab.kinds.length &&
      next.letters.length === vocab.letters.length;
    if (!same) commit(next);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hiddenSuffix = (hidden?: boolean) =>
    hidden ? <span className="ml-1 text-ink-muted not-italic">({t("vocabularyDialog.hidden")})</span> : null;
  const openMenu = (target: Target, id: string, el: Element) => setMenu({ target, id, ...belowElement(el) });
  const menuButton = (target: Target, id: string) => (
    <IconButton
      label={t("vocabularyDialog.menuLabel")}
      icon={<MoreVertical aria-hidden="true" className="h-4 w-4" />}
      onClick={(e) => openMenu(target, id, e.currentTarget)}
    />
  );
  const isEditing = (target: Target, id: string | null) => editing?.target === target && editing.id === id;

  const categoryInput = (
    <input
      autoFocus
      aria-label={t("vocabularyDialog.category")}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={onEditKeyDown}
      onBlur={() => finish(true, true)}
      className={`${INPUT_CLASS} w-full`}
    />
  );

  function kindEditRow(id: string | null) {
    const problems = kindProblems(id);
    return (
      <tr key={id ?? "new"} onBlur={onRowBlur} className="align-middle">
        <td className="px-2 py-1">
          <input
            autoFocus
            aria-label={t("vocabularyDialog.name")}
            aria-invalid={problems.name || undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEditKeyDown}
            className={`${INPUT_CLASS} w-full font-serif`}
          />
        </td>
        <td className="px-2 py-1">
          <input
            type="number"
            min={1}
            aria-label={t("vocabularyDialog.notes")}
            aria-invalid={problems.notes || undefined}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={onEditKeyDown}
            className={`${INPUT_CLASS} w-16`}
          />
        </td>
        <td className="px-2 py-1">
          <input
            list={listId}
            aria-label={t("vocabularyDialog.equivalentTo")}
            aria-invalid={problems.equivalent || undefined}
            value={equivalent}
            onChange={(e) => setEquivalent(e.target.value)}
            onKeyDown={onEditKeyDown}
            className={`${INPUT_CLASS} w-full`}
          />
        </td>
        <td />
      </tr>
    );
  }

  function letterEditRow(id: string | null) {
    return (
      <tr key={id ?? "new"} onBlur={onRowBlur} className="align-middle">
        <td className="px-2 py-1">
          <input
            autoFocus
            aria-label={t("vocabularyDialog.abbr")}
            value={abbr}
            onChange={(e) => setAbbr(e.target.value)}
            onKeyDown={onEditKeyDown}
            className={`${INPUT_CLASS} w-24`}
          />
        </td>
        <td className="px-2 py-1">
          <input
            aria-label={t("vocabularyDialog.meaning")}
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            onKeyDown={onEditKeyDown}
            className={`${INPUT_CLASS} w-full`}
          />
        </td>
        <td />
      </tr>
    );
  }

  const selectedGroup = selected?.id ?? NO_CATEGORY;
  const kindsOfSelected = vocab.kinds.filter((k) => groupOf(k) === selectedGroup);
  const nameOfKind = (id?: string) => (id ? (vocab.kinds.find((k) => k.id === id)?.name ?? "") : "");
  const menuKind = menu?.target === "kind" ? vocab.kinds.find((k) => k.id === menu.id) : undefined;
  const menuCategory = menu?.target === "category" ? vocab.categories.find((c) => c.id === menu.id) : undefined;
  const menuLetter = menu?.target === "letter" ? vocab.letters.find((l) => l.id === menu.id) : undefined;
  const menuItem = menuKind ?? menuCategory ?? menuLetter;
  const headerClass = "px-2 py-1 text-left text-label font-normal text-ink-muted";

  return (
    <Dialog
      open
      title={t("vocabularyDialog.title")}
      onClose={onClose}
      className="flex w-[min(820px,100%)] h-[min(640px,90vh)] flex-col gap-4 p-6 [&_.sc-dialog\_\_body]:min-h-0 [&_.sc-dialog\_\_body]:flex-1"
      header={
        <div className="flex items-center justify-between gap-3">
          <h2 className="sc-dialog__title">{t("vocabularyDialog.title")}</h2>
          <SegmentedControl<Tab>
            aria-label={t("vocabularyDialog.title")}
            value={tab}
            onChange={(v) => {
              stop();
              setMenu(null);
              setTab(v);
            }}
            options={[
              { value: "neumes", label: t("vocabularyDialog.tab.neumes") },
              { value: "letters", label: t("vocabularyDialog.tab.letters") },
            ]}
          />
        </div>
      }
      actions={
        <>
          <Button variant="elevated" className="mr-auto" onClick={restore}>
            {t("vocabularyDialog.restore")}
          </Button>
          <Button variant="filled" onClick={onClose}>
            {t("vocabularyDialog.done")}
          </Button>
        </>
      }
    >
      <div className="relative flex h-full min-h-0 gap-4 text-ink">
        {tab === "neumes" ? (
          <>
            <nav className="flex w-[240px] flex-none flex-col gap-0.5 overflow-y-auto rounded-lg bg-parchment p-2 shadow-inset">
              <ul aria-label={t("vocabularyDialog.categories")} className="flex flex-col gap-0.5">
                {vocab.categories.map((c) =>
                  isEditing("category", c.id) ? (
                    <li key={c.id}>{categoryInput}</li>
                  ) : (
                    <li key={c.id} className="group flex items-center rounded-sm hover:bg-ink-wash">
                      <button
                        type="button"
                        aria-current={selected?.id === c.id ? "true" : undefined}
                        onClick={() => setSelectedId(c.id)}
                        onDoubleClick={() => start({ target: "category", id: c.id })}
                        onKeyDown={(e) => {
                          if (e.key !== "F2") return;
                          e.preventDefault();
                          e.stopPropagation();
                          start({ target: "category", id: c.id });
                        }}
                        className={[
                          "min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-focus",
                          selected?.id === c.id ? "bg-rubric-wash text-rubric" : "",
                          c.hidden ? "italic text-ink-muted" : "",
                        ].join(" ")}
                      >
                        {categoryLabel(c, t)}
                        {hiddenSuffix(c.hidden)}
                      </button>
                      {menuButton("category", c.id)}
                    </li>
                  ),
                )}
                <li className="flex items-center rounded-sm hover:bg-ink-wash">
                  <button
                    type="button"
                    aria-current={selectedGroup === NO_CATEGORY ? "true" : undefined}
                    onClick={() => setSelectedId(NO_CATEGORY)}
                    className={[
                      "min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-focus",
                      selectedGroup === NO_CATEGORY ? "bg-rubric-wash text-rubric" : "text-ink-soft",
                    ].join(" ")}
                  >
                    {t("annotation.noCategory")}
                  </button>
                </li>
              </ul>
              {isEditing("category", null) && categoryInput}
              <Button
                size="sm"
                className="self-start text-ink-soft"
                icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                onClick={() => start({ target: "category", id: null })}
              >
                {t("vocabularyDialog.category")}
              </Button>
            </nav>
            <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
              <table className="w-full border-collapse text-body">
                <thead>
                  <tr>
                    <th className={headerClass}>{t("vocabularyDialog.name")}</th>
                    <th className={`${headerClass} w-20`}>{t("vocabularyDialog.notes")}</th>
                    <th className={headerClass}>{t("vocabularyDialog.equivalentTo")}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {kindsOfSelected.map((k) =>
                    isEditing("kind", k.id) ? (
                      kindEditRow(k.id)
                    ) : (
                      <tr
                        key={k.id}
                        className="group align-middle hover:bg-ink-wash"
                        onDoubleClick={() => start({ target: "kind", id: k.id })}
                      >
                        <td className="px-2 py-1">
                          <span
                            data-kind-name
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key !== "F2" && e.key !== "Enter") return;
                              e.preventDefault();
                              e.stopPropagation();
                              start({ target: "kind", id: k.id });
                            }}
                            className={[
                              "rounded-sm font-serif outline-none focus-visible:ring-2 focus-visible:ring-focus",
                              k.hidden ? "italic text-ink-muted" : "",
                            ].join(" ")}
                          >
                            {k.name}
                          </span>
                          {hiddenSuffix(k.hidden)}
                        </td>
                        <td className="px-2 py-1">{k.defaultNotes ?? ""}</td>
                        <td className="px-2 py-1 font-serif text-ink-soft">{nameOfKind(k.equivalentTo)}</td>
                        <td className="px-1 py-0.5">{menuButton("kind", k.id)}</td>
                      </tr>
                    ),
                  )}
                  {isEditing("kind", null) && kindEditRow(null)}
                </tbody>
              </table>
              <datalist id={listId}>
                {vocab.kinds
                  .filter((k) => k.id !== editing?.id)
                  .map((k) => (
                    <option key={k.id} value={k.name} />
                  ))}
              </datalist>
              <Button
                size="sm"
                className="self-start text-ink-soft"
                icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                onClick={() => start({ target: "kind", id: null })}
              >
                {t("vocabularyDialog.neume")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr>
                  <th className={`${headerClass} w-32`}>{t("vocabularyDialog.abbr")}</th>
                  <th className={headerClass}>{t("vocabularyDialog.meaning")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {vocab.letters.map((l) =>
                  isEditing("letter", l.id) ? (
                    letterEditRow(l.id)
                  ) : (
                    <tr
                      key={l.id}
                      className="group align-middle hover:bg-ink-wash"
                      onDoubleClick={() => start({ target: "letter", id: l.id })}
                    >
                      <td className="px-2 py-1">
                        <span
                          data-letter-abbr
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key !== "F2" && e.key !== "Enter") return;
                            e.preventDefault();
                            e.stopPropagation();
                            start({ target: "letter", id: l.id });
                          }}
                          className={[
                            "rounded-sm font-serif outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            l.hidden ? "italic text-ink-muted" : "",
                          ].join(" ")}
                        >
                          {l.abbr}
                        </span>
                        {hiddenSuffix(l.hidden)}
                      </td>
                      <td className={["px-2 py-1 font-serif", l.hidden ? "italic text-ink-muted" : ""].join(" ")}>{l.meaning}</td>
                      <td className="px-1 py-0.5">{menuButton("letter", l.id)}</td>
                    </tr>
                  ),
                )}
                {isEditing("letter", null) && letterEditRow(null)}
              </tbody>
            </table>
            <Button
              size="sm"
              className="self-start text-ink-soft"
              icon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => start({ target: "letter", id: null })}
            >
              {t("vocabularyDialog.letter")}
            </Button>
          </div>
        )}
        {menu && menuItem && (
          <MenuSurface
            aria-label={t("vocabularyDialog.menuLabel")}
            className="fixed z-[130]"
            style={{ left: menu.x, top: menu.y }}
            onClose={() => setMenu(null)}
          >
            {menu.target === "category" && (
              <MenuItem label={t("vocabularyDialog.rename")} onSelect={() => start({ target: "category", id: menu.id })} />
            )}
            <MenuItem
              label={menuItem.hidden ? t("vocabularyDialog.show") : t("vocabularyDialog.hide")}
              onSelect={() => toggleHidden(menu.target, menu.id)}
            />
            {menu.target === "category" && (
              <>
                <MenuItem label={t("vocabularyDialog.moveUp")} onSelect={() => moveCategory(menu.id, -1)} />
                <MenuItem label={t("vocabularyDialog.moveDown")} onSelect={() => moveCategory(menu.id, 1)} />
              </>
            )}
            {menuKind && (
              <>
                <MenuItem label={t("vocabularyDialog.moveUp")} onSelect={() => moveKind(menuKind.id, -1)} />
                <MenuItem label={t("vocabularyDialog.moveDown")} onSelect={() => moveKind(menuKind.id, 1)} />
                <MenuSubmenu
                  label={t("vocabularyDialog.moveTo")}
                  disabled={vocab.categories.filter((c) => c.id !== groupOf(menuKind)).length === 0 && groupOf(menuKind) === NO_CATEGORY}
                >
                  {vocab.categories
                    .filter((c) => c.id !== groupOf(menuKind))
                    .map((c) => (
                      <MenuItem key={c.id} label={categoryLabel(c, t)} onSelect={() => patchKind(menuKind.id, { categoryId: c.id })} />
                    ))}
                  {groupOf(menuKind) !== NO_CATEGORY && (
                    <MenuItem
                      label={t("annotation.noCategory")}
                      onSelect={() => patchKind(menuKind.id, { categoryId: undefined })}
                    />
                  )}
                </MenuSubmenu>
              </>
            )}
          </MenuSurface>
        )}
      </div>
    </Dialog>
  );
}
