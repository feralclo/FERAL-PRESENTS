/**
 * Rave / Techno nickname generator.
 *
 * Generates fun, memorable nicknames for lead profiles.
 * Two-part construction: adjective + noun, both drawn from
 * the techno, rave, and electronic music scene.
 *
 * Examples: "Acid Phantom", "Neon Basshead", "Warehouse Raver"
 */

const ADJECTIVES = [
  "Acid",
  "Analog",
  "Basement",
  "Berlin",
  "Cosmic",
  "Dark",
  "Deep",
  "Detroit",
  "Digital",
  "Dirty",
  "Distorted",
  "Dub",
  "Echo",
  "Electric",
  "Feral",
  "Filter",
  "Foggy",
  "Freight",
  "Future",
  "Gabber",
  "Glitched",
  "Hard",
  "Hi-Hat",
  "Hypnotic",
  "Industrial",
  "Infrared",
  "Jungle",
  "Late-Night",
  "Lo-Fi",
  "Lost",
  "Lunar",
  "Magnetic",
  "Midnight",
  "Minimal",
  "Modular",
  "Molten",
  "Neon",
  "Night",
  "Nocturnal",
  "Nuclear",
  "Orbital",
  "Peak-Time",
  "Phantom",
  "Pulsing",
  "Raw",
  "Rogue",
  "Shadow",
  "Solar",
  "Sonic",
  "Stroboscopic",
  "Sub",
  "Subterranean",
  "Synth",
  "Tribal",
  "Tunnel",
  "Turbo",
  "Ultra",
  "Underground",
  "Vapor",
  "Velvet",
  "Vinyl",
  "Voltage",
  "Warehouse",
  "Wicked",
] as const;

const NOUNS = [
  "Basshead",
  "Beatsmith",
  "Boiler",
  "Breaker",
  "Clubber",
  "Cyborg",
  "Dancer",
  "Decibel",
  "DJ",
  "Drifter",
  "Dropper",
  "Dweller",
  "Explorer",
  "Freak",
  "Ghost",
  "Groover",
  "Hacker",
  "Headliner",
  "Junkie",
  "Kickdrum",
  "Kompakt",
  "Loader",
  "Maverick",
  "Mixer",
  "Mover",
  "Mutant",
  "Mystic",
  "Nomad",
  "Operator",
  "Outlaw",
  "Pilgrim",
  "Pioneer",
  "Pirate",
  "Phreak",
  "Pulse",
  "Punisher",
  "Raver",
  "Rebel",
  "Reveller",
  "Rider",
  "Roller",
  "Runner",
  "Selector",
  "Sentinel",
  "Shifter",
  "Shredder",
  "Skulker",
  "Smasher",
  "Specimen",
  "Spinner",
  "Stomper",
  "Strobe",
  "Surgeon",
  "Synthesist",
  "Technoid",
  "Traveller",
  "Unit",
  "Vandal",
  "Wanderer",
  "Warrior",
  "Wraith",
] as const;

/**
 * Generate a deterministic rave nickname from an email address.
 * Same email always produces the same nickname (via simple hash).
 */
export function generateNickname(email: string): string {
  // Simple hash from email string
  let hash = 0;
  const normalized = email.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Ensure positive
  hash = Math.abs(hash);

  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];

  return `${adj} ${noun}`;
}
