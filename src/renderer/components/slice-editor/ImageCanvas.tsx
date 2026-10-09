// src/renderer/components/slice-editor/ImageCanvas.tsx

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StoredImage, SyllabifiedWord, SyllableBox } from '../../lib/models';
import type { ImageAdjustments } from '../../lib/models';
import { SyllableBoxOverlay, cropBoxClass } from './SyllableBoxOverlay';
import {
  buildImageFilter,
  buildImageTransform,
  normalizeRotation,
} from '../../lib/image-adjustments';
import {
  ZOOM_FIT,
  ZOOM_MAX,
  ZOOM_MIN,
  anchoredScroll,
  clampZoom,
  formatZoom,
  isZoomShortcut,
  stepZoom,
  wheelZoom,
  type ZoomAnchor,
} from '../../lib/canvas-zoom';
import { isRotateShortcut, rotateQuarter } from '../../lib/canvas-rotation';
import { isTextInput } from '../../shell/useMenuShortcuts';
import { useTranslation } from 'react-i18next';
import { sortNeumeBands } from '../../lib/neume-bands';

interface ImageCanvasProps {
  image: StoredImage | null;
  /** The page's boxes in the frame the user sees (boxesInView), read from the project. */
  syllableBoxes: Record<number, SyllableBox | null>;
  activeSyllableIdx: number | null;
  syllableRange: { start: number; end: number } | null;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onActivateSyllable?: (syllableIdx: number) => void;
  /** End of a gesture (draw, move, resize): the box goes to the project. */
  onBoxCommit?: (syllableIdx: number, box: SyllableBox) => void;
  words?: SyllabifiedWord[];
  showAllBoxes?: boolean;
  sameSizeMode?: boolean;
  /** Off: a click on the sheet only selects (no new box). */
  drawMode?: boolean;
  adjustments?: ImageAdjustments;
  /** Ctrl+[ / Ctrl+] rotate through it (the Image panel holds the other controls). */
  onUpdateAdjustments?: (partial: Partial<ImageAdjustments>) => void;
  /** Right click on the sheet (the Recortes menu as a context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Neume suggestions of the page (S3): dashed, in the syllable's pigment. */
  suggestedBoxes?: Record<number, SyllableBox>;
  /** Neume line bands of the page (S7), same frame as the boxes, sorted top to bottom. */
  neumeBands?: SyllableBox[];
  /** "Marcar linha de neumas": sheet gestures draw and select bands instead of boxes. */
  bandTool?: boolean;
  activeBand?: number | null;
  onActivateBand?: (index: number | null) => void;
  /** End of a band gesture: the whole sorted list, and the index of the band just drawn or edited. */
  onBandsCommit?: (bands: SyllableBox[], activeIndex: number) => void;
  /** Right click on a band while the tool is on. */
  onBandContextMenu?: (index: number, at: { x: number; y: number }) => void;
}

/** Smallest band kept: 1% of the view wide, 0.5% high. */
const BAND_MIN_W = 0.01;
const BAND_MIN_H = 0.005;

export function ImageCanvas({
  image,
  syllableBoxes,
  activeSyllableIdx,
  syllableRange,
  zoom,
  onZoomChange,
  onActivateSyllable,
  onBoxCommit,
  words,
  showAllBoxes = false,
  sameSizeMode = false,
  drawMode = true,
  adjustments,
  onUpdateAdjustments,
  onContextMenu,
  suggestedBoxes,
  neumeBands,
  bandTool = false,
  activeBand = null,
  onActivateBand,
  onBandsCommit,
  onBandContextMenu,
}: ImageCanvasProps) {
  const { t } = useTranslation();
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Phase 12 (UX revisão): a imagem rotaciona, mas as boxes ficam axis-aligned
  // com a tela (manuscrito torto pode ser endireitado sem inclinar as caixas).
  // O `<img>` recebe rotation/flip via CSS transform; o wrapper recebe o tamanho
  // do AABB do retângulo rotacionado, e as boxes são posicionadas em fração desse
  // AABB. Pointer math volta a ser linear (rect.width/height como denominador).
  const imageFilter = buildImageFilter(adjustments);
  const imageTransform = buildImageTransform(adjustments);

  // Intrinsic image dims — necessárias para computar o AABB do retângulo
  // rotacionado (escala que faz a imagem caber dentro do wrapper).
  const [intrinsic, setIntrinsic] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!image) { setIntrinsic(null); return; }
    const probe = new Image();
    probe.onload = () => setIntrinsic({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = image.dataUrl;
  }, [image?.dataUrl]);

  const rot = adjustments?.rotation ?? 0;
  const θ = (normalizeRotation(rot) * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(θ));
  const absSin = Math.abs(Math.sin(θ));
  // AABB ratio (height / width) do retângulo rotacionado, dado o aspect intrinsic
  // da imagem. Ratio canônico = h/w; após rotação por θ:
  //   AABB_W ∝ cos + ratio·sin
  //   AABB_H ∝ sin + ratio·cos
  const intrinsicRatio = intrinsic ? intrinsic.h / intrinsic.w : 1;
  const aabbRatio = (absSin + intrinsicRatio * absCos) / (absCos + intrinsicRatio * absSin);
  // Largura percentual da imagem dentro do wrapper (rotação faz o AABB crescer,
  // então a imagem ocupa < 100% do wrapper para caber). Reduz a 100% quando rot=0.
  const imgWidthPct = 100 / (absCos + intrinsicRatio * absSin);
  const imgHeightPct = 100 * intrinsicRatio / (absSin + intrinsicRatio * absCos);

  // ── Draw-new-box state ─────────────────────────────────────────────────────
  const drawState = useRef<{
    startX: number;  // fraction
    startY: number;  // fraction
    live: SyllableBox | null;
  } | null>(null);
  const [liveDrawBox, setLiveDrawBox] = useState<SyllableBox | null>(null);

  // Draft of the active box while it is moved or resized: lives here until the
  // pointer goes up, then the box is committed to the project (spec D6). It only
  // counts over the very boxes it was drawn on: another page, an undo or another
  // syllable makes it stale, so it never draws over the wrong page.
  const [draft, setDraft] = useState<{
    base: Record<number, SyllableBox | null>;
    idx: number;
    box: SyllableBox;
  } | null>(null);
  const boxes =
    draft && draft.base === syllableBoxes && draft.idx === activeSyllableIdx
      ? { ...syllableBoxes, [draft.idx]: draft.box }
      : syllableBoxes;

  // ── Neume bands (S7) ───────────────────────────────────────────────────────
  // A band being drawn, and the draft of the selected band while it is moved or
  // resized (same staleness rule as the box draft).
  const bandDraw = useRef<{ startX: number; startY: number; live: SyllableBox | null } | null>(null);
  const [liveBand, setLiveBand] = useState<SyllableBox | null>(null);
  const [bandDraft, setBandDraft] = useState<{ base: SyllableBox[] | undefined; idx: number; box: SyllableBox } | null>(null);
  const bandList = neumeBands ?? [];
  const selectedBand = bandTool && activeBand !== null && bandList[activeBand] ? activeBand : null;
  const shownBands =
    bandDraft && bandDraft.base === neumeBands && bandDraft.idx === selectedBand
      ? bandList.map((b, i) => (i === bandDraft.idx ? bandDraft.box : b))
      : bandList;

  // Turning the tool off mid-drag drops the band being drawn.
  useEffect(() => {
    if (bandTool) return;
    bandDraw.current = null;
    setLiveBand(null);
  }, [bandTool]);

  /** Commits `bands` sorted, with the index `band` ends up at. */
  function commitBands(bands: SyllableBox[], band: SyllableBox) {
    const sorted = sortNeumeBands(bands);
    onBandsCommit?.(sorted, sorted.indexOf(band));
  }

  // Resolve syllable text for a given global idx (used by box overlay labels/titles)
  function syllableTextAt(globalIdx: number): string {
    if (!words) return String(globalIdx);
    let cursor = 0;
    for (const w of words) {
      for (const s of w.syllables) {
        if (cursor === globalIdx) return s;
        cursor++;
      }
    }
    return String(globalIdx);
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────
  // Roda (com ou sem Ctrl/Cmd) aproxima/afasta em torno do cursor; Shift+roda fica
  // com a rolagem horizontal nativa. O listener é nativo e NÃO passivo: o onWheel
  // do React é passivo, então o preventDefault dele era ignorado (a vista rolava
  // junto e Ctrl+roda chegava ao zoom da página, travado no main).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pendingAnchor = useRef<ZoomAnchor | null>(null);

  /** Ponto do fólio sob (clientX, clientY), ou o centro visível do contêiner. */
  function anchorAt(clientX?: number, clientY?: number): ZoomAnchor | null {
    const wrapper = imageWrapperRef.current;
    const scroller = scrollerRef.current;
    if (!wrapper || !scroller) return null;
    const sr = scroller.getBoundingClientRect();
    const x = clientX ?? sr.left + sr.width / 2;
    const y = clientY ?? sr.top + sr.height / 2;
    const wr = wrapper.getBoundingClientRect();
    if (wr.width === 0 || wr.height === 0) return null;
    return { clientX: x, clientY: y, fx: (x - wr.left) / wr.width, fy: (y - wr.top) / wr.height };
  }

  function applyZoom(next: number, anchor: ZoomAnchor | null) {
    const z = clampZoom(next);
    if (Math.abs(z - zoomRef.current) < 1e-9) return;
    zoomRef.current = z;
    pendingAnchor.current = anchor;
    onZoomChange(z);
  }
  const applyZoomRef = useRef(applyZoom);
  applyZoomRef.current = applyZoom;
  const anchorAtRef = useRef(anchorAt);
  anchorAtRef.current = anchorAt;

  // Depois do novo tamanho, rola para manter o ponto ancorado sob o cursor.
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    const wrapper = imageWrapperRef.current;
    const scroller = scrollerRef.current;
    if (!anchor || !wrapper || !scroller) return;
    const next = anchoredScroll(scroller, anchor, wrapper.getBoundingClientRect());
    scroller.scrollLeft = next.scrollLeft;
    scroller.scrollTop = next.scrollTop;
  }, [zoom]);

  const hasImage = image != null;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    function onWheel(e: WheelEvent) {
      if (e.shiftKey) return;
      e.preventDefault();
      applyZoomRef.current(
        wheelZoom(zoomRef.current, e.deltaY, e.deltaMode),
        anchorAtRef.current(e.clientX, e.clientY),
      );
    }
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [hasImage]);

  // Ctrl+= / Ctrl+- / Ctrl+0: só existem com o editor (vista Recortes) montado.
  useEffect(() => {
    if (!hasImage) return;
    function onKeyDown(e: KeyboardEvent) {
      const action = isZoomShortcut(e);
      if (!action) return;
      if (isTextInput(e.target) || (e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      if (document.querySelector('[role="menu"]')) return;
      e.preventDefault();
      const z = zoomRef.current;
      const next = action === 'fit' ? ZOOM_FIT : stepZoom(z, action === 'in' ? 1 : -1);
      applyZoomRef.current(next, anchorAtRef.current());
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasImage]);

  // ── Girar (atalhos; os botões ficam no painel Imagem) ──────────────────────
  const rotationRef = useRef(rot);
  rotationRef.current = rot;
  const updateAdjRef = useRef(onUpdateAdjustments);
  updateAdjRef.current = onUpdateAdjustments;

  // Ctrl+[ / Ctrl+]: gira 90°. Mesmas guardas dos atalhos de zoom.
  useEffect(() => {
    if (!hasImage) return;
    function onKeyDown(e: KeyboardEvent) {
      const action = isRotateShortcut(e);
      if (!action || !updateAdjRef.current) return;
      if (isTextInput(e.target) || (e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      if (document.querySelector('[role="menu"]')) return;
      e.preventDefault();
      updateAdjRef.current({ rotation: rotateQuarter(rotationRef.current, action === 'cw' ? 1 : -1) });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasImage]);

  // Find the "template box" for same-size mode: first box (by lowest syllable idx) that exists
  function getTemplateBox(): SyllableBox | null {
    const indices = Object.keys(boxes)
      .map(Number)
      .filter(k => boxes[k] != null)
      .sort((a, b) => a - b);
    if (indices.length === 0) return null;
    return boxes[indices[0]];
  }

  // ── Draw-new-box pointer handlers ─────────────────────────────────────────
  /** Syllable whose suggestion (other than the active syllable's) lies under the point. */
  function suggestionAt(clientX: number, clientY: number): number | null {
    if (!suggestedBoxes) return null;
    const rect = imageWrapperRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    for (const [key, box] of Object.entries(suggestedBoxes)) {
      const idx = Number(key);
      if (idx === activeSyllableIdx || boxes[idx] != null) continue;
      if (fx >= box.x && fx <= box.x + box.w && fy >= box.y && fy <= box.y + box.h) return idx;
    }
    return null;
  }

  // Where the primary button went down on the sheet: a release without moving
  // is a click (it may land on a suggestion).
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const CLICK_SLOP = 3;

  function handleImagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only the primary button draws (right click opens the context menu).
    if (e.button !== 0) return;
    if (bandTool) {
      // The band tool owns the sheet: a drag draws a band; a click clears the selection.
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const rect = imageWrapperRef.current!.getBoundingClientRect();
      bandDraw.current = {
        startX: (e.clientX - rect.left) / rect.width,
        startY: (e.clientY - rect.top) / rect.height,
        live: null,
      };
      setLiveBand(null);
      return;
    }
    pressAt.current = { x: e.clientX, y: e.clientY };
    if (!drawMode || activeSyllableIdx === null) return;
    const hasBox = boxes[activeSyllableIdx] != null;
    if (hasBox) return;  // SyllableBoxOverlay handles its own pointer events

    // Same-size mode: if a template box exists, click places a box of same dimensions
    // centered on the click. User can still drag to override size.
    const template = sameSizeMode ? getTemplateBox() : null;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Boxes vivem no espaço do AABB do wrapper (axis-aligned com a tela).
    // O wrapper NÃO é rotacionado — só a `<img>` interna é. Logo rect.width/height
    // refletem o tamanho real do AABB e podem ser usados como denominador direto.
    const wrapper = imageWrapperRef.current!;
    const rect = wrapper.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = (e.clientY - rect.top) / rect.height;
    drawState.current = { startX, startY, live: null };

    // If same-size mode with a template: pre-populate a box of template size centered at click
    if (template) {
      const w = template.w;
      const h = template.h;
      const x = Math.max(0, Math.min(1 - w, startX - w / 2));
      const y = Math.max(0, Math.min(1 - h, startY - h / 2));
      const box: SyllableBox = { x, y, w, h };
      drawState.current.live = box;
      setLiveDrawBox(box);
    } else {
      setLiveDrawBox(null);
    }
  }

  function handleImagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (bandDraw.current) {
      const rect = imageWrapperRef.current!.getBoundingClientRect();
      const curX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const curY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const { startX, startY } = bandDraw.current;
      const band: SyllableBox = {
        x: Math.min(startX, curX),
        y: Math.min(startY, curY),
        w: Math.abs(curX - startX),
        h: Math.abs(curY - startY),
      };
      bandDraw.current.live = band;
      setLiveBand(band);
      return;
    }
    if (!drawState.current) return;
    const wrapper = imageWrapperRef.current!;
    const rect = wrapper.getBoundingClientRect();
    const curX = (e.clientX - rect.left) / rect.width;
    const curY = (e.clientY - rect.top) / rect.height;
    const { startX, startY } = drawState.current;
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.max(0.01, Math.abs(curX - startX));
    const h = Math.max(0.01, Math.abs(curY - startY));
    const box: SyllableBox = { x, y, w, h };
    drawState.current.live = box;
    setLiveDrawBox(box);
  }

  function handleImagePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (bandDraw.current && bandTool) {
      const band = bandDraw.current.live;
      bandDraw.current = null;
      setLiveBand(null);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (band && band.w >= BAND_MIN_W && band.h >= BAND_MIN_H) commitBands([...bandList, band], band);
      else onActivateBand?.(null);
      return;
    }
    const box = drawState.current?.live ?? null;
    const drawing = drawState.current !== null;
    const press = pressAt.current;
    pressAt.current = null;
    // Cleared before releasing the capture: the lostpointercapture it causes
    // must not read as a cancelled gesture.
    drawState.current = null;
    setLiveDrawBox(null);
    if (drawing) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const isClick =
      press !== null && Math.abs(e.clientX - press.x) <= CLICK_SLOP && Math.abs(e.clientY - press.y) <= CLICK_SLOP;
    if (isClick) {
      const hit = suggestionAt(e.clientX, e.clientY);
      if (hit !== null) {
        onActivateSyllable?.(hit);
        return;
      }
    }
    if (!box || activeSyllableIdx === null) return;
    // Accept very small selections (0.5% = ~5-10 pixels depending on image size).
    // Rejecting too aggressively frustrates users marking narrow neumes.
    if (box.w >= 0.005 && box.h >= 0.005) {
      onBoxCommit?.(activeSyllableIdx, box);
    }
  }

  /** pointercancel / lostpointercapture mid-draw: the new box is dropped. */
  function handleImagePointerCancel() {
    pressAt.current = null;
    if (bandDraw.current) {
      bandDraw.current = null;
      setLiveBand(null);
    }
    if (!drawState.current) return;
    drawState.current = null;
    setLiveDrawBox(null);
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-full text-ink-muted">
        {t('imageCanvas.noImageLoaded')}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Image + boxes area: 16 px margins around the sheet, which sits in a
          card (radius-lg, elev-2). Zoom 1 still fits the sheet to the width. */}
      <div ref={scrollerRef} data-canvas-scroller className="relative flex-1 min-h-0 overflow-auto p-4">
        {/* Wrapper = AABB do retângulo da imagem rotacionada (axis-aligned com a tela).
            Não recebe rotation transform: só translate+aspect-ratio. As boxes
            são posicionadas em fração desse AABB. */}
        <div
          ref={imageWrapperRef}
          data-image-wrapper
          data-sheet-card
          className={[
            'relative mx-auto rounded-lg bg-surface shadow-elev-2',
            bandTool || (drawMode && activeSyllableIdx !== null && boxes[activeSyllableIdx] == null)
              ? 'cursor-crosshair'
              : 'cursor-default',
          ].join(' ')}
          style={{
            // zoom 1 = largura do contêiner de rolagem (ajustar); sem minWidth,
            // afastar abaixo de 100% também funciona.
            width: `${100 * zoom}%`,
            aspectRatio: intrinsic ? `${1} / ${aabbRatio}` : undefined,
          }}
          onPointerDown={handleImagePointerDown}
          onPointerMove={handleImagePointerMove}
          onPointerUp={handleImagePointerUp}
          onPointerCancel={handleImagePointerCancel}
          onLostPointerCapture={handleImagePointerCancel}
          onContextMenu={onContextMenu}
        >
          {/* The card's rounded corners clip the image only: box tags and
              handles may still reach past the sheet's edge. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            <img
              src={image.dataUrl}
              alt={t('imageCanvas.manuscriptAlt')}
              className="block select-none pointer-events-none absolute"
              draggable={false}
              style={{
                left: '50%',
                top: '50%',
                width: `${imgWidthPct}%`,
                height: `${imgHeightPct}%`,
                transform: `translate(-50%, -50%) ${imageTransform ?? ''}`.trim(),
                transformOrigin: 'center center',
                filter: imageFilter || undefined,
              }}
            />
          </div>

          {/* Neume line bands (S7): always shown, behind the syllable boxes;
              they only take the pointer with the band tool on. */}
          {shownBands.map((band, i) =>
            i === selectedBand ? null : (
              <div
                key={`band-${i}`}
                data-neume-band={i}
                className={[
                  'absolute rounded-xs border border-dashed border-rule-strong',
                  bandTool ? 'cursor-pointer' : 'pointer-events-none',
                ].join(' ')}
                style={{
                  left: `${band.x * 100}%`,
                  top: `${band.y * 100}%`,
                  width: `${band.w * 100}%`,
                  height: `${band.h * 100}%`,
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onActivateBand?.(i);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onActivateBand?.(i);
                  onBandContextMenu?.(i, { x: e.clientX, y: e.clientY });
                }}
              />
            ),
          )}

          {/* Non-active boxes — clickable to switch active syllable. Always rendered
              when there's a box (visible styling only when showAllBoxes is on). */}
          {(syllableRange
            ? Array.from({ length: syllableRange.end - syllableRange.start + 1 }, (_, k) => syllableRange.start + k)
            : []
          ).map((idx) => {
            const box = boxes[idx];
            if (!box || idx === activeSyllableIdx) return null;
            return (
              <div
                key={`all-${idx}`}
                className={[
                  showAllBoxes
                    ? `${cropBoxClass('confirmed', idx)} group cursor-pointer`
                    : 'absolute cursor-pointer border-2 border-transparent',
                  bandTool ? 'pointer-events-none' : '',
                ].join(' ').trim()}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                }}
                onPointerDown={(e) => {
                  // Prevent image wrapper from starting a draw; just switch active syllable
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivateSyllable?.(idx);
                }}
                // Focusable boxes are buttons for the editor keys too
                // (isOutsideEditorKeys): Tab moves focus on, Enter/Space activate.
                role={showAllBoxes ? 'button' : undefined}
                data-box-tabstop={showAllBoxes ? '' : undefined}
                aria-label={t('imageCanvas.clickToEdit', { syllable: syllableTextAt(idx) })}
                tabIndex={showAllBoxes ? 0 : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onActivateSyllable?.(idx);
                  }
                }}
              >
                {showAllBoxes && (
                  <span
                    data-box-label
                    aria-hidden="true"
                    className="sc-box__tag pointer-events-none z-10 opacity-0 group-focus-visible:opacity-100"
                  >
                    {syllableTextAt(idx)}
                  </span>
                )}
              </div>
            );
          })}

          {/* Suggested boxes (S3): never take the pointer, so a drag that starts
              over one draws as usual; a plain click over one activates its
              syllable (suggestionAt in the pointer-up path), never accepts. */}
          {suggestedBoxes &&
            Object.entries(suggestedBoxes).map(([key, box]) => {
              const idx = Number(key);
              if (boxes[idx] != null) return null;
              return (
                <div
                  key={`suggested-${idx}`}
                  data-suggested={idx}
                  className={`${cropBoxClass('suggested', idx)} pointer-events-none`}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.w * 100}%`,
                    height: `${box.h * 100}%`,
                  }}
                >
                  {idx === activeSyllableIdx && <span className="sc-box__tag pointer-events-none">{syllableTextAt(idx)}</span>}
                </div>
              );
            })}

          {/* With the band tool on, the active box is only shown (the sheet belongs to the tool). */}
          {bandTool && activeSyllableIdx !== null && boxes[activeSyllableIdx] != null && (() => {
            const box = boxes[activeSyllableIdx] as SyllableBox;
            return (
              <div
                className={`${cropBoxClass('active', activeSyllableIdx)} pointer-events-none`}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
              >
                <span className="sc-box__tag pointer-events-none">{syllableTextAt(activeSyllableIdx)}</span>
              </div>
            );
          })()}

          {/* SyllableBoxOverlay for active syllable that has a box */}
          {!bandTool && activeSyllableIdx !== null && boxes[activeSyllableIdx] != null && (
            <SyllableBoxOverlay
              box={boxes[activeSyllableIdx] as SyllableBox}
              syllableIdx={activeSyllableIdx}
              label={syllableTextAt(activeSyllableIdx)}
              containerRef={imageWrapperRef}
              onBoxChange={(newBox) => setDraft({ base: syllableBoxes, idx: activeSyllableIdx, box: newBox })}
              onBoxCommit={(newBox) => {
                setDraft(null);
                onBoxCommit?.(activeSyllableIdx, newBox);
              }}
              onBoxCancel={() => setDraft(null)}
            />
          )}

          {/* The selected band, with its 8 handles (band tool on). */}
          {selectedBand !== null && (
            <SyllableBoxOverlay
              variant="band"
              box={shownBands[selectedBand]}
              syllableIdx={selectedBand}
              containerRef={imageWrapperRef}
              onBoxChange={(next) => setBandDraft({ base: neumeBands, idx: selectedBand, box: next })}
              onBoxCommit={(next) => {
                setBandDraft(null);
                commitBands(bandList.map((b, i) => (i === selectedBand ? next : b)), next);
              }}
              onBoxCancel={() => setBandDraft(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBandContextMenu?.(selectedBand, { x: e.clientX, y: e.clientY });
              }}
            />
          )}

          {/* Band being drawn */}
          {liveBand && (
            <div
              className="pointer-events-none absolute rounded-xs border border-dashed border-rule-strong"
              style={{
                left: `${liveBand.x * 100}%`,
                top: `${liveBand.y * 100}%`,
                width: `${liveBand.w * 100}%`,
                height: `${liveBand.h * 100}%`,
              }}
            />
          )}

          {/* Live rubber-band preview while drawing */}
          {liveDrawBox && activeSyllableIdx !== null && (
            <div
              className={`${cropBoxClass('suggested', activeSyllableIdx)} pointer-events-none`}
              style={{
                left:   `${liveDrawBox.x * 100}%`,
                top:    `${liveDrawBox.y * 100}%`,
                width:  `${liveDrawBox.w * 100}%`,
                height: `${liveDrawBox.h * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* Controle flutuante de zoom (Parchment sc-zoom): fora do contêiner que rola. */}
      <div className="sc-zoom" role="toolbar" aria-label={t('imageCanvas.zoomControls')}>
        <button
          type="button"
          onClick={() => applyZoom(stepZoom(zoom, -1), anchorAt())}
          disabled={zoom <= ZOOM_MIN}
          title={t('imageCanvas.zoomOut')}
          aria-label={t('imageCanvas.zoomOut')}
        >
          −
        </button>
        <span>
          <button
            type="button"
            className="sc-num w-full cursor-pointer border-0 bg-transparent p-0 text-inherit"
            onClick={() => applyZoom(ZOOM_FIT, anchorAt())}
            title={t('imageCanvas.zoomFit')}
            aria-label={t('imageCanvas.zoomFitCurrent', { zoom: formatZoom(zoom) })}
          >
            {formatZoom(zoom)}
          </button>
        </span>
        <button
          type="button"
          onClick={() => applyZoom(stepZoom(zoom, 1), anchorAt())}
          disabled={zoom >= ZOOM_MAX}
          title={t('imageCanvas.zoomIn')}
          aria-label={t('imageCanvas.zoomIn')}
        >
          +
        </button>
      </div>
    </div>
  );
}
