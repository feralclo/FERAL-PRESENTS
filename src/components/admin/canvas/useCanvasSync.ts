"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Coordinates one-way scroll-sync between the canvas form pane and the
 * preview pane. Form-section headers register a target id; clicking a
 * header asks the preview to scroll its matching block into view and
 * pulse it for 600ms (Phase 3.4 brief).
 *
 * Reverse direction (preview → form) is intentionally out of scope — the
 * audit found it too fiddly for the value it adds.
 */
export type CanvasAnchor =
  | "identity"
  | "story"
  | "look"
  | "tickets"
  | "money"
  | "publish";

export interface CanvasSyncApi {
  /** Pulse + scroll the preview to a section. Called from the form pane. */
  focus: (anchor: CanvasAnchor) => void;
  /** Currently-pulsing anchor in the preview, or null. */
  pulsing: CanvasAnchor | null;
  /** Imperative ref the preview pane uses to scroll its container. */
  registerPreview: (el: HTMLElement | null, anchor: CanvasAnchor) => void;
}

export function useCanvasSync(): CanvasSyncApi {
  const previewBlocks = useRef<Map<CanvasAnchor, HTMLElement>>(new Map());
  const [pulsing, setPulsing] = useState<CanvasAnchor | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerPreview = useCallback(
    (el: HTMLElement | null, anchor: CanvasAnchor) => {
      if (el) previewBlocks.current.set(anchor, el);
      else previewBlocks.current.delete(anchor);
    },
    []
  );

  const focus = useCallback((anchor: CanvasAnchor) => {
    const el = previewBlocks.current.get(anchor);
    if (el) {
      // The preview is inside an overflow-y-auto container; scrollIntoView
      // with block:start respects the scroll container without bubbling
      // up to the page.
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulsing(anchor);
    pulseTimer.current = setTimeout(() => setPulsing(null), 600);
  }, []);

  return { focus, pulsing, registerPreview };
}
