/**
 * Shared rep portal utility functions.
 * Extracted from sales, points, quests, rewards, and layout pages.
 */

/**
 * Relative time formatting — "Just now", "5m ago", "3h ago", "2d ago", or a date.
 * Used by sales timeline, points timeline, and notification center.
 */
export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Compact relative time — "now", "5m", "3h", "2d", or a date.
 * Shorter variant for tight spaces (notification center).
 */
export function formatRelativeTimeCompact(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Currency symbol lookup from ISO code.
 */
export function getCurrencySymbol(currency?: string): string {
  switch (currency?.toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "\u20AC";
    case "GBP": return "\u00A3";
    default: return "\u00A3";
  }
}

// ─── Success Sound with Session Limiter ─────────────────────────────────────

let _soundPlayCount = 0;
const MAX_SOUND_PLAYS = 3;

/**
 * Play a success arpeggio via Web Audio API.
 * Becomes a no-op after the 3rd call in a session to avoid annoyance.
 */
export function playSuccessSound(): void {
  if (_soundPlayCount >= MAX_SOUND_PLAYS) return;
  _soundPlayCount++;

  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* AudioContext not available — silent fallback */ }
}
