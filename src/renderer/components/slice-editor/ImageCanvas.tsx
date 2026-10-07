// src/renderer/components/slice-editor/ImageCanvas.tsx

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StoredImage, SyllabifiedWord, SyllableBox } from '../../lib/models';
import type { ImageAdjustments } from '../../lib/models';
import { EditorAction } from './editorReducer';
import { SyllableBoxOverlay, cropBoxClass } from './SyllableBoxOverlay';
import { ImageAdjustmentsPanel } from './ImageAdjustmentsPanel';
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
import { isTextInput } from '../../shell/useMenuShortcuts';
import { useTranslation } from 'react-i18next';

interface ImageCanvasProps {
  image: StoredImage | null;
  syllableBoxes: Record<number, SyllableBox | null>;
  activeSyllableIdx: number | null;
  syllableRange: { start: number; end: number } | null;
  gaps: number[];
  hoveredSyllableIdx: number | null;
  zoom: number;
  panOffset: { x: number; y: number };
  dispatch: React.Dispatch<EditorAction>;
  words?: SyllabifiedWord[];
  showAllBoxes?: boolean;
  sameSizeMode?: boolean;
  adjustments?: ImageAdjustments;
  panelOpen?: boolean;
  onUpdateAdjustments?: (partial: Partial<ImageAdjustments>) => void;
  onClosePanel?: () => void;
}

export function ImageCanvas({
  image,
  syllableBoxes,
  activeSyllableIdx,
  syllableRange,
  gaps,
  hoveredSyllableIdx,
  zoom,
  panOffset,
  dispatch,
  words,
  showAllBoxes = false,
  sameSizeMode = false,
  adjustments,
  panelOpen = false,
  onUpdateAdjustments,
  onClosePanel,
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
    dispatch({ type: 'SET_ZOOM', payload: z });
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

  // Find the "template box" for same-size mode: first box (by lowest syllable idx) that exists
  function getTemplateBox(): SyllableBox | null {
    const indices = Object.keys(syllableBoxes)
      .map(Number)
      .filter(k => syllableBoxes[k] != null)
      .sort((a, b) => a - b);
    if (indices.length === 0) return null;
    return syllableBoxes[indices[0]];
  }

  // ── Draw-new-box pointer handlers ─────────────────────────────────────────
  function handleImagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (activeSyllableIdx === null) return;
    const hasBox =
      activeSyllableIdx in syllableBoxes && syllableBoxes[activeSyllableIdx] !== null;
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
    if (!drawState.current || !drawState.current.live || activeSyllableIdx === null) {
      drawState.current = null;
      setLiveDrawBox(null);
      return;
    }
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const box = drawState.current.live;
    // Only commit if box is big enough (at least 2% in both dimensions)
    // Accept very small selections (0.5% = ~5-10 pixels depending on image size).
    // Rejecting too aggressively frustrates users marking narrow neumes.
    if (box.w >= 0.005 && box.h >= 0.005) {
      dispatch({ type: 'SET_BOX', payload: { syllableIdx: activeSyllableIdx, box } });
    }
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
    <div className="relative flex flex-col h-full bg-parchment-deep">
      {/* Image + boxes area */}
      <div ref={scrollerRef} data-canvas-scroller className="relative flex-1 min-h-0 overflow-auto">
        {/* Adjustments panel — sibling of the transformed wrapper so it stays
            readable even when the image is rotated/flipped. */}
        {panelOpen && onUpdateAdjustments && onClosePanel && (
          <ImageAdjustmentsPanel
            adjustments={adjustments}
            onUpdate={onUpdateAdjustments}
            onClose={onClosePanel}
          />
        )}
        {/* Wrapper = AABB do retângulo da imagem rotacionada (axis-aligned com a tela).
            Não recebe rotation transform: só translate+aspect-ratio. As boxes
            são posicionadas em fração desse AABB. */}
        <div
          ref={imageWrapperRef}
          data-image-wrapper
          className={[
            'relative mx-auto',
            activeSyllableIdx !== null &&
            !(
              activeSyllableIdx in syllableBoxes &&
              syllableBoxes[activeSyllableIdx] !== null
            )
              ? 'cursor-crosshair'
              : 'cursor-default',
          ].join(' ')}
          style={{
            // zoom 1 = largura do contêiner de rolagem (ajustar); sem minWidth,
            // afastar abaixo de 100% também funciona.
            width: `${100 * zoom}%`,
            aspectRatio: intrinsic ? `${1} / ${aabbRatio}` : undefined,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
          onPointerDown={handleImagePointerDown}
          onPointerMove={handleImagePointerMove}
          onPointerUp={handleImagePointerUp}
        >
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

          {/* Non-active boxes — clickable to switch active syllable. Always rendered
              when there's a box (visible styling only when showAllBoxes is on). */}
          {(syllableRange
            ? Array.from({ length: syllableRange.end - syllableRange.start + 1 }, (_, k) => syllableRange.start + k)
            : []
          ).map((idx) => {
            const box = syllableBoxes[idx];
            if (!box || idx === activeSyllableIdx) return null;
            return (
              <div
                key={`all-${idx}`}
                className={
                  showAllBoxes
                    ? `${cropBoxClass('confirmed', idx)} cursor-pointer`
                    : 'absolute cursor-pointer border-2 border-transparent'
                }
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
                  dispatch({ type: 'SET_ACTIVE_SYLLABLE', payload: idx });
                }}
                title={t('imageCanvas.clickToEdit', { syllable: syllableTextAt(idx) })}
              >
                {showAllBoxes && (
                  <span className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-br-sm bg-surface/90 px-1.5 py-0.5 font-serif text-caption italic text-ink">
                    {syllableTextAt(idx)}
                  </span>
                )}
              </div>
            );
          })}

          {/* SyllableBoxOverlay for active syllable that has a box */}
          {activeSyllableIdx !== null && syllableBoxes[activeSyllableIdx] != null && (
            <SyllableBoxOverlay
              box={syllableBoxes[activeSyllableIdx] as SyllableBox}
              syllableIdx={activeSyllableIdx}
              label={syllableTextAt(activeSyllableIdx)}
              containerRef={imageWrapperRef}
              onBoxChange={(newBox) => {
                dispatch({ type: 'SET_BOX', payload: { syllableIdx: activeSyllableIdx, box: newBox } });
              }}
              onBoxCommit={(newBox) => {
                dispatch({ type: 'SET_BOX', payload: { syllableIdx: activeSyllableIdx, box: newBox } });
              }}
              onDeleteBox={() => {
                dispatch({ type: 'DELETE_BOX', payload: { syllableIdx: activeSyllableIdx } });
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
