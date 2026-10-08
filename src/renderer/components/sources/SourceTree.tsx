// src/renderer/components/sources/SourceTree.tsx
//
// Sidebar of the Recortes view: sources grouped by their level-1 class, each
// with its pages nested under it. Selection lives in the RecortesProvider; every page
// added here (button, dropped file) goes through useAddPage.

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import { useRecortesContext } from "../../hooks/RecortesContext";
import { flattenSyllables } from "../../lib/sliceUtils";
import { createEmptySource, groupSourcesByLevel1, guerangerToSource } from "../../lib/sources";
import { sourceProgress } from "../../lib/recent-meta";
import type { ManuscriptSource } from "../../lib/models";
import { MenuItem, MenuSeparator, MenuSurface, type MenuCloseReason } from "../../ui/Menu";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { belowElement } from "../texto/SyllableText";
import { useAddPage } from "./useAddPage";
import { ResizeImageDialog } from "./ResizeImageDialog";

export interface SourceTreeProps {
  onEditSource(id: string): void;
}

/** Expanded/collapsed choices, kept for the session (the view remounts on tab switches). */
const sessionExpanded = new Map<string, boolean>();
export function resetSourceTreeSession() {
  sessionExpanded.clear();
}

type Item = { key: string; kind: "source"; sourceId: string } | { key: string; kind: "page"; sourceId: string; lineId: string };
type Menu = { item: Item; x: number; y: number };
type Confirm = { kind: "deleteSource"; sourceId: string } | { kind: "removePage"; sourceId: string; lineId: string };
type FolioDraft = { sourceId: string; lineId: string; folio: string; label: string };

const sourceKey = (id: string) => `s:${id}`;
const pageKey = (id: string) => `p:${id}`;
const isMenuKey = (e: KeyboardEvent) => e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

function caption(source: ManuscriptSource): string {
  return [source.metadata.city, source.metadata.century].map((p) => p.trim()).filter(Boolean).join(", ");
}

export function SourceTree({ onEditSource }: SourceTreeProps) {
  const { state, dispatch } = useProject();
  const recortes = useRecortesContext();
  const { t } = useTranslation();
  const project = state.project;
  const words = project?.text.words;
  const total = useMemo(() => (words ? flattenSyllables(words).length : 0), [words]);
  const sources = project?.sources;
  const classification = project?.classification;
  const groups = useMemo(
    () => (sources && classification ? groupSourcesByLevel1(sources, classification) : []),
    [sources, classification],
  );
  const addPage = useAddPage((sourceId, lineId) => recortes.selectLine(sourceId, lineId));
  const activeSourceId = recortes.activeSourceId;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(sessionExpanded));
  const isExpanded = (id: string) => expanded[id] ?? id === activeSourceId;
  function setExpandedFor(id: string, open: boolean) {
    sessionExpanded.set(id, open);
    setExpanded((prev) => (prev[id] === open ? prev : { ...prev, [id]: open }));
  }
  // Selecting a source opens it.
  useEffect(() => {
    if (activeSourceId) setExpandedFor(activeSourceId, true);
  }, [activeSourceId]);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuAnchor = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [folio, setFolio] = useState<FolioDraft | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // ── Visible items and roving focus ──────────────────────────────────────────

  const items: Item[] = [];
  for (const g of groups) {
    for (const s of g.sources) {
      items.push({ key: sourceKey(s.id), kind: "source", sourceId: s.id });
      if (isExpanded(s.id)) {
        for (const l of s.lines) items.push({ key: pageKey(l.id), kind: "page", sourceId: s.id, lineId: l.id });
      }
    }
  }
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const visibleKeys = new Set(items.map((i) => i.key));
  const activeLineKey = recortes.activeLineId ? pageKey(recortes.activeLineId) : null;
  const tabKey =
    (focusKey && visibleKeys.has(focusKey) && focusKey) ||
    (activeLineKey && visibleKeys.has(activeLineKey) && activeLineKey) ||
    (activeSourceId && visibleKeys.has(sourceKey(activeSourceId)) && sourceKey(activeSourceId)) ||
    items[0]?.key ||
    null;

  const treeRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<string | null>(null);
  useEffect(() => {
    const key = focusRequest.current;
    if (!key) return;
    focusRequest.current = null;
    treeRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  });
  function focusItem(key: string) {
    setFocusKey(key);
    focusRequest.current = key;
  }

  if (!project) return null;

  const sourceById = (id: string) => project.sources.find((s) => s.id === id);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function select(item: Item) {
    if (item.kind === "page") recortes.selectLine(item.sourceId, item.lineId);
    // Re-selecting the active source would reset its page.
    else if (item.sourceId !== activeSourceId) recortes.selectSource(item.sourceId);
  }

  function neighborInGroup(id: string, direction: "up" | "down"): ManuscriptSource | undefined {
    const group = groups.find((g) => g.sources.some((s) => s.id === id));
    if (!group) return undefined;
    const idx = group.sources.findIndex((s) => s.id === id);
    return group.sources[direction === "up" ? idx - 1 : idx + 1];
  }

  /** Moves past the sources of other groups to the neighbor in the group: one undo step. */
  function move(id: string, direction: "up" | "down") {
    const neighbor = neighborInGroup(id, direction);
    if (!neighbor) return;
    const from = project!.sources.findIndex((s) => s.id === id);
    const to = project!.sources.findIndex((s) => s.id === neighbor.id);
    const coalesceKey = `REORDER_SOURCE:${id}:${crypto.randomUUID()}`;
    for (let i = 0; i < Math.abs(to - from); i++) {
      dispatch({ type: "REORDER_SOURCE", payload: { id, direction }, meta: { coalesceKey } });
    }
  }

  function removePage(sourceId: string, lineId: string) {
    const source = sourceById(sourceId);
    const removed = source?.lines.find((l) => l.id === lineId);
    if (!source || !removed) return;
    const syllableCuts = { ...source.syllableCuts };
    for (let i = removed.syllableRange.start; i <= removed.syllableRange.end; i++) delete syllableCuts[i];
    // The selection falls back by itself when the active page disappears.
    dispatch({ type: "UPDATE_SOURCE", payload: { ...source, lines: source.lines.filter((l) => l.id !== lineId), syllableCuts } });
  }

  function newSource() {
    const source = createEmptySource();
    dispatch({ type: "ADD_SOURCE", payload: source });
    recortes.selectSource(source.id);
    onEditSource(source.id);
  }

  async function importGueranger() {
    const result = await window.mocquereau.importGueranger();
    if (!result) return;
    const count = project!.sources.length;
    result.manuscripts.forEach((gm, i) => dispatch({ type: "ADD_SOURCE", payload: guerangerToSource(gm, count + i + 1) }));
  }

  function saveFolio() {
    if (!folio) return;
    const clean = (v: string) => (v.trim() === "" ? undefined : v.trim());
    dispatch({
      type: "UPDATE_LINE_METADATA",
      payload: { sourceId: folio.sourceId, lineId: folio.lineId, folio: clean(folio.folio), label: clean(folio.label) },
    });
    setFolio(null);
  }

  function confirmAction() {
    if (!confirm) return;
    if (confirm.kind === "deleteSource") dispatch({ type: "REMOVE_SOURCE", payload: confirm.sourceId });
    else removePage(confirm.sourceId, confirm.lineId);
    setConfirm(null);
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  function openMenu(item: Item, at: { x: number; y: number }) {
    setFocusKey(item.key);
    setMenu({ item, ...at });
  }

  function onItemContextMenu(item: Item, e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    // The menu key fires contextmenu without coordinates: open under the item.
    openMenu(item, e.clientX === 0 && e.clientY === 0 ? belowElement(e.currentTarget) : { x: e.clientX, y: e.clientY });
  }

  function onTreeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    const index = el ? items.findIndex((i) => i.key === el.dataset.key) : -1;
    if (!el || index < 0) return;
    const item = items[index];
    if (isMenuKey(e)) {
      openMenu(item, belowElement(el));
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next = items[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) focusItem(next.key);
    } else if (e.key === "Home" || e.key === "End") {
      const next = e.key === "Home" ? items[0] : items[items.length - 1];
      if (next) focusItem(next.key);
    } else if (e.key === "ArrowRight") {
      if (item.kind !== "source") return;
      if (!isExpanded(item.sourceId)) setExpandedFor(item.sourceId, true);
      else if (items[index + 1]?.kind === "page" && items[index + 1].sourceId === item.sourceId) focusItem(items[index + 1].key);
    } else if (e.key === "ArrowLeft") {
      if (item.kind === "page") focusItem(sourceKey(item.sourceId));
      else if (isExpanded(item.sourceId)) setExpandedFor(item.sourceId, false);
    } else if (e.key === "Enter" || e.key === " ") {
      select(item);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onDrop(sourceId: string, e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const file = e.dataTransfer?.files?.[0];
    if (file) void addPage.dropFile(sourceId, file);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const itemProps = (item: Item) => ({
    role: "treeitem",
    "data-key": item.key,
    tabIndex: item.key === tabKey ? 0 : -1,
    onFocus: () => setFocusKey(item.key),
    onContextMenu: (e: MouseEvent<HTMLElement>) => onItemContextMenu(item, e),
  });

  function renderSource(source: ManuscriptSource) {
    const item: Item = { key: sourceKey(source.id), kind: "source", sourceId: source.id };
    const active = source.id === activeSourceId;
    const open = isExpanded(source.id);
    const progress = sourceProgress(source, total);
    const done = Math.round(progress * total);
    const cap = caption(source);
    return (
      <div
        key={source.id}
        role="none"
        className={["mb-2 rounded-md", dragOver === source.id ? "bg-ink-wash" : ""].filter(Boolean).join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          if (dragOver !== source.id) setDragOver(source.id);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
        }}
        onDrop={(e) => onDrop(source.id, e)}
      >
        <div
          {...itemProps(item)}
          data-source-id={source.id}
          aria-level={1}
          aria-expanded={open}
          aria-selected={active}
          className="flex cursor-default items-start gap-1.5 rounded-md pt-1.5 pr-3 pb-2 pl-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          onClick={() => select(item)}
          onDoubleClick={() => onEditSource(source.id)}
        >
          <span
            data-testid="source-chevron"
            aria-hidden="true"
            className="mt-0.5 flex-none rounded text-ink-muted hover:bg-ink-wash"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedFor(source.id, !open);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {open ? <ChevronDown className="h-4 w-4" strokeWidth={1.75} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.75} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={["truncate font-serif text-source font-medium", source.metadata.siglum ? "text-ink" : "text-ink-muted italic"].join(" ")}>
              {source.metadata.siglum || t("sourceTree.unnamed")}
            </div>
            {cap && <div className="truncate text-caption text-ink-muted">{cap}</div>}
            <div className="sc-progress mt-1.5 w-full" title={t("sourceTree.progress", { done, total })}>
              <i className="bg-verdigris" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>
        {open && (
          <div role="group">
            {source.lines.map((line) => {
              const pageItem: Item = { key: pageKey(line.id), kind: "page", sourceId: source.id, lineId: line.id };
              const current = active && line.id === recortes.activeLineId;
              return (
                <div
                  key={line.id}
                  {...itemProps(pageItem)}
                  data-line-id={line.id}
                  aria-level={2}
                  aria-selected={current}
                  className={[
                    "mr-2 mb-0.5 ml-[30px] flex cursor-default items-center gap-2.5 rounded-md px-2 py-[5px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                    current ? "bg-rubric-wash" : "hover:bg-ink-wash",
                  ].join(" ")}
                  onClick={() => select(pageItem)}
                >
                  <img src={line.image.dataUrl} alt="" className="block h-8 w-11 flex-none rounded object-cover shadow-[0_0_0_1px_var(--rule)]" />
                  <span className="min-w-0 flex-1 truncate font-serif text-body text-ink">{line.folio || "—"}</span>
                  {line.confirmed && <Check data-confirmed aria-hidden="true" className="h-4 w-4 flex-none text-verdigris" strokeWidth={1.75} />}
                </div>
              );
            })}
            {active && (
              <div role="none" className="mr-2 ml-[30px]">
                <Button
                  size="sm"
                  className="text-ink-muted"
                  icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />}
                  title={t("sourceTree.addPageTitle")}
                  onClick={() => void addPage.openFile(source.id)}
                >
                  {t("sourceTree.page")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMenu(m: Menu) {
    const close = (reason: MenuCloseReason) => {
      setMenu(null);
      if (reason === "escape" || reason === "tab") focusItem(m.item.key);
    };
    const { item } = m;
    return (
      <MenuSurface aria-label={t("sourceTree.menuLabel")} className="fixed z-[130]" style={{ left: m.x, top: m.y }} onClose={close}>
        {item.kind === "source" ? (
          <>
            <MenuItem label={t("sourceTree.menu.edit")} onSelect={() => onEditSource(item.sourceId)} />
            <MenuItem label={t("sourceTree.menu.duplicate")} onSelect={() => dispatch({ type: "DUPLICATE_SOURCE", payload: item.sourceId })} />
            <MenuSeparator />
            <MenuItem
              label={t("sourceTree.menu.moveUp")}
              disabled={!neighborInGroup(item.sourceId, "up")}
              onSelect={() => move(item.sourceId, "up")}
            />
            <MenuItem
              label={t("sourceTree.menu.moveDown")}
              disabled={!neighborInGroup(item.sourceId, "down")}
              onSelect={() => move(item.sourceId, "down")}
            />
            <MenuSeparator />
            <MenuItem
              label={t("sourceTree.menu.deleteSource")}
              onSelect={() => setConfirm({ kind: "deleteSource", sourceId: item.sourceId })}
            />
          </>
        ) : (
          <>
            <MenuItem
              label={t("sourceTree.menu.folio")}
              onSelect={() => {
                const line = sourceById(item.sourceId)?.lines.find((l) => l.id === item.lineId);
                if (line) setFolio({ sourceId: item.sourceId, lineId: line.id, folio: line.folio ?? "", label: line.label ?? "" });
              }}
            />
            <MenuSeparator />
            <MenuItem
              label={t("sourceTree.menu.removePage")}
              onSelect={() => setConfirm({ kind: "removePage", sourceId: item.sourceId, lineId: item.lineId })}
            />
          </>
        )}
      </MenuSurface>
    );
  }

  return (
    <aside className="flex w-[248px] flex-none flex-col border-r border-rule bg-parchment">
      <div
        ref={treeRef}
        role="tree"
        aria-label={t("sourceTree.label")}
        className="min-h-0 flex-1 overflow-y-auto pt-2"
        onKeyDown={onTreeKeyDown}
      >
        {groups.map((g) => (
          <div key={g.value?.id ?? "none"} role="none">
            {g.value && (
              <div data-group-header role="presentation" className="px-3.5 pt-3 pb-1.5 text-caption font-semibold text-ink-muted">
                {g.value.name}
              </div>
            )}
            {g.sources.map(renderSource)}
          </div>
        ))}
      </div>

      <div className="relative flex-none p-3">
        <div className="flex">
          <Button
            variant="elevated"
            className="min-w-0 flex-1 justify-center rounded-r-none"
            icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />}
            onClick={newSource}
          >
            {t("sourceTree.newSource")}
          </Button>
          <Button
            ref={newMenuAnchor}
            variant="elevated"
            className="rounded-l-none px-2"
            aria-label={t("sourceTree.moreSourceOptions")}
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            onClick={() => setNewMenuOpen((o) => !o)}
          >
            <ChevronUp aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
        {newMenuOpen && (
          <MenuSurface
            aria-label={t("sourceTree.moreSourceOptions")}
            anchor={newMenuAnchor.current}
            className="absolute right-3 bottom-full left-3 z-[120]"
            onClose={(reason) => {
              setNewMenuOpen(false);
              if (reason === "escape") newMenuAnchor.current?.focus();
            }}
          >
            <MenuItem label={t("sourceTree.newSource")} onSelect={newSource} />
            <MenuItem label={t("sourceTree.importGueranger")} onSelect={() => void importGueranger()} />
          </MenuSurface>
        )}
      </div>

      {menu && renderMenu(menu)}

      <Dialog
        open={confirm !== null}
        title={confirm?.kind === "removePage" ? t("sourceTree.removePage.title") : t("sourceTree.deleteSource.title")}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="elevated" data-autofocus onClick={() => setConfirm(null)}>
              {t("sourceTree.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmAction}>
              {confirm?.kind === "removePage" ? t("sourceTree.removePage.confirm") : t("sourceTree.deleteSource.confirm")}
            </Button>
          </>
        }
      >
        {confirm?.kind === "removePage" ? t("sourceTree.removePage.body") : t("sourceTree.deleteSource.body")}
      </Dialog>

      <Dialog
        open={folio !== null}
        title={t("sourceTree.folio.title")}
        onClose={() => setFolio(null)}
        onConfirm={saveFolio}
        actions={
          <>
            <Button variant="elevated" onClick={() => setFolio(null)}>
              {t("sourceTree.cancel")}
            </Button>
            <Button variant="filled" onClick={saveFolio}>
              {t("sourceTree.folio.save")}
            </Button>
          </>
        }
      >
        {folio && (
          <div className="flex flex-col gap-3">
            <Input
              label={t("sourceTree.folio.folio")}
              value={folio.folio}
              data-autofocus
              onChange={(e) => setFolio({ ...folio, folio: e.target.value })}
            />
            <Input
              label={t("sourceTree.folio.label")}
              value={folio.label}
              onChange={(e) => setFolio({ ...folio, label: e.target.value })}
            />
          </div>
        )}
      </Dialog>

      <ResizeImageDialog addPage={addPage} />
    </aside>
  );
}
