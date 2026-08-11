// FRONTLINE — player profile: persistence + purchases (R-SAV-1, R-ECO-3)
// Saves locally by default. `syncCloud` is the seam Phase 7 swaps for real accounts.
import { GUNS, UTILS, ATTACHMENTS, ARMOR, MAX_GUN_LEVEL, gunLevelCost, levelFromXp, XP,
         RANKS, SKINS, rankFromRr, rankProgress, rrForMatch, skinForRank, skinsForLevel,
         streakBonusCoins, isProtected } from "./data.js";

const KEY = "fl_profile_v2";

function defaults() {
  // Everything not free must be bought (R-LDO-4).
  const ownedGuns = Object.keys(GUNS).filter(k => GUNS[k].free);
  const ownedUtils = Object.keys(UTILS).filter(k => UTILS[k].free);
  return {
    coins: 0,
    xp: 0,
    ownedGuns,                       // ["rifle","pistol","fist"]
    ownedUtils,                      // ["frag"]
    ownedArmor: ["none"],
    armor: "none",                   // equipped armor tier
    gunLevels: {},                   // key -> 1..5
    attachments: {},                 // gunKey -> [attachmentKey]
    ownedAttachments: {},            // gunKey -> [attachmentKey] (purchased)
    loadout: ["rifle", "pistol", "fist", "frag"],   // R-LDO-1
    stats: { kills: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 },
    // ranked meta (R-RNK)
    rr: 0,
    ownedSkins: ["standard"],
    skin: "standard",
    cloud: false,
  };
}

export const profile = load();
// keep unlocks consistent with rank/level whenever the profile is loaded
queueMicrotask(() => reconcileUnlocks());

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // migrate Phase 1 coins if present
      const old = Number(localStorage.getItem("fl_coins") || 0);
      if (old) base.coins = old;
      return base;
    }
    const saved = JSON.parse(raw);
    return { ...base, ...saved, stats: { ...base.stats, ...(saved.stats || {}) } };
  } catch {
    return base;
  }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {}
  if (profile.cloud) syncCloud();
}

/** Phase 7 seam: replace with a real account sync. */
function syncCloud() { /* no-op until online accounts ship */ }

export function setCloud(on) { profile.cloud = !!on; save(); }

// ---------- level ----------
export function level() { return levelFromXp(profile.xp).level; }
export function levelProgress() { return levelFromXp(profile.xp); }

export function addXp(n) { profile.xp += n; save(); }
export function addCoins(n) { profile.coins = Math.max(0, profile.coins + n); save(); }

// ---------- ownership ----------
export function ownsGun(k) { return profile.ownedGuns.includes(k); }
export function ownsUtil(k) { return profile.ownedUtils.includes(k); }
export function ownsArmor(k) { return profile.ownedArmor.includes(k); }
export function ownsAttachment(gun, a) { return (profile.ownedAttachments[gun] || []).includes(a); }
export function gunLevel(k) { return profile.gunLevels[k] || 1; }

/** Result helper */
const ok = (msg) => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

// ---------- purchases (R-ECO-3 permanent) ----------
export function buyGun(k) {
  const g = GUNS[k];
  if (!g) return no("Unknown weapon");
  if (ownsGun(k)) return no("Already owned");
  if (profile.coins < g.cost) return no(`Need ${g.cost - profile.coins} more coins`);
  profile.coins -= g.cost;
  profile.ownedGuns.push(k);
  save();
  return ok(`Bought ${g.name}`);
}

export function buyUtil(k) {
  const u = UTILS[k];
  if (!u) return no("Unknown item");
  if (ownsUtil(k)) return no("Already owned");
  if (u.level && level() < u.level) return no(`Unlocks at level ${u.level}`);
  if (profile.coins < u.cost) return no(`Need ${u.cost - profile.coins} more coins`);
  profile.coins -= u.cost;
  profile.ownedUtils.push(k);
  save();
  return ok(`Bought ${u.name}`);
}

export function buyArmor(k) {
  const a = ARMOR[k];
  if (!a) return no("Unknown armor");
  if (ownsArmor(k)) return no("Already owned");
  if (level() < a.level) return no(`Unlocks at level ${a.level}`);
  if (profile.coins < a.cost) return no(`Need ${a.cost - profile.coins} more coins`);
  profile.coins -= a.cost;
  profile.ownedArmor.push(k);
  profile.armor = k;                 // auto-equip the new armor
  save();
  return ok(`Bought ${a.name}`);
}

export function equipArmor(k) {
  if (!ownsArmor(k)) return no("Not owned");
  profile.armor = k; save();
  return ok(`Equipped ${ARMOR[k].name}`);
}

/** Upgrade a gun's level — makes it stronger (R-PRG-3). */
export function buyGunLevel(k) {
  if (!ownsGun(k)) return no("Buy the weapon first");
  const lvl = gunLevel(k);
  if (lvl >= MAX_GUN_LEVEL) return no("Max level");
  const cost = gunLevelCost(lvl);
  if (profile.coins < cost) return no(`Need ${cost - profile.coins} more coins`);
  profile.coins -= cost;
  profile.gunLevels[k] = lvl + 1;
  save();
  return ok(`${GUNS[k].name} → Lv${lvl + 1}`);
}

/** Attachments: gated mostly by player level, paid with coins (R-PRG-1/2). */
export function buyAttachment(gun, a) {
  const att = ATTACHMENTS[a];
  if (!att) return no("Unknown attachment");
  if (!ownsGun(gun)) return no("Buy the weapon first");
  if (GUNS[gun].melee) return no("Melee takes no attachments");
  if (ownsAttachment(gun, a)) return no("Already owned");
  if (level() < att.level) return no(`Unlocks at level ${att.level}`);
  if (profile.coins < att.cost) return no(`Need ${att.cost - profile.coins} more coins`);
  profile.coins -= att.cost;
  (profile.ownedAttachments[gun] ||= []).push(a);
  (profile.attachments[gun] ||= []).push(a);   // auto-equip
  save();
  return ok(`${att.name} on ${GUNS[gun].name}`);
}

export function toggleAttachment(gun, a) {
  if (!ownsAttachment(gun, a)) return no("Not owned");
  const list = (profile.attachments[gun] ||= []);
  const i = list.indexOf(a);
  if (i >= 0) list.splice(i, 1); else list.push(a);
  save();
  return ok("Updated");
}
export function attachmentEquipped(gun, a) { return (profile.attachments[gun] || []).includes(a); }

// ---------- loadout (R-LDO-3: takes effect on spawn) ----------
export function setLoadoutSlot(slot, key) {
  if (slot === 3) {
    if (!ownsUtil(key)) return no("Not owned");
  } else {
    if (!ownsGun(key)) return no("Not owned");
    if (GUNS[key].slot !== slot) return no("Wrong slot type");
  }
  profile.loadout[slot] = key;
  save();
  return ok("Loadout updated");
}

// ---------- ranked (R-RNK) ----------
export function rankIndex() { return rankFromRr(profile.rr); }
export function rank() { return RANKS[rankIndex()]; }
export function rankInfo() { return rankProgress(profile.rr); }
/** New players are shielded from the hardest AI (R-RNK-3). */
export function protectedPlayer() { return isProtected(level(), rankIndex()); }

// ---------- skins (cosmetic only — R-PRG-4) ----------
export function ownsSkin(k) { return profile.ownedSkins.includes(k); }
export function grantSkin(k) {
  if (!k || ownsSkin(k)) return false;
  profile.ownedSkins.push(k);
  save();
  return true;
}
export function equipSkin(k) {
  if (!ownsSkin(k)) return no("Not unlocked yet");
  profile.skin = k; save();
  return ok(`Equipped ${SKINS[k].name}`);
}
export function skinColor() {
  const s = SKINS[profile.skin] || SKINS.standard;
  return s.color;
}

/** Award any skins the player's current level has unlocked. */
function grantLevelSkins() {
  const got = [];
  for (let l = 1; l <= level(); l++) {
    for (const k of skinsForLevel(l)) if (grantSkin(k)) got.push(k);
  }
  return got;
}

/**
 * Make owned skins match what the player's rank and level have earned.
 * Runs at load so a restored save (or one from an older version) can't end up
 * sitting at Gold with no Gold skins.
 */
export function reconcileUnlocks() {
  const got = [];
  const upTo = rankIndex();
  for (let i = 0; i <= upTo; i++) {
    const s = skinForRank(RANKS[i].key);
    if (grantSkin(s)) got.push(s);
  }
  got.push(...grantLevelSkins());
  if (!ownsSkin(profile.skin)) profile.skin = "standard";
  if (got.length) save();
  return got;
}

/**
 * Resolve a finished match.
 * Returns a summary the UI can celebrate: RR change, rank-up, new skins, streak.
 */
export function recordMatch(won, perf = {}) {
  const before = { rank: rankIndex(), level: level() };
  const streakBefore = profile.stats.streak;

  const delta = rrForMatch({
    won,
    kills: perf.kills || 0,
    assists: perf.assists || 0,
    score: perf.score || 0,
    streak: streakBefore,
  });
  profile.rr = Math.max(0, profile.rr + delta);

  let bonusCoins = 0;
  if (won) {
    profile.stats.wins++;
    profile.stats.streak++;
    profile.stats.bestStreak = Math.max(profile.stats.bestStreak || 0, profile.stats.streak);
    addCoins(50);                                   // R-ECO-1
    bonusCoins = streakBonusCoins(profile.stats.streak);   // R-RNK-4 streak pays extra
    if (bonusCoins) addCoins(bonusCoins);
    addXp(XP.win);
  } else {
    profile.stats.losses++;
    profile.stats.streak = 0;   // resets ONLY on a loss (R-RNK-4)
  }

  // rank-ups grant that rank's exclusive skin (R-RNK-2)
  const after = rankIndex();
  const newSkins = [];
  if (after > before.rank) {
    for (let i = before.rank + 1; i <= after; i++) {
      const s = skinForRank(RANKS[i].key);
      if (grantSkin(s)) newSkins.push(s);
    }
  }
  newSkins.push(...grantLevelSkins());

  save();
  return {
    won,
    rrDelta: delta,
    rr: profile.rr,
    rankedUp: after > before.rank,
    rankedDown: after < before.rank,
    rank: RANKS[after],
    prevRank: RANKS[before.rank],
    newSkins,
    streak: profile.stats.streak,
    bonusCoins,
    leveledUp: level() > before.level,
  };
}

export function resetProfile() {
  const d = defaults();
  Object.keys(profile).forEach(k => delete profile[k]);
  Object.assign(profile, d);
  save();
}
