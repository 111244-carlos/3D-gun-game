// FRONTLINE — Phase 4 objectives (R-MOD-1..4)
// Flags (CTF), bomb plant/defuse (S&D), control points (Domination),
// shrinking zone (Battle Royale) and the Gun Game ladder.
//
// This module owns its own scene objects and never imports game.js — the host
// passes a small context in via initObjectives() to avoid a circular import.
import { MODES, GUN_LADDER } from "./data.js";

let THREE, scene, ctx;
const group = { root: null };

/** Live objective state, rebuilt per match. */
export const obj = {
  mode: null,
  flags: null,          // { blue:{...}, red:{...} }
  sites: [],            // bomb sites (also drawn as props in most modes)
  points: [],           // domination control points
  bomb: null,           // { planted, timer, carrier, site, defusing }
  zone: null,           // battle-royale safe zone
  ladder: { index: 0, botIndex: {} },
  banner: "",           // text for the HUD banner
};

export function initObjectives(context) {
  ctx = context;
  THREE = ctx.THREE;
  scene = ctx.scene;
  group.root = new THREE.Group();
  scene.add(group.root);
}

// ---------------------------------------------------------------
//  SETUP
// ---------------------------------------------------------------
export function clearObjectives() {
  if (!group.root) return;
  for (const child of [...group.root.children]) {
    group.root.remove(child);
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
  obj.flags = null; obj.sites = []; obj.points = [];
  obj.bomb = null; obj.zone = null;
  obj.ladder = { index: 0, botIndex: {} };
  obj.banner = "";
}

export function setupObjectives(modeKey) {
  clearObjectives();
  obj.mode = modeKey;
  const m = MODES[modeKey];
  if (!m) return;

  // Bomb sites appear in most modes — but never in FFA or CTF (R-MOD-4).
  if (m.bombSites) buildBombSites(m.objective === "bomb");
  if (m.objective === "flags") buildFlags();
  if (m.objective === "domination") buildControlPoints();
  if (m.objective === "bomb") obj.bomb = { planted: false, timer: 0, carrier: null, site: null, progress: 0 };
  if (m.objective === "zone") buildZone();
  if (m.objective === "gunladder") {
    obj.ladder.index = 0;
    for (const b of ctx.bots()) obj.ladder.botIndex[b.id] = 0;
  }
}

const MAT = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, ...opts });

function buildBombSites(functional) {
  const spots = [
    { name: "A", pos: new THREE.Vector3(-38, 0, 0) },
    { name: "B", pos: new THREE.Vector3(38, 0, 0) },
  ];
  for (const s of spots) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 0.25, 24),
      MAT(functional ? 0xd8a23a : 0x7a6a4a, { transparent: true, opacity: functional ? 0.55 : 0.3 })
    );
    pad.position.copy(s.pos); pad.position.y = 0.14;
    group.root.add(pad);

    // marker post so it reads at distance
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), MAT(functional ? 0xe0b552 : 0x8a7a58));
    post.position.copy(s.pos); post.position.y = 2;
    group.root.add(post);

    obj.sites.push({ name: s.name, pos: s.pos.clone(), radius: 7, functional, mesh: pad });
  }
}

function buildFlags() {
  const mk = (team, pos, color) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5, 8), MAT(0xdddddd));
    pole.position.copy(pos); pole.position.y = 2.5;
    group.root.add(pole);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.12), MAT(color, { emissiveIntensity: 0.7 }));
    cloth.position.set(pos.x + 1.2, 4.1, pos.z);
    group.root.add(cloth);
    return {
      team, base: pos.clone(), pos: pos.clone(), color,
      cloth, pole, carrier: null, atBase: true,
    };
  };
  const blueBase = ctx.blueSpawn().clone(); blueBase.y = 0;
  const redBase = ctx.redSpawn().clone(); redBase.y = 0;
  obj.flags = { blue: mk("blue", blueBase, 0x4a9dff), red: mk("red", redBase, 0xff5a5a) };
}

function buildControlPoints() {
  const spots = [
    { name: "A", pos: new THREE.Vector3(-40, 0, -18) },
    { name: "B", pos: new THREE.Vector3(0, 0, 0) },
    { name: "C", pos: new THREE.Vector3(40, 0, 18) },
  ];
  for (const s of spots) {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.22, 28),
      MAT(0x9aa6b2, { transparent: true, opacity: 0.4 })
    );
    ring.position.copy(s.pos); ring.position.y = 0.12;
    group.root.add(ring);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), MAT(0xbfc8d2));
    post.position.copy(s.pos); post.position.y = 2.5;
    group.root.add(post);
    obj.points.push({ name: s.name, pos: s.pos.clone(), radius: 9, owner: null, progress: 0, mesh: ring, post });
  }
}

function buildZone() {
  const r = ctx.mapSize() * 1.05;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 26, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x64b5ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  ring.position.y = 13;
  group.root.add(ring);
  obj.zone = { center: new THREE.Vector3(0, 0, 0), radius: r, target: r, mesh: ring, shrinkAt: 12, step: 0 };
}

// ---------------------------------------------------------------
//  UPDATE
// ---------------------------------------------------------------
export function updateObjectives(dt) {
  const m = MODES[obj.mode];
  if (!m) return;
  switch (m.objective) {
    case "flags": updateFlags(dt); break;
    case "domination": updateDomination(dt); break;
    case "bomb": updateBomb(dt); break;
    case "zone": updateZone(dt); break;
    case "gunladder": obj.banner = `Weapon ${obj.ladder.index + 1} / ${GUN_LADDER.length}`; break;
  }
}

// ---------- CTF (R-MOD-4: flags only in CTF) ----------
function updateFlags(dt) {
  const player = ctx.player();
  const flags = obj.flags;
  const enemyFlag = flags.red;     // player is blue, so they steal red's flag
  const ownFlag = flags.blue;

  // --- player picks up the enemy flag ---
  if (!enemyFlag.carrier && player.alive && !player.downed &&
      player.pos.distanceTo(enemyFlag.pos) < 3.5) {
    enemyFlag.carrier = "player";
    enemyFlag.atBase = false;
    ctx.toast("You picked up the enemy flag — run it home!");
    ctx.chatSys("Flag taken! Get back to base!");
  }

  // --- bots pick up the opposing flag ---
  for (const b of ctx.bots()) {
    if (!b.alive || b.downed) continue;
    const steal = b.team === "blue" ? flags.red : flags.blue;
    const home = b.team === "blue" ? flags.blue : flags.red;
    if (!steal.carrier && b.pos.distanceTo(steal.pos) < 3.5) {
      steal.carrier = b; steal.atBase = false;
      ctx.chatSys(`${b.name} grabbed the ${steal.team} flag`);
    }
    // carrier scores at their own base (their flag must be home)
    if (steal.carrier === b && home.atBase && b.pos.distanceTo(home.base) < 7) {
      scoreCapture(b.team, steal);
    }
    // touching your own dropped flag returns it
    if (!home.atBase && !home.carrier && b.pos.distanceTo(home.pos) < 3.5) returnFlag(home);
  }

  // --- player scores ---
  if (enemyFlag.carrier === "player") {
    enemyFlag.pos.copy(player.pos);
    if (ownFlag.atBase && player.pos.distanceTo(ownFlag.base) < 7) scoreCapture("blue", enemyFlag);
    // drop it if you go down
    if (!player.alive || player.downed) dropFlag(enemyFlag, player.pos);
  } else if (enemyFlag.carrier && enemyFlag.carrier.pos) {
    const c = enemyFlag.carrier;
    enemyFlag.pos.copy(c.pos);
    if (!c.alive || c.downed) dropFlag(enemyFlag, c.pos);
  }
  // player returns own flag
  if (!ownFlag.atBase && !ownFlag.carrier && player.alive &&
      player.pos.distanceTo(ownFlag.pos) < 3.5) returnFlag(ownFlag);

  syncFlagMesh(flags.blue); syncFlagMesh(flags.red);

  const carried = enemyFlag.carrier ? "YOU HAVE THE FLAG" :
                  (flags.blue.carrier ? "YOUR FLAG IS STOLEN" : "");
  obj.banner = carried;
}

function syncFlagMesh(f) {
  f.pole.position.set(f.pos.x, f.carrier ? 1.6 : 2.5, f.pos.z);
  f.cloth.position.set(f.pos.x + 1.2, f.carrier ? 3.0 : 4.1, f.pos.z);
}
function dropFlag(f, at) {
  f.carrier = null;
  f.pos.copy(at); f.pos.y = 0;
  ctx.chatSys(`The ${f.team} flag was dropped`);
}
function returnFlag(f) {
  f.carrier = null; f.atBase = true; f.pos.copy(f.base);
  ctx.chatSys(`The ${f.team} flag was returned`);
}
function scoreCapture(team, flag) {
  returnFlag(flag);
  ctx.addScore(team, 1);
  ctx.toast(team === "blue" ? "CAPTURED! +1" : "Enemy captured your flag");
  ctx.chatSys(`${team === "blue" ? "Blue" : "Red"} scored a capture`);
}

// ---------- DOMINATION ----------
function updateDomination(dt) {
  const player = ctx.player();
  let blueHeld = 0, redHeld = 0;

  for (const p of obj.points) {
    let blue = 0, red = 0;
    if (player.alive && !player.downed && player.pos.distanceTo(p.pos) < p.radius) blue++;
    for (const b of ctx.bots()) {
      if (!b.alive || b.downed) continue;
      if (b.pos.distanceTo(p.pos) < p.radius) (b.team === "blue" ? blue++ : red++);
    }
    // contested points don't move
    if (blue > red) p.progress = Math.min(1, p.progress + dt * 0.5 * (blue - red));
    else if (red > blue) p.progress = Math.max(-1, p.progress - dt * 0.5 * (red - blue));

    const newOwner = p.progress >= 1 ? "blue" : p.progress <= -1 ? "red" : p.owner;
    if (newOwner !== p.owner && (p.progress >= 1 || p.progress <= -1)) {
      p.owner = newOwner;
      ctx.toast(`Point ${p.name} captured by ${newOwner === "blue" ? "your team" : "the enemy"}`);
    }
    const col = p.owner === "blue" ? 0x4a9dff : p.owner === "red" ? 0xff5a5a : 0x9aa6b2;
    p.mesh.material.color.setHex(col); p.mesh.material.emissive.setHex(col);
    p.post.material.color.setHex(col); p.post.material.emissive.setHex(col);

    if (p.owner === "blue") blueHeld++; else if (p.owner === "red") redHeld++;
  }

  // score ticks with how many points you hold
  if (blueHeld) ctx.addScore("blue", dt * 4 * blueHeld);
  if (redHeld) ctx.addScore("red", dt * 4 * redHeld);
  obj.banner = `A/B/C — you hold ${blueHeld}, enemy holds ${redHeld}`;
}

// ---------- SEARCH & DESTROY ----------
const PLANT_TIME = 3.5, DEFUSE_TIME = 5, BOMB_FUSE = 45;
function updateBomb(dt) {
  const player = ctx.player();
  const bomb = obj.bomb;
  const keys = ctx.keys();

  if (!bomb.planted) {
    // blue = attackers: stand in a site and hold E
    const site = obj.sites.find(s => player.pos.distanceTo(s.pos) < s.radius);
    if (site && player.alive && !player.downed) {
      if (keys["KeyE"]) {
        bomb.progress += dt / PLANT_TIME;
        obj.banner = `PLANTING… ${Math.round(bomb.progress * 100)}%`;
        if (bomb.progress >= 1) {
          bomb.planted = true; bomb.site = site; bomb.timer = BOMB_FUSE; bomb.progress = 0;
          site.mesh.material.color.setHex(0xff5a5a); site.mesh.material.emissive.setHex(0xff5a5a);
          ctx.toast(`Bomb planted at ${site.name}!`);
          ctx.chatSys(`Bomb is down at ${site.name} — defend it!`);
        }
      } else {
        bomb.progress = Math.max(0, bomb.progress - dt);
        obj.banner = `Hold E to plant at ${site.name}`;
      }
    } else {
      obj.banner = "Plant the bomb at site A or B";
    }
    return;
  }

  // planted: it ticks down; red bots try to defuse
  bomb.timer -= dt;
  const atSite = player.pos.distanceTo(bomb.site.pos) < bomb.site.radius;
  const defusers = ctx.bots().filter(b =>
    b.alive && !b.downed && b.team === "red" && b.pos.distanceTo(bomb.site.pos) < bomb.site.radius);

  if (defusers.length) {
    bomb.progress += dt / DEFUSE_TIME * defusers.length;
    obj.banner = `ENEMY DEFUSING! ${Math.round(bomb.progress * 100)}%  ·  ${Math.ceil(bomb.timer)}s`;
    if (bomb.progress >= 1) { ctx.win("red"); ctx.toast("Bomb defused — you lost"); return; }
  } else {
    bomb.progress = Math.max(0, bomb.progress - dt * 0.5);
    obj.banner = `BOMB ARMED — ${Math.ceil(bomb.timer)}s${atSite ? " (defend it)" : ""}`;
  }
  if (bomb.timer <= 0) { ctx.win("blue"); ctx.toast("Bomb detonated — you win!"); }
}

// ---------- BATTLE ROYALE ----------
function updateZone(dt) {
  const z = obj.zone;
  const player = ctx.player();

  z.shrinkAt -= dt;
  if (z.shrinkAt <= 0 && z.target > 14) {
    z.target = Math.max(14, z.target * 0.62);
    z.shrinkAt = 22;
    z.step++;
    ctx.toast("The safe zone is closing!");
    ctx.chatSys("Zone collapsing — move to the centre");
  }
  // ease the visual ring toward the target radius
  if (Math.abs(z.radius - z.target) > 0.05) {
    z.radius += (z.target - z.radius) * Math.min(1, dt * 0.5);
    z.mesh.scale.setScalar(z.radius / (ctx.mapSize() * 1.05));
  }

  // outside the zone hurts
  const dp = Math.hypot(player.pos.x - z.center.x, player.pos.z - z.center.z);
  if (dp > z.radius && player.alive && !player.downed) {
    ctx.damagePlayer(14 * dt, null);
    obj.banner = "OUTSIDE THE ZONE — get to the centre!";
  } else {
    obj.banner = `Safe zone: ${Math.round(z.radius)}m`;
  }
  for (const b of ctx.bots()) {
    if (!b.alive || b.downed) continue;
    const d = Math.hypot(b.pos.x - z.center.x, b.pos.z - z.center.z);
    if (d > z.radius) {
      b.hp -= 14 * dt;
      // pull them back toward safety
      b.pos.x += (z.center.x - b.pos.x) * 0.02 * dt * 10;
      b.pos.z += (z.center.z - b.pos.z) * 0.02 * dt * 10;
      if (b.hp <= 0) ctx.zoneKill(b);
    }
  }
}

// ---------- GUN GAME ----------
/** Advance the player's ladder position. Returns true if they finished. */
export function gunGameAdvance() {
  obj.ladder.index++;
  if (obj.ladder.index >= GUN_LADDER.length) return true;
  ctx.toast(`Upgrade! ${GUN_LADDER[obj.ladder.index].toUpperCase()}`);
  return false;
}
export function gunGameWeapon() { return GUN_LADDER[Math.min(obj.ladder.index, GUN_LADDER.length - 1)]; }

// ---------- shared ----------
export function objectiveBanner() { return obj.banner; }
