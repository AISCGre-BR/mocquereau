// src/renderer/components/annotation/TagsDialog.tsx
//
// Diálogo Etiquetas (Arquivo > Etiquetas…): lista agrupada, edição em linha de
// nome e grupo, descrição, juntar e excluir. Juntar e excluir mexem nas anotações
// e vão ao projeto numa só entrada de desfazer (REPLACE_PROJECT).

import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { MoreVertical } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { MenuItem, MenuSubmenu, MenuSurface } from "../../ui/Menu";
import { belowElement } from "../texto/SyllableText";
import { findTagByName, mergeTags, newTag, removeTagEverywhere } from "@shared/annotation/tags";
import type { Tag } from "@shared/annotation/types";

export interface TagsDialogProps {
  onClose(): void;
}

type Editing = { id: string; field: "row" | "description" };
type Menu = { id: string; x: number; y: number };

const INPUT_CLASS =
  "h-8 min-w-0 rounded-sm bg-surface px-2.5 text-body text-ink shadow-inset outline-none ring-2 ring-rubric";

export function TagsDialog({ onClose }: TagsDialogProps) {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [description, setDescription] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [fresh, setFresh] = useState("");
  // O campo aberto, para Enter e o blur da remoção do campo não gravarem duas vezes.
  const editingRef = useRef<Editing | null>(null);

  if (!project) return null;
  const tags = project.tags ?? [];
  const tagById = (id: string) => tags.find((x) => x.id === id);

  function usesOf(id: string): number {
    let count = 0;
    for (const source of project!.sources) {
      for (const ann of Object.values(source.annotations ?? {})) {
        if (ann.tags.includes(id) || ann.neumes.some((n) => n.tags?.includes(id))) count++;
      }
    }
    return count;
  }

  function setTags(next: Tag[], id: string, field: string) {
    dispatch({ type: "SET_TAGS", payload: next, meta: { coalesceKey: `TAGS:${id}:${field}` } });
  }

  // ── Edição em linha ───────────────────────────────────────────────────────

  function start(id: string, field: Editing["field"]) {
    const tag = tagById(id);
    if (!tag) return;
    setMenu(null);
    const next = { id, field };
    editingRef.current = next;
    setEditing(next);
    setName(tag.name);
    setGroup(tag.group ?? "");
    setDescription(tag.description ?? "");
  }

  function finish(save: boolean) {
    const current = editingRef.current;
    if (!current) return;
    editingRef.current = null;
    setEditing(null);
    const tag = tagById(current.id);
    if (!save || !tag) return;
    if (current.field === "description") {
      const next = description.trim();
      if (next === (tag.description ?? "")) return;
      const { description: _old, ...rest } = tag;
      const updated: Tag = next ? { ...rest, description: next } : rest;
      setTags(tags.map((x) => (x.id === tag.id ? updated : x)), tag.id, "description");
      return;
    }
    const nextName = name.trim();
    const clash = findTagByName(tags, nextName);
    if (!nextName || (clash && clash.id !== tag.id)) return;
    const nextGroup = group.trim();
    let list = tags;
    if (nextName !== tag.name) {
      list = list.map((x) => (x.id === tag.id ? { ...x, name: nextName } : x));
      setTags(list, tag.id, "name");
    }
    if (nextGroup !== (tag.group ?? "")) {
      list = list.map((x) => {
        if (x.id !== tag.id) return x;
        const { group: _old, ...rest } = x;
        return nextGroup ? { ...rest, group: nextGroup } : rest;
      });
      setTags(list, tag.id, "group");
    }
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape" || (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement))) {
      e.preventDefault();
      e.stopPropagation();
      finish(e.key === "Enter");
    }
  }

  // O foco passa do nome ao grupo dentro da mesma linha: só sair dela grava.
  function onRowBlur(e: FocusEvent<HTMLElement>) {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    finish(true);
  }

  // ── Criar, juntar, excluir ────────────────────────────────────────────────

  function create() {
    const next = fresh.trim();
    if (!next || findTagByName(tags, next)) return;
    setFresh("");
    dispatch({ type: "SET_TAGS", payload: [...tags, newTag(next)] });
  }

  function merge(fromId: string, intoId: string) {
    // Só destinos existentes e diferentes da origem (mergeTags não confere).
    if (fromId === intoId || !tagById(intoId) || !tagById(fromId)) return;
    dispatch({ type: "REPLACE_PROJECT", payload: mergeTags(project!, fromId, intoId) });
  }

  function remove(id: string) {
    dispatch({ type: "REPLACE_PROJECT", payload: removeTagEverywhere(project!, id) });
  }

  function requestRemove(id: string) {
    setMenu(null);
    if (usesOf(id) > 0) setConfirmRemove(id);
    else remove(id);
  }

  function onContextMenu(id: string, e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    setMenu({ id, ...(e.clientX === 0 && e.clientY === 0 ? belowElement(e.currentTarget) : { x: e.clientX, y: e.clientY }) });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (confirmRemove) {
    const tag = tagById(confirmRemove);
    if (!tag) {
      setConfirmRemove(null);
      return null;
    }
    return (
      <Dialog
        key="confirm"
        open
        title={t("tagsDialog.removeInUse.title", { name: tag.name })}
        onClose={() => setConfirmRemove(null)}
        actions={
          <>
            <Button variant="elevated" data-autofocus onClick={() => setConfirmRemove(null)}>
              {t("tagsDialog.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = confirmRemove;
                setConfirmRemove(null);
                remove(id);
              }}
            >
              {t("tagsDialog.confirmRemove")}
            </Button>
          </>
        }
      >
        {t("tagsDialog.removeInUse.body", { count: usesOf(tag.id) })}
      </Dialog>
    );
  }

  const noGroup = t("tagsDialog.noGroup");
  const groups = new Map<string, Tag[]>();
  for (const tag of tags) {
    const key = tag.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), tag]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const menuTag = menu ? tagById(menu.id) : undefined;

  return (
    <Dialog
      key="main"
      open
      title={t("tagsDialog.title")}
      onClose={onClose}
      className="w-[min(640px,100%)] gap-4 p-6"
      actions={
        <Button variant="filled" onClick={onClose}>
          {t("tagsDialog.done")}
        </Button>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-ink">
        {ordered.map(([key, list]) => (
          <section key={key} className="flex flex-col gap-0.5">
            <h3 className="rounded-sm bg-parchment px-2 py-1 text-label text-ink-muted">{key || noGroup}</h3>
            <ul className="flex flex-col gap-0.5">
              {[...list]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((tag) => {
                  const isRow = editing?.id === tag.id && editing.field === "row";
                  const isDescription = editing?.id === tag.id && editing.field === "description";
                  return (
                    <li
                      key={tag.id}
                      data-tag-id={tag.id}
                      className="group flex flex-col gap-1 rounded-sm px-2 py-1 hover:bg-ink-wash"
                      onContextMenu={(e) => onContextMenu(tag.id, e)}
                      onDoubleClick={() => !editing && start(tag.id, "row")}
                      onBlur={isRow ? onRowBlur : undefined}
                    >
                      <div className="flex items-center gap-2">
                        {isRow ? (
                          <>
                            <input
                              autoFocus
                              aria-label={t("tagsDialog.name")}
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              onKeyDown={onEditKeyDown}
                              className={`${INPUT_CLASS} flex-1 font-serif`}
                            />
                            <input
                              aria-label={t("tagsDialog.group")}
                              value={group}
                              onChange={(e) => setGroup(e.target.value)}
                              onKeyDown={onEditKeyDown}
                              className={`${INPUT_CLASS} w-40`}
                            />
                          </>
                        ) : (
                          <span
                            data-tag-name
                            tabIndex={0}
                            className="min-w-0 flex-1 truncate rounded-sm font-serif text-body outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            onKeyDown={(e) => {
                              if (e.key === "F2" || e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                start(tag.id, "row");
                              }
                            }}
                          >
                            {tag.name}
                          </span>
                        )}
                        <IconButton
                          label={t("tagsDialog.menuLabel")}
                          icon={<MoreVertical aria-hidden="true" className="h-4 w-4" />}
                          onClick={(e) => setMenu({ id: tag.id, ...belowElement(e.currentTarget) })}
                        />
                      </div>
                      {isDescription ? (
                        <textarea
                          autoFocus
                          aria-label={t("tagsDialog.descriptionField")}
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          onKeyDown={onEditKeyDown}
                          onBlur={() => finish(true)}
                          className="sc-textarea font-sans text-body"
                        />
                      ) : (
                        tag.description && <p className="px-0.5 text-label text-ink-muted">{tag.description}</p>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        <input
          aria-label={t("tagsDialog.new")}
          placeholder={t("tagsDialog.new")}
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            create();
          }}
          className="h-8 rounded-sm bg-surface px-2.5 text-body text-ink shadow-inset outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        {menu && menuTag && (
          <MenuSurface
            aria-label={t("tagsDialog.menuLabel")}
            className="fixed z-[130]"
            style={{ left: menu.x, top: menu.y }}
            onClose={() => setMenu(null)}
          >
            <MenuItem label={t("tagsDialog.rename")} onSelect={() => start(menuTag.id, "row")} />
            <MenuItem label={t("tagsDialog.description")} onSelect={() => start(menuTag.id, "description")} />
            <MenuSubmenu label={t("tagsDialog.merge")} disabled={tags.length < 2}>
              {tags
                .filter((x) => x.id !== menuTag.id)
                .map((x) => (
                  <MenuItem key={x.id} label={x.name} onSelect={() => merge(menuTag.id, x.id)} />
                ))}
            </MenuSubmenu>
            <MenuItem label={t("tagsDialog.remove")} onSelect={() => requestRemove(menuTag.id)} />
          </MenuSurface>
        )}
      </div>
    </Dialog>
  );
}
