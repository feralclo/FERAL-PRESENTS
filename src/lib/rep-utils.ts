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
 * Play a layered achievement sound via Web Audio API.
 * Triangle-wave arpeggio with chorus detune + sparkle chord.
 * Becomes a no-op after the 3rd call in a session to avoid annoyance.
 */
export function playSuccessSound(): void {
  if (_soundPlayCount >= MAX_SOUND_PLAYS) return;
  _soundPlayCount++;

  try {
    const ctx = new AudioContext();

    // Ascending arpeggio → sparkle chord (C5 E5 G5 C6 + shimmer E6 G6)
    const tones: { freq: number; time: number; dur: number; vol: number }[] = [
      { freq: 523.25, time: 0, dur: 0.18, vol: 0.11 },       // C5
      { freq: 659.25, time: 0.06, dur: 0.18, vol: 0.12 },    // E5
      { freq: 783.99, time: 0.12, dur: 0.18, vol: 0.13 },    // G5
      { freq: 1046.50, time: 0.18, dur: 0.30, vol: 0.11 },   // C6 (sustain)
      { freq: 1318.51, time: 0.24, dur: 0.40, vol: 0.07 },   // E6 sparkle
      { freq: 1567.98, time: 0.27, dur: 0.35, vol: 0.05 },   // G6 sparkle
    ];

    tones.forEach(({ freq, time, dur, vol }) => {
      const t = ctx.currentTime + time;

      // Main tone — triangle (warm)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);

      // Chorus layer — slightly detuned sine (adds shimmer)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.value = freq * 1.004;
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(vol * 0.35, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
      osc2.start(t);
      osc2.stop(t + dur);
    });

    setTimeout(() => ctx.close(), 2000);
  } catch { /* AudioContext not available — silent fallback */ }
}
