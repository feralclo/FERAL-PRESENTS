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
  /** Anchor the host last requested focus on; CanvasSection listens to
   *  this so it can force itself open when the readiness rail jumps to
   *  it. Tracks the count alongside the anchor so the same anchor twice
   *  in a row still re-fires. */
  focusRequest: { anchor: CanvasAnchor; nonce: number } | null;
  /** Imperative ref the preview pane uses to scroll its container. */
  registerPreview: (el: HTMLElement | null, anchor: CanvasAnchor) => void;
}

export function useCanvasSync(): CanvasSyncApi {
  const previewBlocks = useRef<Map<CanvasAnchor, HTMLElement>>(new Map());
  const [pulsing, setPulsing] = useState<CanvasAnchor | null>(null);
  const [focusRequest, setFocusRequest] = useState<
    { anchor: CanvasAnchor; nonce: number } | null
  >(null);
  const nonceRef = useRef(0);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerPreview = useCallback(
    (el: HTMLElement | null, anchor: CanvasAnchor) => {
      if (el) previewBlocks.current.set(anchor, el);
      else previewBlocks.current.delete(anchor);
    },
    []
  );

  const focus = useCallback((anchor: CanvasAnchor) => {
    // Pulse + scroll the preview so the host sees their target light up
    // on the right rail.
    const previewEl = previewBlocks.current.get(anchor);
    if (previewEl) {
      // The preview is inside an overflow-y-auto container; scrollIntoView
      // with block:start respects the scroll container without bubbling
      // up to the page.
      previewEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Tell the matching form section to force itself open (it may be
    // collapsed) AND scroll itself into view. The nonce makes back-to-
    // back focus calls on the same anchor still re-fire — the host might
    // click "Add cover image" twice in a row if the first click missed.
    nonceRef.current += 1;
    setFocusRequest({ anchor, nonce: nonceRef.current });

    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulsing(anchor);
    pulseTimer.current = setTimeout(() => setPulsing(null), 600);
  }, []);

  return { focus, pulsing, focusRequest, registerPreview };
}
