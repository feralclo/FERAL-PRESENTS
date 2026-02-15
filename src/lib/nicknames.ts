/**
 * Gen Z raver username generator.
 *
 * Generates the kind of usernames ravers in 2026 would actually
 * pick for themselves — playful, genre-aware, a bit unhinged.
 * Think TikTok display names meets rave culture.
 *
 * Two-part construction: descriptor + identity.
 * Examples: "Techno Princess", "4am Menace", "Basement Gremlin"
 */

const DESCRIPTORS = [
  "4am",
  "6am",
  "Afterparty",
  "Analog",
  "Basement",
  "Berlin",
  "Berghain",
  "Boiler Room",
  "Cardio",
  "Chaos",
  "Club",
  "Concrete",
  "Dark Room",
  "Deep End",
  "Disco",
  "DIY",
  "Drum n",
  "Dub",
  "Festival",
  "Filthy",
  "Foggy",
  "Feral",
  "Floor",
  "Front Row",
  "Garage",
  "Hardstyle",
  "House",
  "Hypnotic",
  "Illegal",
  "Industrial",
  "Italo",
  "Jungle",
  "K-Hole",
  "Ketamine",
  "Late Night",
  "Lo-fi",
  "Lost",
  "Main Room",
  "Minimal",
  "Modular",
  "Molly",
  "Neon",
  "Night Bus",
  "Peak Time",
  "Phantom",
  "Pirate Radio",
  "Plastic",
  "Rave",
  "Resident",
  "Rogue",
  "Secret",
  "Serotonin",
  "Smoke Machine",
  "Strobe Light",
  "Sub Bass",
  "Sunrise",
  "Sweat Box",
  "Techno",
  "Trance",
  "Tunnel",
  "Underground",
  "Velvet",
  "Vinyl",
  "Void",
  "Warehouse",
] as const;

const IDENTITIES = [
  "Angel",
  "Baddie",
  "Bandit",
  "Bat",
  "CEO",
  "Champion",
  "Child",
  "Cowboy",
  "Creature",
  "Cult Leader",
  "Daddy",
  "Demon",
  "Diva",
  "Dreamer",
  "Fairy",
  "Fiend",
  "Freak",
  "Gal",
  "Ghost",
  "Goblin",
  "God",
  "Goddess",
  "Gremlin",
  "Healer",
  "Icon",
  "Kid",
  "King",
  "Legend",
  "Lord",
  "Lover",
  "Menace",
  "Merchant",
  "Monarch",
  "Mum",
  "Mystic",
  "Nerd",
  "NPC",
  "Oracle",
  "Outlaw",
  "Phantom",
  "Pirate",
  "Pixie",
  "Pope",
  "Prince",
  "Princess",
  "Prophet",
  "Punk",
  "Queen",
  "Rat",
  "Rebel",
  "Saint",
  "Sensei",
  "Shaman",
  "Siren",
  "Spirit",
  "Survivor",
  "Therapist",
  "Troll",
  "Villain",
  "Wanderer",
  "Warrior",
  "Witch",
  "Wizard",
  "Zombie",
] as const;

/**
 * Generate a deterministic Gen Z raver username from an email address.
 * Same email always produces the same nickname (via simple hash).
 */
export function generateNickname(email: string): string {
  let hash = 0;
  const normalized = email.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  hash = Math.abs(hash);

  const desc = DESCRIPTORS[hash % DESCRIPTORS.length];
  const identity = IDENTITIES[Math.floor(hash / DESCRIPTORS.length) % IDENTITIES.length];

  return `${desc} ${identity}`;
}
