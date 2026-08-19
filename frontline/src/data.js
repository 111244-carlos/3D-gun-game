// FRONTLINE — Phase 2 catalogs (guns, utilities, attachments, armor, levels)
// Pure data + stat math. See ../SPEC.md sections 4, 6, 7.

// ---------- RANKED LADDER (R-RNK-1) ----------
// Exactly the ladder you specified: Bronze 5→1, Silver 4→1, Gold 3→1, Diamond 2→1, Ultra Master.
// `rr` is the Rank Rating needed to reach that rank.
export const RANKS = [
  { key: "bronze5",  name: "Bronze V",     tier: "Bronze",  color: "#c88a4a", rr: 0 },
  { key: "bronze4",  name: "Bronze IV",    tier: "Bronze",  color: "#c88a4a", rr: 100 },
  { key: "bronze3",  name: "Bronze III",   tier: "Bronze",  color: "#c88a4a", rr: 200 },
  { key: "bronze2",  name: "Bronze II",    tier: "Bronze",  color: "#c88a4a", rr: 300 },
  { key: "bronze1",  name: "Bronze I",     tier: "Bronze",  color: "#c88a4a", rr: 400 },
  { key: "silver4",  name: "Silver IV",    tier: "Silver",  color: "#c3ccd6", rr: 520 },
  { key: "silver3",  name: "Silver III",   tier: "Silver",  color: "#c3ccd6", rr: 640 },
  { key: "silver2",  name: "Silver II",    tier: "Silver",  color: "#c3ccd6", rr: 760 },
  { key: "silver1",  name: "Silver I",     tier: "Silver",  color: "#c3ccd6", rr: 880 },
  { key: "gold3",    name: "Gold III",     tier: "Gold",    color: "#ecc44c", rr: 1030 },
  { key: "gold2",    name: "Gold II",      tier: "Gold",    color: "#ecc44c", rr: 1180 },
  { key: "gold1",    name: "Gold I",       tier: "Gold",    color: "#ecc44c", rr: 1330 },
  { key: "diamond2", name: "Diamond II",   tier: "Diamond", color: "#7fd4ff", rr: 1510 },
  { key: "diamond1", name: "Diamond I",    tier: "Diamond", color: "#7fd4ff", rr: 1690 },
  { key: "ultra",    name: "ULTRA MASTER", tier: "Ultra",   color: "#ff7ae0", rr: 1900 },
];

/** Rank index from total RR. */
export function rankFromRr(rr) {
  let i = 0;
  for (let j = 0; j < RANKS.length; j++) if (rr >= RANKS[j].rr) i = j;
  return i;
}
/** Progress toward the next rank: {rank, next, into, need}. */
export function rankProgress(rr) {
  const i = rankFromRr(rr);
  const rank = RANKS[i], next = RANKS[i + 1] || null;
  if (!next) return { index: i, rank, next: null, into: 1, need: 1, pct: 100 };
  const into = rr - rank.rr, need = next.rr - rank.rr;
  return { index: i, rank, next, into, need, pct: Math.round(into / need * 100) };
}

/**
 * RR change for a match (R-RNK-2: "based on all features").
 * Winning matters most, but kills, assists, objective score and your
 * current streak all feed in — so a strong loss costs less.
 */
export function rrForMatch({ won, kills = 0, assists = 0, score = 0, streak = 0 }) {
  let rr = won ? 25 : -18;
  rr += Math.min(15, kills * 1.5);        // performance
  rr += Math.min(6, assists * 2);
  rr += Math.min(8, score / 10);          // objective work (captures, points)
  if (won) rr += Math.min(10, streak * 2); // streak bonus on top
  return Math.round(rr);
}

// ---------- WIN STREAK (R-RNK-4) ----------
// Bonus coins AND tougher enemies. Resets ONLY on a match loss.
export const STREAK = {
  coinsPerWin: 10,      // extra coins per streak step
  maxCoinBonus: 100,
  hardenAt: [2, 4, 6],  // streak counts that bump enemy difficulty a tier
};
export function streakBonusCoins(streak) {
  return Math.min(STREAK.maxCoinBonus, Math.max(0, streak - 1) * STREAK.coinsPerWin);
}
/** How many difficulty tiers the streak adds. */
export function streakHardening(streak) {
  return STREAK.hardenAt.filter(n => streak >= n).length;
}

// ---------- NEW-PLAYER PROTECTION (R-RNK-3) ----------
// Low level + low rank players are shielded from the hardest AI.
export const PROTECT = { untilLevel: 5, untilRankIndex: 4 };  // through Bronze I
export function isProtected(level, rankIndex) {
  return level < PROTECT.untilLevel && rankIndex <= PROTECT.untilRankIndex;
}

// ---------- SKINS / WRAPPERS (R-PRG-4, R-RNK-2) ----------
// Purely cosmetic. You earn one at every rank-up; a few more come from levels.
export const RARITY = {
  common:    { name: "Common",    color: "#9fb0c2", order: 0 },
  rare:      { name: "Rare",      color: "#4a9dff", order: 1 },
  epic:      { name: "Epic",      color: "#b06bff", order: 2 },
  legendary: { name: "Legendary", color: "#ffb038", order: 3 },
  mythic:    { name: "Mythic",    color: "#ff5ac8", order: 4 },
};

// `from` records how it is earned: "start" | "rank:<key>" | "level:<n>"
export const SKINS = {
  standard:  { name: "Standard",     rarity: "common",    color: 0x23262c, from: "start" },
  // --- Bronze rank-ups → Common ---
  woodland:  { name: "Woodland",     rarity: "common",    color: 0x4a5a38, from: "rank:bronze4" },
  sand:      { name: "Desert Tan",   rarity: "common",    color: 0xb09a6d, from: "rank:bronze3" },
  slate:     { name: "Slate",        rarity: "common",    color: 0x4b535c, from: "rank:bronze2" },
  rust:      { name: "Rust",         rarity: "common",    color: 0x7a4630, from: "rank:bronze1" },
  // --- Silver rank-ups → Rare ---
  arctic:    { name: "Arctic",       rarity: "rare",      color: 0xd6e4ee, from: "rank:silver4" },
  navy:      { name: "Deep Navy",    rarity: "rare",      color: 0x22364f, from: "rank:silver3" },
  jade:      { name: "Jade",         rarity: "rare",      color: 0x2f6f5a, from: "rank:silver2" },
  crimson:   { name: "Crimson",      rarity: "rare",      color: 0x7c2230, from: "rank:silver1" },
  // --- Gold rank-ups → Epic ---
  goldleaf:  { name: "Gold Leaf",    rarity: "epic",      color: 0xd4a52a, from: "rank:gold3" },
  obsidian:  { name: "Obsidian",     rarity: "epic",      color: 0x14161a, from: "rank:gold2" },
  amethyst:  { name: "Amethyst",     rarity: "epic",      color: 0x6b3fa0, from: "rank:gold1" },
  // --- Diamond rank-ups → Legendary ---
  glacier:   { name: "Glacier",      rarity: "legendary", color: 0x5fc9e8, from: "rank:diamond2" },
  solarflare:{ name: "Solar Flare",  rarity: "legendary", color: 0xff7a1a, from: "rank:diamond1" },
  // --- Ultra Master → Mythic ---
  ultraviolet:{ name: "Ultraviolet", rarity: "mythic",    color: 0xff4ad2, from: "rank:ultra" },
  // --- level-gated wrappers (R-PRG-1) ---
  urban:     { name: "Urban Grid",   rarity: "rare",      color: 0x5a6470, from: "level:5" },
  viper:     { name: "Viper",        rarity: "epic",      color: 0x2f8f3f, from: "level:10" },
  phantom:   { name: "Phantom",      rarity: "legendary", color: 0x2a2350, from: "level:18" },
};
export const SKIN_KEYS = Object.keys(SKINS);

/** The skin awarded for reaching a rank, if any. */
export function skinForRank(rankKey) {
  return SKIN_KEYS.find(k => SKINS[k].from === `rank:${rankKey}`) || null;
}
/** Skins unlocked at a given player level. */
export function skinsForLevel(level) {
  return SKIN_KEYS.filter(k => SKINS[k].from === `level:${level}`);
}

// ---------- GAME MODES (R-MOD-1..4) ----------
// respawn:false = elimination (you do NOT respawn — Solo/Team Deathmatch, S&D, BR)
// bombSites: bomb sites exist on the map in most modes — NOT in FFA or CTF (R-MOD-4)
// objective: which objective system runs (see objectives.js)
export const MODES = {
  team: {
    key: "team", name: "Team Battle", teams: true, respawn: true,
    target: 30, objective: null, bombSites: true,
    desc: "Two squads, endless respawns. First to 30 kills.",
  },
  tdm: {
    key: "tdm", name: "Team Deathmatch", teams: true, respawn: false,
    objective: null, bombSites: true,
    desc: "No respawns. Wipe the enemy squad to win.",
  },
  ffa: {
    key: "ffa", name: "Free For All", teams: false, respawn: true,
    target: 20, objective: null, bombSites: false, uncapped: true,
    desc: "Everyone for themselves. No player limit. First to 20 kills.",
  },
  sdm: {
    key: "sdm", name: "Solo Deathmatch", teams: false, respawn: false,
    objective: null, bombSites: true,
    desc: "No respawns, no allies. Last one standing.",
  },
  ctf: {
    key: "ctf", name: "Capture the Flag", teams: true, respawn: true,
    target: 3, objective: "flags", bombSites: false,
    desc: "Grab the enemy flag, run it home. First to 3 captures.",
  },
  dom: {
    key: "dom", name: "Domination", teams: true, respawn: true,
    target: 200, objective: "domination", bombSites: true,
    desc: "Hold points A, B and C to tick up score. First to 200.",
  },
  snd: {
    key: "snd", name: "Search & Destroy", teams: true, respawn: false,
    objective: "bomb", bombSites: true,
    desc: "No respawns. Plant the bomb at A or B — or defuse it.",
  },
  gun: {
    key: "gun", name: "Gun Game", teams: false, respawn: true,
    objective: "gunladder", bombSites: true,
    desc: "Every kill upgrades your weapon. Finish the ladder to win.",
  },
  br: {
    key: "br", name: "Battle Royale", teams: false, respawn: false,
    objective: "zone", bombSites: true, uncapped: true,
    desc: "No respawns. The safe zone shrinks. Last one alive wins.",
  },
  wave: {
    key: "wave", name: "Wave Survival (Co-op)", teams: true, respawn: true,
    objective: "waves", bombSites: true, coop: true,
    desc: "Co-op vs endless waves that keep getting harder.",
  },
  range: {
    key: "range", name: "Shooting Range", teams: false, respawn: true,
    target: 0, objective: null, bombSites: false, practice: true,
    desc: "Solo practice. Infinite ammo, no damage — test every gun on static targets.",
  },
};
export const MODE_KEYS = Object.keys(MODES);

// Gun Game ladder — each kill moves you to the next weapon (R-MOD-1)
export const GUN_LADDER = ["pistol", "smg", "shotgun", "rifle", "burst", "lmg", "revolver", "sniper", "knife"];

// ---------- MAPS (R-MAP-1/2/3/4) ----------
// prop      : visual style of cover ("crates" | "trees" | "buildings" | "rocks")
// destructible: fraction of props that can be shot apart (R-MAP-3)
// vehicles  : scenery vehicles — solid cover, NOT rideable (R-MAP-4)
// ziplines  : rideable ziplines — forest only (R-MAP-4)
// `neon` (R-MAP-6): a near-future accent color used for trim lighting on walls,
// lane dividers, and holo-drones — gives each expanded map its own sci-fi
// signature without changing its base palette.
export const MAPS = {
  compound: {
    key: "compound", name: "Compound",
    ground: 0x5c6b52, sky: 0x9fb8c9, grid: [0x35402f, 0x475239], fog: [60, 220],
    coverCount: 26, coverScale: 1.0, palette: [0x8a6a3f, 0x6f7b63, 0x7a5233, 0x566072],
    prop: "crates", destructible: 0.5, vehicles: 3, ziplines: 0, surface: "dirt",
    neon: 0x39e6ff,
    desc: "Open military ground with crates and parked vehicles. Balanced.",
  },
  warehouse: {
    key: "warehouse", name: "Warehouse",
    ground: 0x4a4a52, sky: 0x6f7784, grid: [0x2f3138, 0x3d4049], fog: [40, 150],
    coverCount: 40, coverScale: 1.25, palette: [0x7d6444, 0x5a6470, 0x8a5a34, 0x49525c],
    prop: "crates", destructible: 0.7, vehicles: 1, ziplines: 0, surface: "metal",
    neon: 0xffa63c,
    desc: "Dense stacked crates, tight lanes. Most cover can be shot apart.",
  },
  dunes: {
    key: "dunes", name: "Dunes",
    ground: 0xb8a074, sky: 0xdcc9a0, grid: [0x8f7c56, 0xa08c62], fog: [90, 300],
    coverCount: 14, coverScale: 1.5, palette: [0xc2a878, 0xa8905f, 0xd0bb8c, 0x94805a],
    prop: "rocks", destructible: 0.2, vehicles: 2, ziplines: 0, surface: "sand",
    neon: 0xff6a3c,
    desc: "Wide open sand, long sightlines. Sniper country.",
  },
  forest: {
    key: "forest", name: "Forest",
    ground: 0x3d5134, sky: 0x93b4a2, grid: [0x2b3a25, 0x36492e], fog: [45, 190],
    coverCount: 34, coverScale: 1.0, palette: [0x5b432c, 0x6a4f33, 0x4e3a26, 0x60482f],
    prop: "trees", destructible: 0.6, vehicles: 2, ziplines: 3, surface: "dirt",
    neon: 0x39ff8f,
    desc: "Dense woods with RIDEABLE ZIPLINES. Trees can be shot down.",
  },
  snowfield: {
    key: "snowfield", name: "Snowfield",
    ground: 0xdfe7ee, sky: 0xcdd8e2, grid: [0xb4c2cd, 0xc6d2dc], fog: [50, 200],
    coverCount: 20, coverScale: 1.3, palette: [0xa8b4bf, 0xbcc7d1, 0x94a1ad, 0xcfd8e0],
    prop: "rocks", destructible: 0.35, vehicles: 2, ziplines: 0, surface: "snow",
    neon: 0x6ad4ff,
    desc: "Frozen open ground. Bright, exposed, cold.",
  },
  city: {
    key: "city", name: "City",
    ground: 0x54565c, sky: 0x8a919b, grid: [0x3a3c42, 0x4a4d54], fog: [40, 170],
    coverCount: 26, coverScale: 1.4, palette: [0x7a6f63, 0x6b7079, 0x87796a, 0x5f6570],
    prop: "buildings", destructible: 0.4, vehicles: 5, ziplines: 0, surface: "metal",
    neon: 0xd23cff,
    desc: "Street fighting between blocks and burnt-out cars.",
  },
  // Private practice map — flat, empty, built for the Shooting Range mode.
  // votable:false keeps it out of the normal map-vote rotation (R-MAP-2).
  range: {
    key: "range", name: "Range",
    ground: 0x6b6558, sky: 0xaecbe0, grid: [0x4a4438, 0x5c5548], fog: [140, 500],
    coverCount: 0, coverScale: 1.0, palette: [0x8a6a3f, 0x6f7b63, 0x7a5233, 0x566072],
    prop: "crates", destructible: 0, vehicles: 0, ziplines: 0, votable: false, surface: "dirt",
    neon: 0xffffff,
    desc: "A private range with static targets at every distance.",
  },
};
export const MAP_KEYS = Object.keys(MAPS).filter(k => MAPS[k].votable !== false);

// ---------- TIME OF DAY (R-MAP-5) ----------
// skyMul/fogMul tint and thicken the map's own palette rather than replacing it.
export const TIMES = {
  dawn:  { key: "dawn",  name: "Dawn",  sun: 1.15, sunColor: 0xffc08a, hemi: 0.75, skyMul: 0.88, ambient: 0xffd9b0 },
  day:   { key: "day",   name: "Day",   sun: 1.60, sunColor: 0xffffff, hemi: 0.90, skyMul: 1.00, ambient: 0xdfefff },
  dusk:  { key: "dusk",  name: "Dusk",  sun: 0.95, sunColor: 0xff9a63, hemi: 0.55, skyMul: 0.70, ambient: 0xffb894 },
  night: { key: "night", name: "Night", sun: 0.30, sunColor: 0x9ab6e8, hemi: 0.28, skyMul: 0.20, ambient: 0x6f86b8 },
};
export const TIME_KEYS = Object.keys(TIMES);

// ---------- WEATHER (R-MAP-5/6) ----------
// sandstorm/storm added so "random" and the mid-match weather drift (R-MAP-6)
// have real variety to pull from, not just the original four.
export const WEATHER = {
  clear:     { key: "clear",     name: "Clear",     particles: null,   count: 0,    fogMul: 1.00, dim: 1.00 },
  rain:      { key: "rain",      name: "Rain",      particles: "rain", count: 2200, fogMul: 0.60, dim: 0.75 },
  fog:       { key: "fog",       name: "Fog",       particles: null,   count: 0,    fogMul: 0.32, dim: 0.85 },
  snow:      { key: "snow",      name: "Snow",      particles: "snow", count: 1400, fogMul: 0.55, dim: 0.90 },
  sandstorm: { key: "sandstorm", name: "Sandstorm", particles: "sand", count: 1800, fogMul: 0.22, dim: 0.60 },
  storm:     { key: "storm",     name: "Storm",     particles: "rain", count: 3200, fogMul: 0.42, dim: 0.55 },
};
export const WEATHER_KEYS = Object.keys(WEATHER);

// ---------- DESTRUCTION (R-MAP-3) ----------
export const PROP_HP = { crates: 120, trees: 160, buildings: 400, rocks: 260, vehicle: 900 };

// ---------- ROLES (R-ROL-1/2) ----------
// Chosen by the player AND assigned to bots. Each plays measurably differently.
// hp        : base health for this role
// speed     : movement multiplier
// engage    : preferred fighting distance (AI), also ADS steadiness hint
// accuracy  : AI hit chance multiplier
// dr        : damage reduction (0.15 = takes 15% less)
// gun       : weapon the AI favours (drives its damage)
export const ROLES = {
  rusher: {
    key: "rusher", name: "Rusher", color: 0xff9040, gun: "smg",
    guns: ["smg", "shotgun", "burst", "smg", "autoshot", "bullpup"],   // close-range spread, weighted toward SMG
    hp: 130, speed: 1.22, engage: 30, accuracy: 0.85, dr: 0,
    desc: "Fast and aggressive. Closes distance, sprints longer.",
    perk: "+22% speed, stamina drains 40% slower",
  },
  sniper: {
    key: "sniper", name: "Sniper", color: 0x9d6bff, gun: "sniper",
    guns: ["sniper", "sniper", "sniper", "burst", "dmr"],   // mostly true sniper, occasional DMR
    hp: 130, speed: 0.88, engage: 75, accuracy: 1.35, dr: 0,
    desc: "Deadly at long range, slow on foot.",
    perk: "Much steadier aim, -45% ADS spread",
  },
  heavy: {
    key: "heavy", name: "Shielded Heavy", color: 0x59d0d0, gun: "lmg",
    guns: ["lmg", "lmg", "shotgun", "smg", "autoshot"],   // mostly LMG, sometimes close-range brawlers
    hp: 230, speed: 0.74, engage: 22, accuracy: 0.8, dr: 0.25,
    desc: "Armour plate soaks punishment. Slow but very hard to kill.",
    perk: "+80 HP, takes 25% less damage",
  },
  medic: {
    key: "medic", name: "Medic", color: 0x6ee87a, gun: "rifle",
    guns: ["rifle", "burst", "smg", "carbine", "dmr"],   // versatile mid-range support
    hp: 150, speed: 1.0, engage: 40, accuracy: 0.9, dr: 0,
    desc: "Regenerates health and revives downed allies fast.",
    perk: "Heals over time, revives 2x faster",
  },
};
export const ROLE_KEYS = Object.keys(ROLES);

// ---------- DIFFICULTY (R-AI-1) ----------
// Weak AI rushes, waits ~3s, then shoots. Strong AI uses cover, flanks, throws grenades.
export const DIFFICULTY = {
  // `mobility` (R-AI-5) scales how often/aggressively bots weave, sprint,
  // crouch, hop, and swap weapons — never zero, so even Recruits stay a
  // little active instead of standing and trading shots like statues.
  recruit: {
    key: "recruit", name: "Recruit", reaction: 3.0, accuracy: 0.7,
    cover: false, flank: false, grenades: false, aggression: 1.0, mobility: 0.4,
    desc: "Rush you, hesitate 3s, then fire.",
  },
  veteran: {
    key: "veteran", name: "Veteran", reaction: 1.1, accuracy: 1.0,
    cover: true, flank: false, grenades: true, aggression: 1.1, mobility: 0.85,
    desc: "Uses cover and throws grenades.",
  },
  elite: {
    key: "elite", name: "Elite", reaction: 0.35, accuracy: 1.3,
    cover: true, flank: true, grenades: true, aggression: 1.25, mobility: 1.3,
    desc: "Takes cover, flanks you, grenades your position.",
  },
};

// ---------- REVIVE (R-AI-3) ----------
export const REVIVE = {
  bleedOut: 20,      // seconds you stay downed before dying for good
  time: 3.0,         // seconds an ally must stand over you
  medicTime: 1.5,    // medics are twice as fast
  range: 3.0,        // how close the reviver must be
  hpOnRevive: 70,    // health you get back
};

// ---------- SLOT TYPES ----------
// Slot 0 = primary, 1 = secondary, 2 = melee, 3 = utility/throwable (R-LDO-2)
export const SLOT_TYPES = ["primary", "secondary", "melee", "utility"];
export const SLOT_LABELS = ["Primary", "Secondary", "Melee", "Utility"];

// ---------- GUNS ----------
// dmg = per bullet. rpm = rounds/min. spread = base inaccuracy. kick = recoil.
export const GUNS = {
  // --- defaults owned at start (R-LDO-1) ---
  rifle:    { name: "Rifle",       slot: 0, dmg: 24, rpm: 640,  mag: 30, reserve: 120, spread: 0.9, reload: 2.0, auto: true,  kick: 0.9, cost: 0,   free: true },
  pistol:   { name: "Pistol",      slot: 1, dmg: 20, rpm: 360,  mag: 12, reserve: 60,  spread: 1.1, reload: 1.4, auto: false, kick: 0.7, cost: 0,   free: true },
  fist:     { name: "Fist",        slot: 2, dmg: 45, rpm: 180,  mag: 1,  reserve: 0,   spread: 0,   reload: 0,   auto: false, kick: 0.3, cost: 0,   free: true, melee: true, range: 2.6 },

  // --- purchasable primaries ---
  smg:      { name: "SMG",         slot: 0, dmg: 10, rpm: 900,  mag: 35, reserve: 140, spread: 1.6, reload: 1.7, auto: true,  kick: 0.6, cost: 260 },
  shotgun:  { name: "Shotgun",     slot: 0, dmg: 13, rpm: 78,   mag: 6,  reserve: 36,  spread: 3.6, reload: 2.6, auto: false, kick: 1.9, cost: 300, pellets: 8 },
  burst:    { name: "Burst Rifle", slot: 0, dmg: 21, rpm: 760,  mag: 30, reserve: 120, spread: 0.8, reload: 2.1, auto: false, kick: 1.0, cost: 350, burst: 3 },
  sniper:   { name: "Sniper",      slot: 0, dmg: 125,rpm: 48,   mag: 5,  reserve: 25,  spread: 0.05,reload: 3.0, auto: false, kick: 2.6, cost: 420, zoom: 4 },
  lmg:      { name: "LMG",         slot: 0, dmg: 19, rpm: 820,  mag: 80, reserve: 240, spread: 1.9, reload: 4.0, auto: true,  kick: 1.2, cost: 720 },
  carbine:  { name: "Carbine",     slot: 0, dmg: 23, rpm: 700,  mag: 28, reserve: 112, spread: 0.85,reload: 1.9, auto: true,  kick: 0.85,cost: 380 },
  dmr:      { name: "DMR",         slot: 0, dmg: 42, rpm: 300,  mag: 20, reserve: 100, spread: 0.4, reload: 2.3, auto: false, kick: 1.4, cost: 520, zoom: 2.5 },
  autoshot: { name: "Auto Shotgun",slot: 0, dmg: 11, rpm: 220,  mag: 10, reserve: 40,  spread: 3.2, reload: 3.0, auto: true,  kick: 1.6, cost: 480, pellets: 7 },
  bullpup:  { name: "Bullpup Rifle", slot: 0, dmg: 20, rpm: 780, mag: 32, reserve: 128, spread: 0.75,reload: 1.8, auto: true, kick: 0.8, cost: 400 },

  // --- purchasable secondaries ---
  revolver: { name: "Revolver",    slot: 1, dmg: 58, rpm: 150,  mag: 6,  reserve: 30,  spread: 0.9, reload: 2.2, auto: false, kick: 1.6, cost: 240 },
  machinep: { name: "Machine Pistol", slot: 1, dmg: 12, rpm: 1000, mag: 24, reserve: 96, spread: 2.2, reload: 1.5, auto: true, kick: 0.7, cost: 300 },
  tacpistol:{ name: "Tactical Pistol", slot: 1, dmg: 16, rpm: 480, mag: 15, reserve: 75, spread: 1.0, reload: 1.3, auto: false, kick: 0.6, cost: 180 },
  sawedoff: { name: "Sawed-Off",   slot: 1, dmg: 14, rpm: 100,  mag: 2,  reserve: 12,  spread: 4.5, reload: 2.0, auto: false, kick: 2.2, cost: 260, pellets: 8 },

  // --- purchasable melee ---
  knife:    { name: "Combat Knife", slot: 2, dmg: 70, rpm: 300, mag: 1, reserve: 0, spread: 0, reload: 0, auto: false, kick: 0.2, cost: 150, melee: true, range: 2.8 },
  katana:   { name: "Katana",       slot: 2, dmg: 110, rpm: 160, mag: 1, reserve: 0, spread: 0, reload: 0, auto: false, kick: 0.3, cost: 480, melee: true, range: 3.2 },
  axe:      { name: "Combat Axe",   slot: 2, dmg: 95, rpm: 150, mag: 1, reserve: 0, spread: 0, reload: 0, auto: false, kick: 0.25, cost: 320, melee: true, range: 3.0 },
};

// ---------- UTILITIES (slot 4) ----------
// kind drives in-match behavior. `frag` is free/default (R-LDO-1).
export const UTILS = {
  frag:      { name: "Frag Grenade", kind: "frag",   cost: 0,   free: true, uses: 2, dmg: 110, radius: 8,  fuse: 1.6, color: 0x4a5340 },
  smoke:     { name: "Smoke",        kind: "smoke",  cost: 120, uses: 2, dmg: 0,   radius: 9,  fuse: 1.2, life: 12, color: 0x9aa6b2 },
  flash:     { name: "Flashbang",    kind: "flash",  cost: 150, uses: 2, dmg: 0,   radius: 14, fuse: 1.4, color: 0xf0e6c0 },
  molotov:   { name: "Molotov",      kind: "fire",   cost: 200, uses: 2, dmg: 22,  radius: 6,  fuse: 1.0, life: 7,  color: 0xd4622a },
  // `place: true` = gently dropped at your feet (deployables), not hurled downrange.
  healkit:   { name: "Healing Kit",  kind: "heal",   cost: 220, uses: 2, heal: 80, radius: 7,  fuse: 0.8, color: 0x5ad67a, place: true },
  freeze:    { name: "Freeze Ray",   kind: "freeze", cost: 400, uses: 2, dmg: 10,  radius: 8,  fuse: 1.2, life: 5,  color: 0x74d8ec, level: 4 },
  jumppad:   { name: "Jump Pad",     kind: "pad",    cost: 140, uses: 2, radius: 3, fuse: 0.6, life: 25, color: 0x2fb3a4, place: true },
  shieldwall:{ name: "Deploy Shield",kind: "shield", cost: 300, uses: 1, radius: 3, fuse: 0.5, life: 20, color: 0x4c7fb8, level: 3, place: true },
};

// Utility cooldown between uses — long, ~30s (R-ECO-6)
export const UTIL_COOLDOWN = 30;

// ---------- ATTACHMENTS ----------
// Unlocked mostly by player LEVEL, bought with coins (R-PRG-1/2).
export const ATTACHMENTS = {
  laser:    { name: "Laser Sight",   cost: 140, level: 1, desc: "-30% hipfire spread" },
  grip:     { name: "Foregrip",      cost: 160, level: 2, desc: "-25% recoil" },
  scope:    { name: "Scope",         cost: 150, level: 2, desc: "Zoom + tighter ADS" },
  extmag:   { name: "Extended Mag",  cost: 180, level: 3, desc: "+50% magazine" },
  silencer: { name: "Silencer",      cost: 220, level: 4, desc: "Quiet: enemies notice you later (-8% dmg)" },
};

// ---------- ARMOR ----------
// Player owns none at start (R-ECO-4). Armor soaks damage before health.
export const ARMOR = {
  none:   { name: "No Armor",     value: 0,   cost: 0,   free: true, level: 1 },
  light:  { name: "Light Vest",   value: 50,  cost: 200, level: 1 },
  medium: { name: "Combat Vest",  value: 100, cost: 450, level: 3 },
  heavy:  { name: "Heavy Plate",  value: 150, cost: 800, level: 6 },
};

// ---------- GUN LEVELS (R-PRG-3: stronger guns) ----------
export const MAX_GUN_LEVEL = 5;
// cost to go from level n -> n+1
export const GUN_LEVEL_COST = [100, 200, 350, 550];
export function gunLevelCost(level) { return GUN_LEVEL_COST[level - 1] ?? null; }

// ---------- PLAYER LEVEL / XP (R-ECO-5: much slower than coins) ----------
export const XP = { kill: 4, assist: 2, win: 25 };       // vs coins: kill 5, win 50
export const COINS = { kill: 5, win: 50, teamkillPenalty: 2 };

export function xpForLevel(level) { return 100 + (level - 1) * 80; }

/** Total XP -> {level, into, need} */
export function levelFromXp(totalXp) {
  let level = 1, rest = totalXp;
  while (rest >= xpForLevel(level) && level < 99) { rest -= xpForLevel(level); level++; }
  return { level, into: rest, need: xpForLevel(level) };
}

// ---------- STAT MATH ----------
/** Effective gun stats after gun level + attachments. */
export function gunStats(key, profile) {
  const base = GUNS[key];
  if (!base) return null;
  const lvl = (profile.gunLevels && profile.gunLevels[key]) || 1;
  const atts = (profile.attachments && profile.attachments[key]) || [];

  let dmg = base.dmg * (1 + 0.06 * (lvl - 1));     // +6% dmg per level
  let kick = base.kick * (1 - 0.08 * (lvl - 1));   // -8% recoil per level
  let spread = base.spread;
  let mag = base.mag;
  let zoom = base.zoom || 1;

  if (atts.includes("extmag")) mag = Math.round(mag * 1.5);
  if (atts.includes("grip")) kick *= 0.75;
  if (atts.includes("laser")) spread *= 0.7;
  if (atts.includes("scope")) { zoom = Math.max(zoom, 2.5); spread *= 0.85; }
  if (atts.includes("silencer")) dmg *= 0.92;

  return {
    ...base,
    dmg, kick, spread, mag, zoom,
    level: lvl,
    silenced: atts.includes("silencer"),
  };
}
