import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../../hooks/useProject";
import { emptyAnnotation, normalizeAnnotation } from "@shared/annotation/annotation";
import { categoryLabel, createDefaultVocabulary } from "@shared/annotation/default-vocabulary";
import { fold, getVocabulary } from "@shared/annotation/vocabulary";
import { findTagByName, parseHashTags, resolveTagNames } from "@shared/annotation/tags";
import type { NeumeKind, NeumeVocabulary, SyllableAnnotation, Tag } from "@shared/annotation/types";

export interface AnnotationTarget {
  sourceId: string;
  syllable: number;
}

const NO_TAGS: Tag[] = [];

/** Matches a trailing hashtag the user is still typing (no separator after it yet). */
const OPEN_TAG = /#[\p{L}\p{N}_-]*$/u;

export function useAnnotation(target: AnnotationTarget | null) {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const sourceId = target?.sourceId;
  const syllable = target?.syllable;

  const annotation = useMemo<SyllableAnnotation>(() => {
    const src = project?.sources.find((s) => s.id === sourceId);
    return (syllable !== undefined && src?.annotations?.[syllable]) || emptyAnnotation();
  }, [project, sourceId, syllable]);

  const vocabulary = useMemo<NeumeVocabulary>(
    () => (project ? getVocabulary(project, t) : createDefaultVocabulary(t)),
    [project, t],
  );
  const tags = project?.tags ?? NO_TAGS;
  /**
   * Vocabulary that createKind already dispatched for a project snapshot that has not been
   * rendered yet (create + append in the same event). Consumed by the next update and cleared
   * on every new snapshot, so an undo back to that same snapshot seeds normally again. Several
   * creates in the same event build on it, so none of them is lost.
   */
  const vocabularyWritten = useRef<{ for: unknown; vocabulary: NeumeVocabulary } | null>(null);
  useEffect(() => {
    vocabularyWritten.current = null;
  }, [project]);

  const update = useCallback(
    (next: SyllableAnnotation, field: string) => {
      if (!project || sourceId === undefined || syllable === undefined) return;
      // Nothing changed (e.g. a blur after no edit): no dispatch, so the project stays clean.
      if (JSON.stringify(normalizeAnnotation(next)) === JSON.stringify(normalizeAnnotation(annotation))) return;
      const coalesceKey = `ANNOTATION:${sourceId}:${syllable}:${field}`;
      const vocabularyPending = vocabularyWritten.current?.for === project;
      vocabularyWritten.current = null;
      if (!project.neumeVocabulary && !vocabularyPending && next.neumes.length > 0) {
        dispatch({ type: "SET_NEUME_VOCABULARY", payload: createDefaultVocabulary(t), meta: { coalesceKey } });
      }
      dispatch({
        type: "SET_ANNOTATION",
        payload: { sourceId, syllable, annotation: next },
        field,
      });
    },
    [project, sourceId, syllable, annotation, dispatch, t],
  );

  /**
   * Adds a neume kind to the project vocabulary and returns the new kind id. A non-empty
   * category name is reused by folded name or created; empty = no category. Absent notes = no
   * default (nothing is presumed). Shares the coalesce key of the neume sequence, so creating
   * and appending the kind is one undo step.
   */
  const createKind = useCallback(
    (draft: { name: string; categoryName?: string; defaultNotes?: number }): string => {
      const kindId = `kind.${crypto.randomUUID()}`;
      if (!project || sourceId === undefined || syllable === undefined) return kindId;
      const pending = vocabularyWritten.current;
      const base = pending?.for === project ? pending.vocabulary : getVocabulary(project, t);
      const categoryName = draft.categoryName?.trim() ?? "";
      const existing = categoryName === "" ? undefined : base.categories.find((c) => fold(categoryLabel(c, t).trim()) === fold(categoryName));
      const category = existing ?? (categoryName === "" ? undefined : { id: `cat.${crypto.randomUUID()}`, name: categoryName });
      const kind: NeumeKind = { id: kindId, name: draft.name.trim() };
      if (category) kind.categoryId = category.id;
      if (draft.defaultNotes !== undefined) kind.defaultNotes = draft.defaultNotes;
      const next: NeumeVocabulary = {
        ...base,
        categories: category && !existing ? [...base.categories, category] : base.categories,
        kinds: [...base.kinds, kind],
      };
      vocabularyWritten.current = { for: project, vocabulary: next };
      dispatch({
        type: "SET_NEUME_VOCABULARY",
        payload: next,
        meta: { coalesceKey: `ANNOTATION:${sourceId}:${syllable}:neumes` },
      });
      return kindId;
    },
    [project, sourceId, syllable, dispatch, t],
  );

  /** Creates missing tags (same undo step as the annotation); returns the ids and the resulting tag list. */
  const ensureTags = useCallback(
    (names: string[], key: string): { ids: string[]; tags: Tag[] } => {
      const current = project?.tags ?? [];
      const res = resolveTagNames(current, names);
      if (res.tags.length !== current.length) {
        dispatch({ type: "SET_TAGS", payload: res.tags, meta: { coalesceKey: key } });
      }
      return res;
    },
    [project, dispatch],
  );

  const setTagNames = useCallback(
    (names: string[], neumeIndex?: number) => {
      if (sourceId === undefined || syllable === undefined) return;
      const field = neumeIndex === undefined ? "tags" : `neume.${neumeIndex}.tags`;
      const current = neumeIndex === undefined ? annotation.tags : (annotation.neumes[neumeIndex]?.tags ?? []);
      // A referenced tag that no longer exists is shown by its id; that id is kept as is.
      const orphans = new Set(current.filter((id) => !tags.some((tag) => tag.id === id)));
      const isOrphan = (name: string) => orphans.has(name.trim());
      const res = ensureTags(names.filter((n) => !isOrphan(n)), `ANNOTATION:${sourceId}:${syllable}:${field}`);
      const ids = [
        ...new Set(
          names.flatMap((n) => {
            if (isOrphan(n)) return [n.trim()];
            const tag = n.trim() === "" ? undefined : findTagByName(res.tags, n);
            return tag ? [tag.id] : [];
          }),
        ),
      ];
      if (neumeIndex === undefined) {
        update({ ...annotation, tags: ids }, field);
      } else {
        const neumes = annotation.neumes.map((n, i) => (i === neumeIndex ? { ...n, tags: ids } : n));
        update({ ...annotation, neumes }, field);
      }
    },
    [sourceId, syllable, annotation, tags, ensureTags, update],
  );

  const setComment = useCallback(
    (text: string, opts?: { final?: boolean }) => {
      if (sourceId === undefined || syllable === undefined) return;
      const scanned = opts?.final ? text : text.replace(OPEN_TAG, "");
      const names = parseHashTags(scanned);
      const ids = names.length > 0 ? ensureTags(names, `ANNOTATION:${sourceId}:${syllable}:comment`).ids : [];
      const merged = [...new Set([...annotation.tags, ...ids])];
      update({ ...annotation, tags: merged, comment: text }, "comment");
    },
    [sourceId, syllable, annotation, ensureTags, update],
  );

  const copyNeumesFrom = useCallback(
    (fromSourceId: string) => {
      if (syllable === undefined) return;
      const from = project?.sources.find((s) => s.id === fromSourceId)?.annotations?.[syllable];
      if (!from || from.neumes.length === 0) return;
      update({ ...annotation, neumes: from.neumes.map((n) => ({ ...n })) }, "neumes");
    },
    [project, syllable, annotation, update],
  );

  return { annotation, vocabulary, tags, update, createKind, setTagNames, setComment, copyNeumesFrom };
}
