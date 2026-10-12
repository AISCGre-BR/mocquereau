import { useEffect, type RefObject } from 'react';

/** Ctrl on Windows/Linux, Cmd on macOS (where Ctrl+click is the context-menu click). */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const panKey = (e: { ctrlKey: boolean; metaKey: boolean }) => (IS_MAC ? e.metaKey : e.ctrlKey);

/**
 * Drag the sheet: Ctrl (Cmd on macOS) + primary button, or the middle button, scrolls the
 * scroll container with the pointer (no box is drawn or selected).
 *
 * Native capture-phase listeners on the scroller run before the sheet's React
 * handlers (bubble phase), so stopping the event there keeps boxes, bands and
 * suggestions out of the gesture. The scroller gets `data-pan="grab"` while
 * the modifier is held over it and `data-pan="grabbing"` while dragging, for the cursor.
 */
export function useSheetPan(scrollerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!active || !scroller) return;
    const el: HTMLElement = scroller;

    let pan: { id: number; x: number; y: number; left: number; top: number } | null = null;
    let hover = false;
    let held = false;

    function sync() {
      const state = pan ? 'grabbing' : hover && held ? 'grab' : '';
      if (state) el.dataset.pan = state;
      else delete el.dataset.pan;
    }

    const isPanStart = (e: PointerEvent) => e.button === 1 || (e.button === 0 && panKey(e));

    function onPointerDown(e: PointerEvent) {
      if (!isPanStart(e)) return;
      e.preventDefault();
      e.stopPropagation();
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers (tests) may not be capturable.
      }
      sync();
    }

    function onPointerMove(e: PointerEvent) {
      hover = true;
      held = panKey(e);
      if (pan && e.pointerId === pan.id) {
        e.stopPropagation();
        el.scrollLeft = pan.left - (e.clientX - pan.x);
        el.scrollTop = pan.top - (e.clientY - pan.y);
      }
      sync();
    }

    function end(e: PointerEvent) {
      if (!pan || e.pointerId !== pan.id) return;
      e.stopPropagation();
      const id = pan.id;
      pan = null;
      if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
      sync();
    }

    // The middle button's mousedown would start the browser's autoscroll.
    function onMouseDown(e: MouseEvent) {
      if (e.button === 1) e.preventDefault();
    }

    function onEnter() {
      hover = true;
      sync();
    }
    function onLeave() {
      hover = false;
      sync();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== (IS_MAC ? 'Meta' : 'Control')) return;
      held = e.type === 'keydown';
      sync();
    }
    function onBlur() {
      held = false;
      sync();
    }

    el.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('pointermove', onPointerMove, true);
    el.addEventListener('pointerup', end, true);
    el.addEventListener('pointercancel', end, true);
    el.addEventListener('lostpointercapture', end, true);
    el.addEventListener('mousedown', onMouseDown, true);
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('pointermove', onPointerMove, true);
      el.removeEventListener('pointerup', end, true);
      el.removeEventListener('pointercancel', end, true);
      el.removeEventListener('lostpointercapture', end, true);
      el.removeEventListener('mousedown', onMouseDown, true);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      delete el.dataset.pan;
    };
  }, [scrollerRef, active]);
}
