/**
 * FERAL Rep Portal — Gamified Sound Engine
 *
 * Web Audio API synthesized sounds for the rep portal.
 * No audio files needed — everything is generated in code.
 *
 * Sounds:
 *  - notification: Mischievous cat "pounce-chirp" — plays on new notifications
 *  - reward:       Bright coin-collect chime — plays on XP/currency earned
 *  - levelUp:      Epic ascending fanfare — plays on level up
 *  - questComplete: Achievement unlock ding — plays on quest completion
 */

export type SoundType = "notification" | "reward" | "levelUp" | "questComplete";

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Unlock the audio context on first user interaction.
 * Call this from a click/touch handler — iOS Safari requires it.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  // Play a silent buffer to fully unlock on iOS
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  unlocked = true;
}

/**
 * Play a sound effect.
 */
export async function playSound(type: SoundType): Promise<void> {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { return; }
  }

  switch (type) {
    case "notification":
      return playNotification(ctx);
    case "reward":
      return playReward(ctx);
    case "levelUp":
      return playLevelUp(ctx);
    case "questComplete":
      return playQuestComplete(ctx);
  }
}

// ─── Notification: "Pounce-Chirp" ──────────────────────────────────────────
// Sub-bass thump → quick ascending sweep → bright ding + sparkle tail
// Duration: ~400ms. Inspired by a cat's playful chirp, translated to synth.

function playNotification(ctx: AudioContext): void {
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  // 1. Sub-bass "pounce" thump (60Hz, fast decay)
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(65, t);
  thump.frequency.exponentialRampToValueAtTime(30, t + 0.07);
  thumpGain.gain.setValueAtTime(0.4, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  thump.connect(thumpGain).connect(master);
  thump.start(t);
  thump.stop(t + 0.08);

  // 2. Ascending chirp sweep (400→750Hz, sine, the "mrrp!")
  const chirp = ctx.createOscillator();
  const chirpGain = ctx.createGain();
  chirp.type = "sine";
  chirp.frequency.setValueAtTime(420, t + 0.04);
  chirp.frequency.exponentialRampToValueAtTime(750, t + 0.12);
  chirpGain.gain.setValueAtTime(0, t + 0.04);
  chirpGain.gain.linearRampToValueAtTime(0.3, t + 0.06);
  chirpGain.gain.exponentialRampToValueAtTime(0.05, t + 0.14);
  chirpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  chirp.connect(chirpGain).connect(master);
  chirp.start(t + 0.04);
  chirp.stop(t + 0.2);

  // 3. Bright "ding" at the peak (A5 = 880Hz)
  const ding = ctx.createOscillator();
  const dingGain = ctx.createGain();
  ding.type = "sine";
  ding.frequency.value = 880;
  dingGain.gain.setValueAtTime(0, t + 0.1);
  dingGain.gain.linearRampToValueAtTime(0.35, t + 0.13);
  dingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  ding.connect(dingGain).connect(master);
  ding.start(t + 0.1);
  ding.stop(t + 0.4);

  // 4. Sparkle overtone (E6 = 1318Hz, triangle, subtle shimmer)
  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();
  sparkle.type = "triangle";
  sparkle.frequency.value = 1318;
  sparkleGain.gain.setValueAtTime(0, t + 0.12);
  sparkleGain.gain.linearRampToValueAtTime(0.1, t + 0.15);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  sparkle.connect(sparkleGain).connect(master);
  sparkle.start(t + 0.12);
  sparkle.stop(t + 0.4);

  // 5. High shimmer (A6 = 1760Hz, very quiet fairy dust)
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();
  shimmer.type = "sine";
  shimmer.frequency.value = 1760;
  shimmerGain.gain.setValueAtTime(0, t + 0.14);
  shimmerGain.gain.linearRampToValueAtTime(0.04, t + 0.17);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  shimmer.connect(shimmerGain).connect(master);
  shimmer.start(t + 0.14);
  shimmer.stop(t + 0.38);
}

// ─── Reward: Coin Collect ───────────────────────────────────────────────────
// Two quick bright notes ascending — pentatonic "ting-TING!"
// Duration: ~250ms

function playReward(ctx: AudioContext): void {
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Note 1: E6 (1318Hz)
  const n1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  n1.type = "sine";
  n1.frequency.value = 1318;
  g1.gain.setValueAtTime(0.3, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  n1.connect(g1).connect(master);
  n1.start(t);
  n1.stop(t + 0.12);

  // Harmonic shimmer on note 1
  const h1 = ctx.createOscillator();
  const hg1 = ctx.createGain();
  h1.type = "triangle";
  h1.frequency.value = 2636;
  hg1.gain.setValueAtTime(0.08, t);
  hg1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  h1.connect(hg1).connect(master);
  h1.start(t);
  h1.stop(t + 0.1);

  // Note 2: A6 (1760Hz) — louder, the payoff
  const n2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  n2.type = "sine";
  n2.frequency.value = 1760;
  g2.gain.setValueAtTime(0, t + 0.08);
  g2.gain.linearRampToValueAtTime(0.4, t + 0.1);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  n2.connect(g2).connect(master);
  n2.start(t + 0.08);
  n2.stop(t + 0.25);

  // Sparkle on note 2
  const h2 = ctx.createOscillator();
  const hg2 = ctx.createGain();
  h2.type = "triangle";
  h2.frequency.value = 3520;
  hg2.gain.setValueAtTime(0, t + 0.1);
  hg2.gain.linearRampToValueAtTime(0.06, t + 0.12);
  hg2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  h2.connect(hg2).connect(master);
  h2.start(t + 0.1);
  h2.stop(t + 0.22);
}

// ─── Level Up: Epic Ascending Fanfare ───────────────────────────────────────
// C5 → E5 → G5 → C6 major arpeggio, each note building, triumphant finish
// Duration: ~900ms

function playLevelUp(ctx: AudioContext): void {
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const notes = [
    { freq: 523, start: 0, dur: 0.15, vol: 0.2 },      // C5
    { freq: 659, start: 0.12, dur: 0.15, vol: 0.25 },   // E5
    { freq: 784, start: 0.24, dur: 0.15, vol: 0.3 },    // G5
    { freq: 1047, start: 0.36, dur: 0.45, vol: 0.4 },   // C6 (sustained)
  ];

  for (const note of notes) {
    // Main tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0, t + note.start);
    gain.gain.linearRampToValueAtTime(note.vol, t + note.start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + note.start + note.dur);
    osc.connect(gain).connect(master);
    osc.start(t + note.start);
    osc.stop(t + note.start + note.dur + 0.01);

    // Octave shimmer (quiet, adds richness)
    const shim = ctx.createOscillator();
    const shimGain = ctx.createGain();
    shim.type = "triangle";
    shim.frequency.value = note.freq * 2;
    shimGain.gain.setValueAtTime(0, t + note.start);
    shimGain.gain.linearRampToValueAtTime(note.vol * 0.15, t + note.start + 0.03);
    shimGain.gain.exponentialRampToValueAtTime(0.001, t + note.start + note.dur * 0.8);
    shim.connect(shimGain).connect(master);
    shim.start(t + note.start);
    shim.stop(t + note.start + note.dur + 0.01);
  }

  // Final chord shimmer (C6 + E6 together for ~300ms)
  const chord = ctx.createOscillator();
  const chordGain = ctx.createGain();
  chord.type = "sine";
  chord.frequency.value = 1318; // E6
  chordGain.gain.setValueAtTime(0, t + 0.4);
  chordGain.gain.linearRampToValueAtTime(0.15, t + 0.45);
  chordGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  chord.connect(chordGain).connect(master);
  chord.start(t + 0.4);
  chord.stop(t + 0.9);

  // Sub-bass impact on final note
  const bass = ctx.createOscillator();
  const bassGain = ctx.createGain();
  bass.type = "sine";
  bass.frequency.value = 65;
  bassGain.gain.setValueAtTime(0.25, t + 0.36);
  bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  bass.connect(bassGain).connect(master);
  bass.start(t + 0.36);
  bass.stop(t + 0.56);
}

// ─── Quest Complete: Achievement Unlock ─────────────────────────────────────
// Three ascending notes with satisfying resolution: G5 → B5 → D6 → G6
// Duration: ~500ms

function playQuestComplete(ctx: AudioContext): void {
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const notes = [
    { freq: 784, start: 0, dur: 0.1, vol: 0.2 },       // G5
    { freq: 988, start: 0.08, dur: 0.1, vol: 0.25 },    // B5
    { freq: 1175, start: 0.16, dur: 0.12, vol: 0.3 },   // D6
    { freq: 1568, start: 0.26, dur: 0.3, vol: 0.35 },   // G6 (ring out)
  ];

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0, t + note.start);
    gain.gain.linearRampToValueAtTime(note.vol, t + note.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + note.start + note.dur);
    osc.connect(gain).connect(master);
    osc.start(t + note.start);
    osc.stop(t + note.start + note.dur + 0.01);

    // Triangle overtone for brightness
    const tri = ctx.createOscillator();
    const triGain = ctx.createGain();
    tri.type = "triangle";
    tri.frequency.value = note.freq * 1.5; // Fifth above
    triGain.gain.setValueAtTime(0, t + note.start);
    triGain.gain.linearRampToValueAtTime(note.vol * 0.1, t + note.start + 0.02);
    triGain.gain.exponentialRampToValueAtTime(0.001, t + note.start + note.dur * 0.7);
    tri.connect(triGain).connect(master);
    tri.start(t + note.start);
    tri.stop(t + note.start + note.dur + 0.01);
  }

  // Bright metallic "ding" on the final note
  const ding = ctx.createOscillator();
  const dingGain = ctx.createGain();
  ding.type = "sine";
  ding.frequency.value = 3136; // G7
  dingGain.gain.setValueAtTime(0, t + 0.28);
  dingGain.gain.linearRampToValueAtTime(0.06, t + 0.3);
  dingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  ding.connect(dingGain).connect(master);
  ding.start(t + 0.28);
  ding.stop(t + 0.52);
}
