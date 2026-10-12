import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../../hooks/useProject";
import { emptyAnnotation } from "@shared/annotation/annotation";
import { createDefaultVocabulary } from "@shared/annotation/default-vocabulary";
import { fold, getVocabulary } from "@shared/annotation/vocabulary";
import { parseHashTags, resolveTagNames } from "@shared/annotation/tags";
import type { NeumeVocabulary, SyllableAnnotation, Tag } from "@shared/annotation/types";

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
  /** Project snapshot for which createKind already dispatched a vocabulary (not yet rendered). */
  const vocabularyWrittenFor = useRef<unknown>(null);

  const update = useCallback(
    (next: SyllableAnnotation, field: string) => {
      if (!project || sourceId === undefined || syllable === undefined) return;
      const coalesceKey = `ANNOTATION:${sourceId}:${syllable}:${field}`;
      if (!project.neumeVocabulary && vocabularyWrittenFor.current !== project && next.neumes.length > 0) {
        dispatch({ type: "SET_NEUME_VOCABULARY", payload: createDefaultVocabulary(t), meta: { coalesceKey } });
      }
      dispatch({
        type: "SET_ANNOTATION",
        payload: { sourceId, syllable, annotation: next },
        field,
      });
    },
    [project, sourceId, syllable, dispatch, t],
  );

  /**
   * Adds a neume kind (and its category, reused by folded name or created) to the project
   * vocabulary and returns the new kind id. Shares the coalesce key of the neume sequence,
   * so creating and appending the kind is one undo step.
   */
  const createKind = useCallback(
    (draft: { name: string; categoryName: string; defaultNotes: number }): string => {
      const kindId = `kind.${crypto.randomUUID()}`;
      if (!project || sourceId === undefined || syllable === undefined) return kindId;
      const base = getVocabulary(project, t);
      const categoryName = draft.categoryName.trim();
      const existing = base.categories.find((c) => fold(c.name.trim()) === fold(categoryName));
      const category = existing ?? { id: `cat.${crypto.randomUUID()}`, name: categoryName };
      const next: NeumeVocabulary = {
        ...base,
        categories: existing ? base.categories : [...base.categories, category],
        kinds: [
          ...base.kinds,
          { id: kindId, categoryId: category.id, name: draft.name.trim(), defaultNotes: draft.defaultNotes },
        ],
      };
      vocabularyWrittenFor.current = project;
      dispatch({
        type: "SET_NEUME_VOCABULARY",
        payload: next,
        meta: { coalesceKey: `ANNOTATION:${sourceId}:${syllable}:neumes` },
      });
      return kindId;
    },
    [project, sourceId, syllable, dispatch, t],
  );

  /** Creates missing tags (same undo step as the annotation) and returns the ids for the names. */
  const ensureTags = useCallback(
    (names: string[], key: string): string[] => {
      const current = project?.tags ?? [];
      const res = resolveTagNames(current, names);
      if (res.tags.length !== current.length) {
        dispatch({ type: "SET_TAGS", payload: res.tags, meta: { coalesceKey: key } });
      }
      return res.ids;
    },
    [project, dispatch],
  );

  const setTagNames = useCallback(
    (names: string[], neumeIndex?: number) => {
      if (sourceId === undefined || syllable === undefined) return;
      const field = neumeIndex === undefined ? "tags" : `neume.${neumeIndex}.tags`;
      const ids = ensureTags(names, `ANNOTATION:${sourceId}:${syllable}:${field}`);
      if (neumeIndex === undefined) {
        update({ ...annotation, tags: ids }, field);
      } else {
        const neumes = annotation.neumes.map((n, i) => (i === neumeIndex ? { ...n, tags: ids } : n));
        update({ ...annotation, neumes }, field);
      }
    },
    [sourceId, syllable, annotation, ensureTags, update],
  );

  const setComment = useCallback(
    (text: string, opts?: { final?: boolean }) => {
      if (sourceId === undefined || syllable === undefined) return;
      const scanned = opts?.final ? text : text.replace(OPEN_TAG, "");
      const names = parseHashTags(scanned);
      const ids = names.length > 0 ? ensureTags(names, `ANNOTATION:${sourceId}:${syllable}:comment`) : [];
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
