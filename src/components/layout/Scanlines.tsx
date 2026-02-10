/**
 * Scanline + noise texture overlays.
 * These are CSS-only effects applied via fixed position pseudo-elements.
 * They match the existing noise/scanline effects from style.css.
 */
export function Scanlines() {
  return (
    <>
      <div className="scanlines" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
    </>
  );
}
