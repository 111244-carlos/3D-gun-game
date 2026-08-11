# FRONTLINE — Specification-Driven Development

> A realistic, team-based 3D soldier shooter. Built with Three.js (WebGL), ES modules, no build step.
> This document is the single source of truth. Code is written to satisfy the numbered requirements below.

- **Working title:** FRONTLINE
- **Owner:** 111244@st.fhjh.tp.edu.tw
- **Spec date:** 2026-07-25
- **Status:** Phases 1–5 ✅ complete · Phase 6 next

---

## 0. How to read this spec

Every requirement has an ID like `R-COMBAT-3`. Each has an **acceptance criterion** — a testable statement
that must be true for the requirement to be "done". Work is grouped into **Phases** (Section 12) so the game is
playable early and grows in vertical slices. A requirement is only marked ✅ when its acceptance test passes in the
browser.

Legend: ✅ done · 🟡 partial · ⬜ not started

---

## 1. Vision & Pillars

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-VIS-1 | Realistic team-based soldier shooter; realism is the top priority. | Art, movement, damage, and audio all lean realistic (not cartoon/arcade-floaty). |
| R-VIS-2 | Supports Single-player, Co-op vs AI, and Online multiplayer (multiplayer is a later phase). | Menu lists all three; SP & Co-op playable; MP stubbed with clear "coming soon". |
| R-VIS-3 | Player boots into a **main menu** and chooses mode, settings, and votes on a map. | First screen after load is the menu, never a match. |

## 2. Combat & Health

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-CMB-1 | Player has **150 HP** with a visible health bar. | HUD shows `HP 150/150`; bar shrinks as damaged. |
| R-CMB-2 | Bullets hit hard — a few solid hits kill (e.g. SMG ≈ 10 dmg/shot). | Killing an enemy takes only a handful of hits, not dozens. |
| R-CMB-3 | Moving/jumping reduces accuracy; ADS (aim-down-sights) improves it. | Crosshair spread grows while moving/jumping, shrinks while ADS & still. |
| R-CMB-4 | **Friendly fire is ON.** Teammates can die; hitting them costs coins. | Shooting a teammate deals damage and deducts coins. |
| R-CMB-5 | Directional hit feedback: when shot, show **where** it came from. | A red arc/indicator points toward the shooter for ~1s. |
| R-CMB-6 | Kill feedback: **hitmarker** + **coins popping up**. | On kill, an X hitmarker flashes and a `+5` floats up. |

## 3. Respawn

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-RSP-1 | Each team has an **indestructible respawn point**; it cannot be broken. | Respawn zones take no damage and never disappear. |
| R-RSP-2 | On respawn the player spawns with their **bought loadout**, or a **pistol** if nothing bought. | Fresh account with no purchases spawns holding a pistol. |
| R-RSP-3 | Respawn wait is **5–10s** in most modes; **no respawn** in Solo/Team Deathmatch. | Respawn timer counts down in TDM-style/FFA/CTF; DM modes end the player's round on death. |

## 4. Loadout — 4 Weapon Slots

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-LDO-1 | Exactly **4 equipped slots**. Default owned at start: 1) Rifle, 2) Pistol, 3) Fist, 4) Grenade. | New player has those 4 and nothing else. |
| R-LDO-2 | **Slot 4 is a flexible utility/throwable** slot: smoke, flashbang, frag, molotov⭐, healing kit⭐, freeze ray, jump pad, deployable shield, etc. | Slot 4 can be swapped among any owned utility. |
| R-LDO-3 | Loadout can be **changed on respawn** (and in menu); switching mid-life is limited to the 4 equipped. | Changing loadout only takes effect at next spawn. |
| R-LDO-4 | Everything beyond the 4 defaults must be **bought**. | Locked items show a coin price and can't be equipped until purchased. |

## 5. Roles

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-ROL-1 | Both **players and enemies** choose a role: **Rusher, Sniper, Shielded Heavy, Medic**. | Role selectable for player; enemies spawn with assigned roles. |
| R-ROL-2 | Each role has distinct behavior/stats (speed, HP, weapon bias, ability). | The four roles feel measurably different in play. |

## 6. Economy (Coins & XP)

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-ECO-1 | Coins: **+5 per kill**, **+50 per win**, plus assists. | Kill grants 5; winning a match grants 50. |
| R-ECO-2 | **No coin loss** on death or losing — **except friendly fire**. | Dying/losing never reduces coins; teamkilling does. |
| R-ECO-3 | Purchases are **permanent** (buy once, own forever). | Owned items stay owned across matches/sessions. |
| R-ECO-4 | Coins buy: guns, **armor** (none owned at start), **gun levels** (stronger), **attachments**, and **skins/wrappers**. | Each category purchasable in the shop. |
| R-ECO-5 | **XP/levels** earned from kills/wins/assists, **much slower** than coins. | XP per action is a small fraction of coin gain. |
| R-ECO-6 | Utility items have a **long cooldown (~30s)** between uses. | After using a utility, it's unavailable ~30s. |

## 7. Progression, Attachments, Skins

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-PRG-1 | **Player level** (not gun/item level) unlocks attachments & wrappers — mostly via levels, some coins. | High-tier attachments gated behind player level. |
| R-PRG-2 | **Attachments** exist: scopes, bigger magazines, silencers, etc. Guns are NOT fixed — they can be modified. | At least scope + mag + silencer implemented. |
| R-PRG-3 | **Gun levels make the gun stronger** (more damage / less recoil). | Leveling a gun measurably improves it. |
| R-PRG-4 | **Skins/wrappers** in tiers: Common / Rare / Epic / Legendary / **Mythic**, **cosmetic only**. | Skins change appearance, never stats. |

## 8. Ranked, Win Streak, Matchmaking

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-RNK-1 | Ranks (low→high): Bronze 5,4,3,2,1 · Silver 4,3,2,1 · Gold 3,2,1 · Diamond 2,1 · **Ultra Master**. | Rank ladder implemented in that exact order. |
| R-RNK-2 | Rank is based on all features (wins, performance, skill). Each **rank-up unlocks a new skin**. | Reaching a new rank grants an exclusive skin. |
| R-RNK-3 | **New players get protected/better matchmaking.** | Low-level players matched away from veterans. |
| R-RNK-4 | **Win streak:** each consecutive win gives **bonus coins** and spawns **tougher enemies**; **resets only on a match loss** (not on death/draw). | Streak counter rises per win, zeroes on loss. |

## 9. Game Modes

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-MOD-1 | Support as many modes as possible: Team Deathmatch, Free-for-All, Capture the Flag, Solo Deathmatch, Domination, Search & Destroy, Gun Game, Zombies/Wave Survival, Battle Royale. | Menu lists them; each has rules defined here. |
| R-MOD-2 | **FFA has no player cap.** Other modes are player-chosen from **5v5 down to 1v1**. | Team-size selector ranges 1–5 per side; FFA uncapped. |
| R-MOD-3 | **Co-op vs AI = endless scaling waves.** | Waves never end; each wave is harder. |
| R-MOD-4 | **Bomb sites** appear in most modes (not FFA/CTF). **CTF has flags.** No flags in other modes. | Bomb sites/flags placed per the rule. |

## 10. Maps & Environment

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-MAP-1 | All settings: city, military base, desert, forest, warehouse, snow, etc. | At least 3 distinct map themes at launch. |
| R-MAP-2 | Players **vote** on the map before a match. | Pre-match vote screen picks the winner. |
| R-MAP-3 | Environments are **destructible**. | Certain props/walls break under fire/explosions. |
| R-MAP-4 | Vehicles exist but **cannot be ridden**, EXCEPT **ziplines in forest maps**. | Vehicles are scenery/cover; forest ziplines are usable. |
| R-MAP-5 | **Day/night & weather can change** the look/play of maps. | A map can load in different lighting/weather. |

## 11. Movement, Controls, AI, Sound, HUD, Save

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R-MOV-1 | Walk **WASD**, Run **WASD+Shift**, Jump **Space**, Slide **WASD+C**. | Each input performs its action. |
| R-MOV-2 | Movement feel is **fast** (arcade-fast, not sluggish). | Player crosses the map quickly and responsively. |
| R-MOV-3 | **Stamina drains and recharges fast**; affects sprinting. | Sprint drains a stamina bar that refills quickly. |
| R-CTL-1 | A **button toggles Mobile vs PC** control schemes. | Switching shows touch controls (mobile) or KB+M (PC). |
| R-AI-1 | Enemy AI **scales with difficulty**: strong → take cover, flank, throw grenades; weak → rush, wait ~3s, then shoot. | Behavior differs by difficulty setting. |
| R-AI-2 | Enemy roles: rusher, sniper, shielded heavy, medic (see R-ROL). | Enemies exhibit role behavior. |
| R-AI-3 | AI teammates revive you, follow orders, capture objectives on their own (and can die). | Teammate bots act usefully and are mortal. |
| R-AI-4 | **Chat box** (Enter to open); teammates read & respond to commands ("attack", "defend", "regroup"). **No leaders.** | Typing a command redirects teammate bots. |
| R-AI-5 | Enemies **shoot silently** (no scripted alert shout), but the player still gets directional hit feedback. | No alert barks; R-CMB-5 still fires. |
| R-SND-1 | Realistic audio. **Footsteps audible only when someone (ally or enemy) is near.** | Footstep sound scales with proximity, silent at distance. |
| R-SND-2 | Manual reloads; ammo is finite — you can **run out** and must **pick up bullets**. | Reload consumes reserve ammo; ground/crate pickups refill. |
| R-HUD-1 | HUD always shows: **Health, Ammo, Mini-map, Crosshair**. | All four visible during a match. |
| R-SAV-1 | Save **both**: local device by default + optional **online account** (cloud sync) via a **button**. | Progress persists locally; a "Sign in" button offers cloud sync. |

## 12. Phased Roadmap (build order)

Each phase is a playable milestone. Do not start a later phase until the earlier one's acceptance tests pass.

### Phase 1 — Playable Core  ✅ COMPLETE
Goal: you can move, shoot, fight enemies, die, respawn, earn coins, read the HUD.
- R-VIS-3 menu, R-MOV-1/2/3 movement+stamina, pointer-lock mouse look
- R-CMB-1/2/3/5/6 combat + health + spread + hit/kill feedback
- R-SND-2 reload/ammo/pickup, R-HUD-1 HUD (health/ammo/minimap/crosshair)
- R-RSP-1/2/3 respawn points + timer, basic enemy AI (rush→wait→shoot), one map
- Modes present: **Team Deathmatch**, **Free-for-All**, **Wave Survival (Co-op)**

### Phase 2 — Loadout, Shop & Economy  ✅ COMPLETE
- ✅ R-LDO-1..4 four slots + default kit (rifle/pistol/fist/frag), slot-type validation
- ✅ R-ECO-1..6 coins (+5 kill / +50 win), XP (+4 kill / +25 win — much slower), 30s utility cooldown
- ✅ Armory UI, 5 tabs: Loadout · Weapons · Utility · Upgrade · Armor
- ✅ R-ECO-4 buy guns (11), armor (3 tiers), gun levels, attachments
- ✅ R-PRG-2/3 attachments (laser/grip/scope/extmag/silencer) + gun levels 1–5 (stronger)
- ✅ R-PRG-1 player level gates attachments/armor/utilities
- ✅ R-LDO-2 utilities: frag, smoke, flash, molotov, healing kit, freeze ray, jump pad, deploy shield
- ✅ R-CMB-4 friendly-fire coin penalty; melee, shotgun pellets, burst fire
- ✅ R-SAV-1 local save (`fl_profile_v2`) + cloud-sync toggle stub

**Phase 2 verification notes**
- Fixed during verification: healing kit/jump pad/shield were thrown ~25m downrange, so you could
  never use your own deployable. They now drop at your feet (`place: true`); heal confirmed +80 HP.
- Verified numerically: purchase math, level gating, gun Lv1→3 (dmg 24→26.9, recoil 0.9→0.76),
  extended mag 30→45, armor 65% soak before health, molotov burn, frag 107 dmg at center,
  30s cooldown blocking a second throw, persistence across reload.

### Phase 3 — Roles, Smarter AI, Teammates & Chat  ✅ COMPLETE
- ✅ R-ROL-1/2 four roles for **players and bots**: Rusher (130hp, +22% speed, slow stamina drain),
  Sniper (steady ADS, long engage), Shielded Heavy (230hp, 25% damage reduction), Medic (regen, 2× revive)
- ✅ R-AI-1 three difficulty tiers — Recruit (rush, hesitate 3s, fire) · Veteran (cover + grenades) ·
  Elite (cover + flanking + grenades, 0.35s reaction)
- ✅ Cover system: 92 cover points auto-derived from map geometry, LOS raycasts, **smoke blocks AI vision**
- ✅ R-AI-3 teammate bots revive you, follow orders, medics heal nearby allies passively
- ✅ Downed/revive: lethal damage puts you **down** (20s bleed-out) if a teammate lives; they path in and
  revive you to 70 HP. You revive downed allies by holding **E**. No teammates = straight death.
- ✅ R-AI-4 chat box (**Enter**) — attack / defend / regroup / fall back / revive; teammates reply and
  change behavior. No leaders: any command works.
- ✅ Role stripe on helmets so you can read a soldier's role at a glance

**Phase 3 verification notes**
- Fixed during verification: a name collision (`ROLES` declared in game.js *and* imported from data.js)
  broke the whole module load — caught immediately and removed.
- Measured, not assumed: Recruit AI = 0 cover / 0 flank / 0 grenades and never landed a hit in 25s;
  Elite AI = 259 cover-frames, 1181 flank-frames, 4 grenades thrown, first hit at 13.9s.
- Verified: role stats differ, downed→revive returns exactly 70 HP, no-allies dies outright,
  E-revive works, all 5 chat orders parse and physically move teammates
  (regroup 113→~45 units; attack z −60→+11).
- Performance at the heaviest setting (5v5 Elite): **5.16 ms/frame**, inside the 16.7 ms 60fps budget.

### Phase 4 — Full Modes & Objectives  ✅ COMPLETE
- ✅ R-MOD-1 **10 modes**: Team Battle · Team Deathmatch · Free For All · Solo Deathmatch ·
  Capture the Flag · Domination · Search & Destroy · Gun Game · Battle Royale · Wave Survival
- ✅ R-MOD-2 team size 1–5 per side; FFA and Battle Royale are **uncapped** (scale past the limit)
- ✅ R-RSP-3 elimination modes (TDM, Solo DM, S&D, BR) have **no respawns** — you spectate your squad;
  the other six respawn normally
- ✅ R-MOD-4 **bomb sites in 8 of 10 modes — never in FFA or CTF**; **flags only in CTF**;
  control points only in Domination
- ✅ Objectives: CTF flag carry/drop/return/capture · S&D plant (hold E, 3.5s) + 45s fuse + enemy defuse ·
  Domination A/B/C capture & score ticks · BR shrinking safe zone with out-of-zone damage ·
  Gun Game 9-weapon ladder that upgrades on every kill
- ✅ R-MAP-1/2 three maps (Compound / Warehouse / Dunes) with distinct density, palette, fog and sightlines,
  chosen by a **pre-match vote** where your AI squad votes too — they can outvote you
- ✅ Objective HUD banner + objective markers on the minimap

**Phase 4 verification notes**
- Verified per mode: bomb-site/flag/point/zone presence matches R-MOD-4 exactly across all 10 modes;
  respawn vs elimination behaviour correct in all 7 tested.
- Objectives measured: CTF pickup→capture scored 1 and returned the flag, reached the 3-capture target;
  bomb planted (100%, 45s fuse) and was defused by an enemy; Domination captured point B and ticked
  +24 score in 8s; BR zone dealt exactly 42 damage in 3s (14/s as designed); Gun Game advanced pistol→SMG.
- Map rebuild is clean: Compound 28 colliders / Warehouse 44 / Dunes 17, and three consecutive rebuilds
  left the counts stable (no geometry leak).
- All 10 modes ran 8s each on two different maps with **zero runtime errors**.

### Phase 5 — Maps, Destruction, Weather  ✅ COMPLETE
- ✅ R-MAP-1 **6 map themes**: Compound · Warehouse · Dunes · **Forest** · **Snowfield** · **City**,
  each with its own prop style (crates / trees / rocks / buildings), density, palette and fog
- ✅ R-MAP-3 **destructible environment** — props have HP, chip visibly under fire, then shatter into
  debris, dropping their collider *and* their AI cover points so the space genuinely opens up.
  Destructible ratio is per-map (Warehouse 29 breakable, Dunes only 4). Boundary walls never break.
- ✅ R-MAP-4 **vehicles on every map as solid cover but NOT rideable** — pressing E says so;
  **ziplines only on Forest, and they ARE rideable** (E to grab, ride down the cable, E to drop early)
- ✅ R-MAP-5 **day/night** (Dawn/Day/Dusk/Night) and **weather** (Clear/Rain/Fog/Snow) with real
  particle systems, both selectable or set to **Random** so conditions change match to match

**Phase 5 verification notes**
- Fixed during verification: the "you can't drive vehicles" hint never fired on maps without ziplines,
  because the zipline update returned early — vehicles exist on every map, so that check now runs first.
- Destruction measured: rifle broke a crate in 5 shots (24 dmg × 5 = 120 HP); breaking it removed the
  collider (43→42) and all 5 nearby cover points, spawning 7 debris chunks; 4 grenades destroyed 2 props;
  boundary walls survived 99,999 damage.
- Environment measured: sun intensity Day 1.60 → Dawn 1.15 → Dusk 0.95 → Night 0.30; fog distance
  220 → 70 in Fog weather; Rain spawns 2200 particles, Snow 1400.
- Zipline measured: player attached at the anchor, slid t=0.01→0.98 descending y 13→3.8, and
  auto-detached 0 units from the end post. Vehicles blocked movement at their hull edge.
- All 6 maps ran 6s each under different time/weather combos with **zero runtime errors**.
- Performance worst case (5v5 Elite, densest map, night rain with 2200 particles): **7.62 ms/frame**,
  still inside the 16.7 ms 60fps budget.

### Phase 6 — Progression Meta  ⬅ NEXT
- R-RNK-1..4 ranked ladder, rank-up skins, win streak, protected matchmaking
- R-PRG-1/4 level-gated attachments & skin tiers (Common→Mythic)

### Phase 7 — Online Multiplayer & Cloud Save
- R-VIS-2 real-time MP netcode, R-SAV-1 online accounts/cloud sync, R-CTL-1 full mobile scheme

---

## 13. Tech notes

- **Engine:** Three.js `0.164.1` via ES module CDN (same as existing project). No bundler.
- **Files:** `frontline/index.html`, `frontline/styles.css`, `frontline/src/*.js`.
- **Run:** served by the repo dev server (see `dev-server.ps1`) or any static server; open `frontline/index.html`.
- **Persistence:** `localStorage` for Phase 1–6; pluggable save layer so cloud sync (Phase 7) swaps in without gameplay changes.
- **Performance target:** 60 FPS on a mid laptop; pixel ratio capped; shadows soft but limited.
