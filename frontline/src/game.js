// FRONTLINE — Phase 1 playable core
// See ../SPEC.md. Three.js FPS: movement, shooting, enemy AI, respawns, HUD.
import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GUNS, UTILS, ARMOR, UTIL_COOLDOWN, XP, COINS, gunStats,
         ROLES, ROLE_KEYS, DIFFICULTY, REVIVE,
         MODES, MAPS, MAP_KEYS, GUN_LADDER,
         TIMES, TIME_KEYS, WEATHER, WEATHER_KEYS, PROP_HP,
         VEHICLES, VEHICLE_KEYS, VEHICLE_RESPAWN,
         FALLOFF, HEADSHOT, falloffMul, FIRE_MODES, applyFireMode,
         roleCanUse, gunsForRole, GUN_LEVEL_PERKS, gunPerks,
         RANKS, SKINS, RARITY, streakHardening } from "./data.js";
import * as OBJ from "./objectives.js";
import * as P from "./profile.js";
import { profile } from "./profile.js";
import { initShop, renderHeader, isArmoryOpen } from "./shop.js";
import { Sound } from "./sound.js";

// ============================================================
//  RENDERER / SCENE / CAMERA
// ============================================================
const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c9);
scene.fog = new THREE.Fog(0x9fb8c9, 60, 220);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
camera.rotation.order = "YXZ"; // yaw then pitch
scene.add(camera);

function resize() {
  // Use the canvas's own laid-out size (CSS 100%). Falls back to window.
  const w = canvas.clientWidth || window.innerWidth || 1280;
  const h = canvas.clientHeight || window.innerHeight || 720;
  const ratio = renderer.getPixelRatio();
  if (canvas.width === Math.floor(w * ratio) && canvas.height === Math.floor(h * ratio)) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
window.addEventListener("fullscreenchange", resize);
resize();

/** Ask the browser to go true fullscreen (hides the tab bar/address bar too,
 * not just fills the page) — must run inside a real user-click handler.
 * Silently no-ops if the browser blocks it or it's already fullscreen. */
function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!req) return;
  const result = req.call(el);
  if (result && result.catch) result.catch(() => {});
}

// Browsers only allow requestFullscreen() from inside a real user gesture —
// no site can auto-fullscreen on load, that's a security restriction in every
// browser, not something specific to this game. To make it happen as early as
// possible, trigger on the player's very FIRST click or key press anywhere on
// the page (not just the Play button), then stop listening.
function armAutoFullscreenOnFirstInput() {
  const trigger = () => { goFullscreen(); cleanup(); };
  const cleanup = () => {
    window.removeEventListener("pointerdown", trigger, true);
    window.removeEventListener("keydown", trigger, true);
  };
  window.addEventListener("pointerdown", trigger, true);
  window.addEventListener("keydown", trigger, true);
}
armAutoFullscreenOnFirstInput();

// ============================================================
//  LIGHTING
// ============================================================
const hemi = new THREE.HemisphereLight(0xdfefff, 0x30302a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(40, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 260;
scene.add(sun);

// ============================================================
//  MAP  — ground, boundary walls, cover, two respawn zones
// ============================================================
const MAP = 90;              // half-extent of the play field
const colliders = [];        // AABB colliders {min:{x,z}, max:{x,z}, top}
const solids = [];           // meshes that block bullets & sight (cached for speed)

// Everything map-specific lives in this group so a new map can replace it (R-MAP-2).
const mapGroup = new THREE.Group();
scene.add(mapGroup);
let ground = null;
let currentMap = "compound";
let currentTime = "day", currentWeather = "clear";
const vehicles = [];     // scenery vehicles (not rideable — R-MAP-4)
const ziplines = [];     // rideable ziplines (forest only — R-MAP-4)
const debris = [];       // flying chunks from destroyed props (R-MAP-3)
const drones = [];       // ambient near-future holo-drones (R-MAP-6, purely decorative)

const BLUE_SPAWN = new THREE.Vector3();
const RED_SPAWN = new THREE.Vector3();

/**
 * Add a solid box to the world.
 * `opts.hp` makes it destructible (R-MAP-3); `opts.extra` are decorative meshes
 * (tree canopy, vehicle parts) that disappear with it.
 */
function addBox(x, z, w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mapGroup.add(mesh);

  const col = {
    min: { x: x - w / 2, z: z - d / 2 }, max: { x: x + w / 2, z: z + d / 2 }, top: h,
    mesh, extra: opts.extra || [],
    hp: opts.hp || 0, maxHp: opts.hp || 0,
    destructible: !!opts.hp,
    broken: false,
    kind: opts.kind || "prop",
  };
  mesh.userData.collider = col;
  colliders.push(col);
  solids.push(mesh);
  return col;
}

/** Decorative mesh attached to a collider (no collision of its own). */
function addDecor(col, mesh) {
  mapGroup.add(mesh);
  col.extra.push(mesh);
  return mesh;
}

/**
 * Faction trim (R-MAP-6): cover/vehicles deep in a team's own half get a thin
 * glowing strip in that team's color, so each side of an expanded map reads
 * as visually "theirs" at a glance even though the layout stays symmetric.
 * No-man's-land (the middle) stays neutral/untrimmed.
 */
function factionTrim(col, x, z) {
  if (Math.abs(z) < MAP * 0.42) return;
  const team = z < 0 ? 0x4a9dff : 0xff5a5a;
  const w = Math.max(0.6, Math.min(6, col.max.x - col.min.x));
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.14, 0.14),
    new THREE.MeshStandardMaterial({ color: team, emissive: team, emissiveIntensity: 0.9 })
  );
  trim.position.set(x, col.top + 0.1, z);
  addDecor(col, trim);
}

/** Ambient floating holo-drone — near-future set dressing only, no collision. */
function addHoloDrone(x, z, color) {
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x1c2230, emissive: color, emissiveIntensity: 0.75, roughness: 0.4 })
  );
  const y = 9 + Math.random() * 6;
  body.position.set(x, y, z);
  mapGroup.add(body);
  drones.push({ mesh: body, baseY: y, phase: Math.random() * Math.PI * 2 });
}

/** Bob the ambient drones up and down; runs even on the menu backdrop. */
function updateDrones(dt) {
  for (const d of drones) {
    d.phase += dt * 1.2;
    d.mesh.position.y = d.baseY + Math.sin(d.phase) * 0.6;
    d.mesh.rotation.y += dt * 0.5;
  }
}

/** One piece of themed cover. `breakable` wires up destruction (R-MAP-3). */
function addProp(def, x, z, breakable) {
  const s = def.coverScale;
  const color = def.palette[(Math.random() * def.palette.length) | 0];
  const hp = breakable ? PROP_HP[def.prop] || 150 : 0;

  if (def.prop === "trees") {
    const th = (7 + Math.random() * 6) * s;
    const col = addBox(x, z, 1.5 * s, th, 1.5 * s, color, { hp, kind: "tree" });
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(3.4 * s, 6 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0x35592f, roughness: 0.95 })
    );
    canopy.position.set(x, th + 2 * s, z);
    canopy.castShadow = true;
    addDecor(col, canopy);
    return col;
  }

  if (def.prop === "buildings") {
    const w = (7 + Math.random() * 9) * s, d = (7 + Math.random() * 9) * s;
    const h = (8 + Math.random() * 16) * s;
    const col = addBox(x, z, w, h, d, color, { hp: hp ? hp : 0, kind: "building" });
    // a couple of window bands so blocks read as buildings
    for (let i = 1; i < Math.min(4, Math.floor(h / 6)); i++) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.01, 0.7, d * 1.01),
        new THREE.MeshStandardMaterial({ color: 0x2b3038, emissive: 0x1b2028, emissiveIntensity: 0.4 })
      );
      band.position.set(x, i * 6, z);
      addDecor(col, band);
    }
    return col;
  }

  if (def.prop === "rocks") {
    const w = (4 + Math.random() * 7) * s, d = (4 + Math.random() * 7) * s;
    const h = (2.5 + Math.random() * 3.5) * s;
    const col = addBox(x, z, w, h, d, color, { hp, kind: "rock" });
    col.mesh.rotation.y = Math.random() * Math.PI;
    return col;
  }

  // default: crates
  const w = (3 + Math.random() * 6) * s;
  const d = (3 + Math.random() * 6) * s;
  const h = (2 + Math.random() * 4) * Math.min(1.3, s);
  return addBox(x, z, w, h, d, color, { hp, kind: "crate" });
}

// ============================================================
//  DRIVABLE VEHICLES  (R-VEH-1) — models
//  Built facing +Z (nose forward), centred on the origin, so the whole group
//  can just be positioned + yaw-rotated as a rigid body every frame.
// ============================================================
const VEH_WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 1 });
const VEH_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0x2b3038, emissive: 0x1b2028, emissiveIntensity: 0.35, roughness: 0.35,
});

function buildVehicleModel(def) {
  const grp = new THREE.Group();
  const wheels = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: def.body, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: def.trim, roughness: 0.9 });

  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  const wheel = (x, y, z, r, width) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width || 0.6, 12), VEH_WHEEL_MAT);
    m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    grp.add(m);
    wheels.push(m);
    return m;
  };

  const L = def.len, W = def.wid, T = def.tall;
  let chassis;

  if (def.style === "bike") {
    chassis = box(W * 0.55, T * 0.30, L * 0.72, bodyMat, 0, T * 0.52, 0);
    box(W * 0.5, T * 0.22, L * 0.26, trimMat, 0, T * 0.72, -L * 0.14);          // seat
    box(W * 1.5, 0.12, 0.12, trimMat, 0, T * 0.82, L * 0.3);                    // handlebars
    box(0.14, T * 0.5, 0.14, trimMat, 0, T * 0.6, L * 0.32);                    // fork
    wheel(0, T * 0.34, L * 0.36, T * 0.34, 0.3);
    wheel(0, T * 0.34, -L * 0.36, T * 0.34, 0.3);
  } else if (def.style === "apc") {
    // sloped armoured hull + cupola, six road wheels
    chassis = box(W, T * 0.52, L * 0.92, bodyMat, 0, T * 0.42, 0);
    box(W * 0.86, T * 0.30, L * 0.55, trimMat, 0, T * 0.80, -L * 0.06);         // upper deck
    box(W * 0.42, T * 0.22, W * 0.42, trimMat, 0, T * 1.02, -L * 0.10);         // cupola
    box(W * 0.9, T * 0.20, 0.3, VEH_GLASS_MAT, 0, T * 0.66, L * 0.45);          // vision block
    box(W * 1.02, 0.35, 0.5, trimMat, 0, T * 0.30, L * 0.47);                   // front plate
    for (const oz of [L * 0.34, 0, -L * 0.34]) {
      wheel(-W * 0.52, T * 0.24, oz, T * 0.24);
      wheel(W * 0.52, T * 0.24, oz, T * 0.24);
    }
  } else if (def.style === "truck") {
    chassis = box(W, T * 0.34, L * 0.95, bodyMat, 0, T * 0.36, 0);              // frame
    box(W * 0.94, T * 0.42, L * 0.30, trimMat, 0, T * 0.72, L * 0.3);           // cab
    box(W * 0.8, T * 0.24, 0.22, VEH_GLASS_MAT, 0, T * 0.78, L * 0.45);         // windscreen
    box(W * 0.98, T * 0.46, L * 0.5, trimMat, 0, T * 0.78, -L * 0.2);           // canopy
    for (const oz of [L * 0.36, -L * 0.12, -L * 0.36]) {
      wheel(-W * 0.5, T * 0.22, oz, T * 0.22);
      wheel(W * 0.5, T * 0.22, oz, T * 0.22);
    }
  } else if (def.style === "buggy") {
    chassis = box(W * 0.9, T * 0.34, L * 0.9, bodyMat, 0, T * 0.42, 0);
    box(W * 0.7, T * 0.22, L * 0.3, trimMat, 0, T * 0.66, -L * 0.05);           // seats
    // roll cage
    box(0.12, T * 0.6, 0.12, trimMat, -W * 0.34, T * 0.85, -L * 0.02);
    box(0.12, T * 0.6, 0.12, trimMat, W * 0.34, T * 0.85, -L * 0.02);
    box(W * 0.76, 0.12, 0.12, trimMat, 0, T * 1.12, -L * 0.02);
    box(W * 1.0, 0.25, 0.35, trimMat, 0, T * 0.36, L * 0.45);                   // bumper
    wheel(-W * 0.52, T * 0.32, L * 0.32, T * 0.32);
    wheel(W * 0.52, T * 0.32, L * 0.32, T * 0.32);
    wheel(-W * 0.52, T * 0.32, -L * 0.32, T * 0.32);
    wheel(W * 0.52, T * 0.32, -L * 0.32, T * 0.32);
  } else {
    // jeep (default)
    chassis = box(W, T * 0.44, L * 0.92, bodyMat, 0, T * 0.44, 0);
    box(W * 0.88, T * 0.34, L * 0.42, trimMat, 0, T * 0.80, -L * 0.08);         // cab
    box(W * 0.78, T * 0.24, 0.2, VEH_GLASS_MAT, 0, T * 0.84, L * 0.14);         // windscreen
    box(W * 1.02, 0.28, 0.4, trimMat, 0, T * 0.34, L * 0.46);                   // bumper
    wheel(-W * 0.52, T * 0.28, L * 0.3, T * 0.28);
    wheel(W * 0.52, T * 0.28, L * 0.3, T * 0.28);
    wheel(-W * 0.52, T * 0.28, -L * 0.3, T * 0.28);
    wheel(W * 0.52, T * 0.28, -L * 0.3, T * 0.28);
  }

  grp.userData.wheels = wheels;
  grp.userData.body = chassis;   // the mesh bullets raycast against
  return grp;
}

/**
 * Spawn a drivable vehicle (R-VEH-1). Unlike the old scenery props these are
 * rigid bodies: the group is moved/rotated every frame and its axis-aligned
 * collider is recomputed to match, so it still blocks people and bullets.
 */
function addVehicle(x, z, typeKey) {
  const key = typeKey || VEHICLE_KEYS[(Math.random() * VEHICLE_KEYS.length) | 0];
  const def = VEHICLES[key] || VEHICLES.jeep;
  const grp = buildVehicleModel(def);
  grp.position.set(x, 0, z);
  grp.rotation.y = Math.random() * Math.PI * 2;
  mapGroup.add(grp);

  const v = {
    key, def, group: grp,
    pos: new THREE.Vector3(x, 0, z),
    yaw: grp.rotation.y,
    speed: 0,                     // signed: negative = reversing
    hp: def.hp, maxHp: def.hp,
    alive: true,
    driver: null,                 // player object or a bot
    occupants: [],                // includes the driver
    wheels: grp.userData.wheels,
    wheelSpin: 0,
    respawnAt: 0,
  };

  const col = {
    min: { x: x - def.wid / 2, z: z - def.len / 2 },
    max: { x: x + def.wid / 2, z: z + def.len / 2 },
    top: def.tall,
    mesh: grp.userData.body,
    extra: [],
    hp: 0, maxHp: 0, destructible: false, broken: false,
    kind: "vehicle",
    vehicle: v,
  };
  grp.userData.body.userData.collider = col;
  v.col = col;
  colliders.push(col);
  solids.push(grp.userData.body);
  wmCache = null;
  syncVehicleCollider(v);

  vehicles.push(v);
  return v;
}

/**
 * Is there room to drop a vehicle of this type at (x,z)? Checks real cover
 * (walls, crates, buildings…) as well as the other vehicles, so nothing
 * spawns wedged inside a crate where it could never drive out.
 */
function vehicleSpotClear(def, x, z) {
  const r = Math.max(def.len, def.wid) / 2 + 1.5;
  // never park on top of a respawn pad — you'd spawn inside the chassis
  if (Math.hypot(x - BLUE_SPAWN.x, z - BLUE_SPAWN.z) < 15) return false;
  if (Math.hypot(x - RED_SPAWN.x, z - RED_SPAWN.z) < 15) return false;
  for (const col of colliders) {
    if (col.top < 0.8) continue;
    if (x + r > col.min.x && x - r < col.max.x && z + r > col.min.z && z - r < col.max.z) return false;
  }
  for (const o of vehicles) {
    if (Math.hypot(o.pos.x - x, o.pos.z - z) < 14) return false;
  }
  return true;
}

/** Recompute a vehicle's axis-aligned collision box from its current yaw. */
function syncVehicleCollider(v) {
  const c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw));
  const hw = v.def.wid / 2, hl = v.def.len / 2;
  const ex = hw * c + hl * s;
  const ez = hw * s + hl * c;
  v.col.min.x = v.pos.x - ex; v.col.max.x = v.pos.x + ex;
  v.col.min.z = v.pos.z - ez; v.col.max.z = v.pos.z + ez;
}

/** A rideable zipline between two towers (forest maps only — R-MAP-4). */
function addZipline() {
  const ax = (Math.random() * 2 - 1) * (MAP - 30);
  const az = (Math.random() * 2 - 1) * (MAP - 50);
  const ang = Math.random() * Math.PI * 2;
  const len = 45 + Math.random() * 30;
  const bx = Math.max(-MAP + 12, Math.min(MAP - 12, ax + Math.cos(ang) * len));
  const bz = Math.max(-MAP + 12, Math.min(MAP - 12, az + Math.sin(ang) * len));

  const start = new THREE.Vector3(ax, 15, az);
  const end = new THREE.Vector3(bx, 5.5, bz);

  // support posts
  for (const [px, pz, ph] of [[ax, az, 15], [bx, bz, 5.5]]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, ph, 8),
      new THREE.MeshStandardMaterial({ color: 0x53402c, roughness: 0.9 })
    );
    post.position.set(px, ph / 2, pz);
    post.castShadow = true;
    mapGroup.add(post);
  }

  // the cable itself
  const dir = new THREE.Vector3().subVectors(end, start);
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, dir.length(), 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 })
  );
  cable.position.copy(start).addScaledVector(dir, 0.5);
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mapGroup.add(cable);

  // glowing grab marker at the top anchor
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.16, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x2fb3a4, emissive: 0x2fb3a4, emissiveIntensity: 0.9 })
  );
  marker.position.copy(start); marker.position.y = 14.2;
  marker.rotation.x = Math.PI / 2;
  mapGroup.add(marker);

  ziplines.push({ start, end, length: dir.length(), marker });
}

/**
 * Drop every reference to the vehicles that are about to be destroyed.
 * Ending a match while you were still sitting in one used to leave
 * player.vehicle pointing at a vehicle that no longer exists, which pinned
 * the next match in the third-person "driving" branch forever — no movement,
 * no first-person view, no shooting. This runs before any teardown.
 */
function resetVehicleState() {
  player.vehicle = null;
  player._eLatch = false;
  player._ramCd = 0;
  if (typeof viewGun !== "undefined" && viewGun) viewGun.visible = true;
  if (typeof vehicleHudEl !== "undefined" && vehicleHudEl) vehicleHudEl.classList.add("hidden");
  if (typeof vehiclePromptEl !== "undefined" && vehiclePromptEl) vehiclePromptEl.classList.add("hidden");
  for (const b of bots) {
    if (!b) continue;
    b.vehicle = null; b.driveTo = null; b.vehSeat = 0; b.vehicleCd = Math.random() * 3;
  }
  for (const v of vehicles) { v.driver = null; v.occupants.length = 0; }
}

/** Tear down the current map so another can be built in its place. */
function clearMap() {
  resetVehicleState();
  for (const child of [...mapGroup.children]) {
    mapGroup.remove(child);
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
    else child.material?.dispose?.();
  }
  colliders.length = 0;
  solids.length = 0;
  coverPoints.length = 0;
  vehicles.length = 0;
  ziplines.length = 0;
  debris.length = 0;
  drones.length = 0;
  ground = null;
}

/** Build one of the maps from the MAPS registry (R-MAP-1/2). */
function buildMap(key) {
  const def = MAPS[key] || MAPS.compound;
  currentMap = def.key;
  clearMap();

  scene.background = new THREE.Color(def.sky);
  scene.fog = new THREE.Fog(def.sky, def.fog[0], def.fog[1]);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP * 2, MAP * 2),
    new THREE.MeshStandardMaterial({ color: def.ground, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  mapGroup.add(ground);

  const grid = new THREE.GridHelper(MAP * 2, 36, def.grid[0], def.grid[1]);
  grid.material.opacity = 0.35; grid.material.transparent = true;
  mapGroup.add(grid);

  const neon = def.neon || 0x39e6ff;

  // boundary walls (indestructible) — a thin glowing neon trim along the top
  // edge gives every map its near-future signature (R-MAP-6).
  const wall = (x, z, w, d) => {
    const col = addBox(x, z, w, 6, d, def.grid[0], { kind: "wall" });
    const horiz = w >= d;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(horiz ? w : 0.16, 0.16, horiz ? 0.16 : d),
      new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 1.1 })
    );
    trim.position.set(x, 6.1, z);
    addDecor(col, trim);
    return col;
  };
  wall(0, -MAP, MAP * 2, 3);
  wall(0, MAP, MAP * 2, 3);
  wall(-MAP, 0, 3, MAP * 2);
  wall(MAP, 0, 3, MAP * 2);

  // ----- three lanes (left/mid/right) instead of one open field (R-MAP-6) —
  // staggered, indestructible dividers with gaps near each spawn and across
  // the midline so players can still cross between lanes; fights spread
  // across distinct routes instead of clumping in the center. Skipped on the
  // Range: it's a flat practice ground, not a real map. -----
  if (def.votable !== false) {
    const LANE_X = MAP * 0.36;
    const buildLaneDivider = (side) => {
      const segLen = 14, gap = 9;
      let z = -MAP + 26;
      while (z < MAP - 26) {
        const nearSpawn = Math.abs(z) > MAP - 34;
        const nearMid = Math.abs(z) < 12;
        if (!nearSpawn && !nearMid) {
          const h = 3.2 + Math.random() * 1.6;
          const col = addBox(side * LANE_X, z, 3, h, segLen, def.grid[1], { kind: "wall" });
          const trim = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, segLen),
            new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 1.2 })
          );
          trim.position.set(side * LANE_X, h + 0.12, z);
          addDecor(col, trim);
        }
        z += segLen + gap;
      }
    };
    buildLaneDivider(-1);
    buildLaneDivider(1);
  }

  // scattered cover — style, density and destructibility vary per map. Cover
  // deep in a team's own half gets a faction-colored trim strip (R-MAP-6),
  // so each side reads visually distinct even though the layout is symmetric.
  for (let i = 0; i < def.coverCount; i++) {
    const x = (Math.random() * 2 - 1) * (MAP - 16);
    const z = (Math.random() * 2 - 1) * (MAP - 30);
    if (Math.abs(z) > MAP - 34) continue;           // keep spawn lanes clear
    const breakable = Math.random() < (def.destructible || 0);
    const col = addProp(def, x, z, breakable);
    factionTrim(col, x, z);
  }

  // ----- drivable vehicles (R-VEH-1): 5 per map, scattered, mixed types.
  // Spread across the three lanes and both halves so neither team starts on
  // top of all of them, and nudged away from each other so two don't spawn
  // interlocked. Each is a different type where possible. -----
  const vehCount = def.vehicles || 0;
  const typePool = VEHICLE_KEYS.slice();
  for (let i = 0; i < vehCount; i++) {
    const typeKey = typePool.length ? typePool.splice((Math.random() * typePool.length) | 0, 1)[0]
                                    : VEHICLE_KEYS[(Math.random() * VEHICLE_KEYS.length) | 0];
    const vd = VEHICLES[typeKey];
    let x = 0, z = 0, placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      x = (Math.random() * 2 - 1) * (MAP - 20);
      z = (Math.random() * 2 - 1) * (MAP - 18);
      if (vehicleSpotClear(vd, x, z)) { placed = true; break; }
    }
    if (placed) addVehicle(x, z, typeKey);
  }

  // ziplines — forest only, and these ARE rideable (R-MAP-4)
  for (let i = 0; i < (def.ziplines || 0); i++) addZipline();

  // ambient holo-drones — purely decorative near-future flavor (R-MAP-6)
  for (let i = 0; i < 5; i++) {
    const x = (Math.random() * 2 - 1) * (MAP - 20);
    const z = (Math.random() * 2 - 1) * (MAP - 40);
    addHoloDrone(x, z, neon);
  }

  // respawn zones — indestructible (R-RSP-1). Blue at -Z, Red at +Z.
  const spawnZone = (z, color) => {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.3, 32),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.55 })
    );
    pad.position.set(0, 0.16, z);
    pad.receiveShadow = true;
    mapGroup.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(9, 0.25, 8, 40),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 })
    );
    ring.position.set(0, 0.4, z); ring.rotation.x = Math.PI / 2;
    mapGroup.add(ring);
  };
  spawnZone(-MAP + 14, 0x4a9dff);
  spawnZone(MAP - 14, 0xff5a5a);
  BLUE_SPAWN.set(0, 0, -MAP + 14);
  RED_SPAWN.set(0, 0, MAP - 14);

  buildCoverPoints();
  applyEnvironment(currentTime, currentWeather);
  initEnvironmentCycle();
}

// ============================================================
//  TIME OF DAY + WEATHER  (R-MAP-5)
// ============================================================
let weatherPoints = null;   // THREE.Points for rain/snow/sand
let weatherKind = null;
const TIME_SUN_ANGLES = { dawn: [-60, 25, 40], day: [40, 80, 30], dusk: [60, 22, -40], night: [-30, 60, -50] };

/** Darken/tint a hex colour toward night. */
function tintColor(hex, mul, ambient) {
  const c = new THREE.Color(hex);
  const a = new THREE.Color(ambient);
  c.multiplyScalar(mul);
  c.lerp(a.multiplyScalar(mul), 0.25);
  return c;
}

function applyEnvironment(timeKey, weatherKey) {
  const def = MAPS[currentMap] || MAPS.compound;
  const T = TIMES[timeKey] || TIMES.day;
  const W = WEATHER[weatherKey] || WEATHER.clear;
  currentTime = T.key; currentWeather = W.key;

  // sky + fog: the map's own colour, tinted by time and thickened by weather
  const sky = tintColor(def.sky, T.skyMul, T.ambient);
  scene.background = sky;
  const near = def.fog[0] * W.fogMul;
  const far = def.fog[1] * W.fogMul;
  scene.fog = new THREE.Fog(sky.getHex(), Math.max(8, near), Math.max(30, far));

  // lights
  sun.intensity = T.sun * W.dim;
  sun.color.setHex(T.sunColor);
  hemi.intensity = T.hemi * W.dim;
  hemi.color.setHex(T.ambient);
  // move the sun to match the hour
  const a = TIME_SUN_ANGLES[T.key] || TIME_SUN_ANGLES.day;
  sun.position.set(a[0], a[1], a[2]);

  buildWeatherParticles(W);
}

function buildWeatherParticles(W) {
  if (weatherPoints) {
    scene.remove(weatherPoints);
    weatherPoints.geometry.dispose();
    weatherPoints.material.dispose();
    weatherPoints = null;
  }
  weatherKind = W.particles;
  if (!W.particles) return;

  const n = W.count;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * MAP;
    pos[i * 3 + 1] = Math.random() * 60;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * MAP;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: W.particles === "rain" ? 0xa8c4e0 : W.particles === "sand" ? 0xd9b878 : 0xffffff,
    size: W.particles === "rain" ? 0.16 : W.particles === "sand" ? 0.22 : 0.42,
    transparent: true,
    opacity: W.particles === "rain" ? 0.55 : W.particles === "sand" ? 0.5 : 0.85,
    depthWrite: false,
  });
  weatherPoints = new THREE.Points(geo, mat);
  weatherPoints.frustumCulled = false;
  scene.add(weatherPoints);
}

/** Fall + wrap the weather particles around the camera. */
function updateWeather(dt) {
  if (!weatherPoints) return;
  const arr = weatherPoints.geometry.attributes.position.array;
  const fall = weatherKind === "rain" ? 55 : weatherKind === "sand" ? 1.5 : 7;
  const drift = weatherKind === "snow" ? 2.4 : weatherKind === "sand" ? 6 : 0.4;
  const wind = weatherKind === "sand" ? 22 : 0;   // sandstorms blow sideways, not just down
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] -= fall * dt;
    if (weatherKind === "snow" || weatherKind === "sand") arr[i] += Math.sin(time * 0.7 + i) * drift * dt;
    if (wind) arr[i] += wind * dt;
    if (arr[i + 1] < 0 || arr[i] > camera.position.x + 90) {
      arr[i + 1] = 55 + Math.random() * 10;
      arr[i] = camera.position.x + (Math.random() * 2 - 1) * 70;
      arr[i + 2] = camera.position.z + (Math.random() * 2 - 1) * 70;
    }
  }
  weatherPoints.geometry.attributes.position.needsUpdate = true;
}

// ============================================================
//  DYNAMIC DAY/NIGHT + WEATHER DRIFT  (R-MAP-6) — conditions no longer sit
//  locked to whatever was picked/rolled at the lobby. Time-of-day smoothly
//  advances through a dawn→day→dusk→night cycle over the course of a real
//  match, and weather occasionally rolls a shift too, so a long match can
//  genuinely start clear at midday and end up in a rainy dusk. Skipped for
//  the Shooting Range, which stays on its deliberate fixed day/clear setup.
// ============================================================
const TIME_CYCLE_ORDER = ["dawn", "day", "dusk", "night"];
const ENV_PHASE_LEN = 150;                 // seconds a time-of-day phase takes to fully blend into the next
const ENV_WEATHER_MIN = 90, ENV_WEATHER_MAX = 220; // seconds between weather-shift rolls

let envPhaseT = 0, envFromTime = "day", envToTime = "day";
let envWeatherT = 0;

function initEnvironmentCycle() {
  envFromTime = currentTime;
  const idx = Math.max(0, TIME_CYCLE_ORDER.indexOf(currentTime));
  envToTime = TIME_CYCLE_ORDER[(idx + 1) % TIME_CYCLE_ORDER.length];
  envPhaseT = 0;
  envWeatherT = ENV_WEATHER_MIN + Math.random() * (ENV_WEATHER_MAX - ENV_WEATHER_MIN);
}

function updateEnvironmentCycle(dt) {
  if ((MODES[state.mode] || {}).practice) return;   // Range stays fixed
  const def = MAPS[currentMap] || MAPS.compound;
  const A = TIMES[envFromTime] || TIMES.day, B = TIMES[envToTime] || TIMES.day;
  const W = WEATHER[currentWeather] || WEATHER.clear;

  envPhaseT += dt;
  const t = Math.min(1, envPhaseT / ENV_PHASE_LEN);

  const sunColor = new THREE.Color(A.sunColor).lerp(new THREE.Color(B.sunColor), t);
  const ambient = new THREE.Color(A.ambient).lerp(new THREE.Color(B.ambient), t);
  const skyMul = A.skyMul + (B.skyMul - A.skyMul) * t;
  const sunAmt = A.sun + (B.sun - A.sun) * t;
  const hemiAmt = A.hemi + (B.hemi - A.hemi) * t;

  const sky = tintColor(def.sky, skyMul, ambient);
  scene.background = sky;
  const near = def.fog[0] * W.fogMul, far = def.fog[1] * W.fogMul;
  scene.fog = new THREE.Fog(sky.getHex(), Math.max(8, near), Math.max(30, far));
  sun.intensity = sunAmt * W.dim;
  sun.color.copy(sunColor);
  hemi.intensity = hemiAmt * W.dim;
  hemi.color.copy(ambient);

  const aFrom = TIME_SUN_ANGLES[envFromTime] || TIME_SUN_ANGLES.day;
  const aTo = TIME_SUN_ANGLES[envToTime] || TIME_SUN_ANGLES.day;
  sun.position.set(
    aFrom[0] + (aTo[0] - aFrom[0]) * t,
    aFrom[1] + (aTo[1] - aFrom[1]) * t,
    aFrom[2] + (aTo[2] - aFrom[2]) * t
  );

  if (envPhaseT >= ENV_PHASE_LEN) {
    envPhaseT = 0;
    envFromTime = envToTime;
    currentTime = envFromTime;   // HUD/announcements track the phase that's now active
    const idx = TIME_CYCLE_ORDER.indexOf(envFromTime);
    envToTime = TIME_CYCLE_ORDER[(idx + 1) % TIME_CYCLE_ORDER.length];
  }

  // ----- weather can drift mid-match too, not just at deploy -----
  envWeatherT -= dt;
  if (envWeatherT <= 0) {
    envWeatherT = ENV_WEATHER_MIN + Math.random() * (ENV_WEATHER_MAX - ENV_WEATHER_MIN);
    if (Math.random() < 0.65) {
      const pool = WEATHER_KEYS.filter((k) => k !== currentWeather);
      const next = pick(pool);
      currentWeather = next;
      buildWeatherParticles(WEATHER[next]);
      toast(`Weather shifting — ${WEATHER[next].name}`);
    }
  }
}

// ============================================================
//  WEAPONS — catalog-driven (Phase 2). Stats include gun level + attachments.
// ============================================================
/** Effective stats for the gun in a given slot of the player's live loadout. */
function statsFor(key) {
  const base = gunStats(key, profile);
  if (!base) return base;
  // alt fire mode is a Lv3 unlock and is toggled per-gun with V (R-GUN-1/4)
  const mode = player.fireModes && player.fireModes[key];
  if (mode && base.altUnlocked) return applyFireMode(base, mode);
  return base;
}

// ============================================================
//  BOTS  — allies & enemies
// ============================================================

/**
 * Procedural camo texture, drawn once per team on an offscreen canvas —
 * no image assets needed. Irregular blotches over a base tone so uniforms
 * read as "fabric" instead of a flat color block.
 */
function makeCamoTexture(base, blotches) {
  const size = 64;
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = blotches[i % blotches.length];
    const x = Math.random() * size, y = Math.random() * size;
    const r = 5 + Math.random() * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // wrap blotches across edges so the tile repeats seamlessly
    ctx.beginPath(); ctx.ellipse(x - size, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + size, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - size, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + size, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// one shared texture + material per team — cheap, reused across every soldier
const CAMO_MAT = {
  blue: new THREE.MeshStandardMaterial({ map: makeCamoTexture("#3a4a42", ["#2d3a34", "#4d5c50", "#26302b"]), roughness: 0.85 }),
  red:  new THREE.MeshStandardMaterial({ map: makeCamoTexture("#4a3f36", ["#3a2f28", "#5c4c3c", "#332a22"]), roughness: 0.85 }),
};

// how each gun type looks strapped to a soldier — purely cosmetic, so enemies
// carrying different weapons are visibly distinguishable at a glance. `family`
// picks which part-builder in buildGunModel() assembles it; flags tweak greebles.
const GUN_VISUALS = {
  rifle:    { len: 1.10, thick: 0.16, color: 0x1c1f24, accent: 0x2a2d33, family: "rifle" },
  smg:      { len: 0.72, thick: 0.15, color: 0x24272c, accent: 0x33363c, family: "smg" },
  shotgun:  { len: 0.80, thick: 0.23, color: 0x3a2e22, accent: 0x6b4a2c, family: "shotgun" },
  burst:    { len: 1.05, thick: 0.16, color: 0x22262b, accent: 0x2f333a, family: "rifle", carryHandle: true },
  sniper:   { len: 1.60, thick: 0.13, color: 0x14161a, accent: 0x2a2d33, family: "sniper", scope: "big", bipod: true },
  lmg:      { len: 1.35, thick: 0.24, color: 0x1a1d1f, accent: 0x2c2f33, family: "lmg", bipod: true },
  carbine:  { len: 0.95, thick: 0.16, color: 0x2a2f26, accent: 0x3a4033, family: "rifle", stockStyle: "collapsible" },
  dmr:      { len: 1.35, thick: 0.15, color: 0x3f4033, accent: 0x565645, family: "sniper", scope: "med" },
  autoshot: { len: 0.85, thick: 0.24, color: 0x44351f, accent: 0x2a2118, family: "shotgun", boxmag: true },
  bullpup:  { len: 0.85, thick: 0.18, color: 0x1f2320, accent: 0x2c332c, family: "bullpup", scope: "small" },
  // ---- new weapons (R-GUN-1) ----
  rocket:   { len: 1.70, thick: 0.30, color: 0x39412f, accent: 0x4e5a3d, family: "launcher", scope: "small" },
  gl:       { len: 1.10, thick: 0.28, color: 0x2f3830, accent: 0x424d3f, family: "launcher", drum: true },
  minigun:  { len: 1.55, thick: 0.34, color: 0x1a1d20, accent: 0x2e3338, family: "minigun" },
  flamer:   { len: 1.05, thick: 0.22, color: 0x50331f, accent: 0x6b4526, family: "flamer" },
  laserrifle:{ len: 1.15, thick: 0.18, color: 0x20262e, accent: 0x39e6ff, family: "energy", glow: 0x66e0ff },
  laserpistol:{ len: 0.55, thick: 0.15, color: 0x222a33, accent: 0x39e6ff, family: "energy", glow: 0x66e0ff },
  crossbow: { len: 1.05, thick: 0.14, color: 0x2c2a24, accent: 0x6b5a3c, family: "crossbow", scope: "small" },
  marksman: { len: 1.40, thick: 0.15, color: 0x2a2e28, accent: 0x3c4238, family: "sniper", scope: "med" },
  handcannon:{ len: 0.62, thick: 0.19, color: 0x22252a, accent: 0x6a6f78, family: "smg" },
};

// which procedural gunshot profile (defined in sound.js) each weapon key uses —
// separate from GUN_VISUALS.family so secondary-only guns (no 3D model family)
// still get their own sound (R-AUD).
const GUN_SFX = {
  rocket: "boom", gl: "boom", minigun: "crack", flamer: "pop",
  laserrifle: "snap", laserpistol: "snap", crossbow: "pop",
  marksman: "sharpcrack", handcannon: "boom",
  rifle: "crack", burst: "crack", carbine: "crack", bullpup: "crack", lmg: "crack",
  smg: "snap", machinep: "snap",
  shotgun: "boom", autoshot: "boom", sawedoff: "boom",
  sniper: "sharpcrack", dmr: "sharpcrack",
  pistol: "pop", tacpistol: "pop", revolver: "pop",
};
// shared, cheap materials reused across every soldier (perf: no per-bot allocs)
const SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xcfa07a, roughness: 0.9 });
const HELMET_MAT = new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.8 });
const BOOT_MAT = new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.85 });
const GLOVE_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.8 });
const GUN_MAT_CACHE = {};
function gunMat(gv) {
  return GUN_MAT_CACHE[gv.color] || (GUN_MAT_CACHE[gv.color] = new THREE.MeshStandardMaterial({ color: gv.color, roughness: 0.6 }));
}
const GUN_ACCENT_CACHE = {};
function accentMat(gv) {
  return GUN_ACCENT_CACHE[gv.accent] || (GUN_ACCENT_CACHE[gv.accent] = new THREE.MeshStandardMaterial({ color: gv.accent, roughness: 0.55 }));
}
const METAL_DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.7 });
const LASER_DOT_MAT = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff2b2b, emissiveIntensity: 1.2 });
const LENS_MAT = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, emissive: 0x2a4a6a, emissiveIntensity: 0.6, roughness: 0.3 });

/**
 * Assembles a detailed, category-distinct gun from primitives — full-size for
 * the visual overhaul (R-VIS gun pass). `facing` is +1 for third-person guns
 * (local forward = +z, matching bot mesh.rotation.y convention) or -1 for the
 * first-person viewmodel (camera forward = -z). `atts` is the player's
 * equipped attachment keys for this gun (bots never pass this — no visible
 * attachments on enemies/teammates). Returns a Group with userData.muzzleLocal
 * / ejectLocal (Vector3, local space) for spawning muzzle FX, and userData.flash
 * (a hidden Sprite at the muzzle for the fire flash), and userData.skinnable
 * (materials the player's equipped skin should recolor).
 */
function buildGunModel(gunKey, opts) {
  const facing = (opts && opts.facing) || 1;
  const atts = (opts && opts.atts) || null;
  const gv = GUN_VISUALS[gunKey] || GUN_VISUALS.rifle;
  const fam = gv.family || "rifle";
  const L = gv.len, T = gv.thick;
  // third-person (bots, facing=1) share one cached material per color for perf —
  // many soldiers on screen. The first-person viewmodel (facing=-1) is a single
  // instance, so it gets its OWN material clone: otherwise tinting it for an
  // equipped skin would leak that color onto every bot carrying the same gun.
  const bMat = facing > 0 ? gunMat(gv) : gunMat(gv).clone();
  const aMat = accentMat(gv);
  const skinnable = [bMat];
  const grp = new THREE.Group();
  const fz = (v) => v * facing; // mirror z-offsets for first-person (facing=-1)

  const add = (geo, mat, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, fz(z));
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    grp.add(m);
    return m;
  };

  // ---- core receiver/body, shared by every family ----
  add(new THREE.BoxGeometry(T, T * 0.9, L * 0.68), bMat, 0, 0, 0);
  // pistol grip, hanging below the rear of the receiver
  add(new THREE.BoxGeometry(T * 0.55, T * 1.4, T * 0.5), aMat, 0, -T * 0.95, -L * 0.16, -0.15 * facing);

  let muzzleZ = L * 0.5, magY = -T * 1.5, magZ = 0.02, magH = 0.55, stockLen = L * 0.24;

  if (fam === "smg") {
    add(new THREE.CylinderGeometry(T * 0.24, T * 0.24, L * 0.22, 6), METAL_DARK_MAT, 0, T * 0.05, L * 0.42, Math.PI / 2);
    // flat folding stock
    add(new THREE.BoxGeometry(T * 0.14, T * 0.7, stockLen), aMat, 0, T * 0.1, -L * 0.4);
    magH = 0.42; magZ = 0.12;
  } else if (fam === "shotgun") {
    add(new THREE.CylinderGeometry(T * 0.36, T * 0.36, L * 0.85, 8), bMat, 0, T * 0.1, L * 0.05, Math.PI / 2);
    // pump foregrip
    add(new THREE.BoxGeometry(T * 0.5, T * 0.5, L * 0.16), aMat, 0, -T * 0.55, L * 0.22);
    // tapered wood-tone stock
    add(new THREE.BoxGeometry(T * 0.5, T * 0.85, stockLen * 1.3), aMat, 0, -T * 0.05, -L * 0.42);
    if (gv.boxmag) { magH = 0.5; magZ = 0.14; } else { magH = 0; }
  } else if (fam === "sniper") {
    add(new THREE.CylinderGeometry(T * 0.16, T * 0.19, L * 0.62, 6), METAL_DARK_MAT, 0, 0, L * 0.42, Math.PI / 2);
    const scopeLen = gv.scope === "big" ? L * 0.42 : L * 0.3;
    const scopeR = gv.scope === "big" ? T * 0.32 : T * 0.24;
    add(new THREE.CylinderGeometry(scopeR, scopeR, scopeLen, 8), METAL_DARK_MAT, 0, T * 0.85, L * 0.05, Math.PI / 2);
    add(new THREE.CylinderGeometry(scopeR * 0.85, scopeR * 0.85, 0.02, 8), LENS_MAT, 0, T * 0.85, scopeLen / 2 + L * 0.05, Math.PI / 2);
    add(new THREE.BoxGeometry(T * 0.4, T * 1.0, stockLen * 1.6), aMat, 0, -T * 0.1, -L * 0.44);
    magH = 0.3; magZ = -0.02;
  } else if (fam === "lmg") {
    add(new THREE.CylinderGeometry(T * 0.34, T * 0.34, L * 0.7, 8), METAL_DARK_MAT, 0, T * 0.1, L * 0.15, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 10), aMat, 0, -T * 1.6, L * 0.02); // drum mag
    add(new THREE.BoxGeometry(T * 0.5, T * 1.0, stockLen * 1.4), aMat, 0, -T * 0.05, -L * 0.44);
    magH = 0; // drum handled above, no separate hanging mag
  } else if (fam === "bullpup") {
    add(new THREE.CylinderGeometry(T * 0.24, T * 0.24, L * 0.3, 6), METAL_DARK_MAT, 0, T * 0.05, L * 0.44, Math.PI / 2);
    add(new THREE.BoxGeometry(T * 0.3, T * 0.3, T * 0.5), METAL_DARK_MAT, 0, T * 0.7, -L * 0.05); // compact optic
    // mag sits BEHIND the grip — the bullpup signature silhouette
    magY = -T * 1.4; magZ = -L * 0.22; magH = 0.5;
    stockLen = 0; // no separate stock — receiver runs to the rear of the gun
  } else if (fam === "launcher") {
    // fat smooth-bore tube with a shoulder rest — reads instantly as ordnance
    add(new THREE.CylinderGeometry(T * 0.62, T * 0.62, L * 0.86, 10), METAL_DARK_MAT, 0, T * 0.2, L * 0.06, Math.PI / 2);
    add(new THREE.CylinderGeometry(T * 0.74, T * 0.62, L * 0.12, 10), aMat, 0, T * 0.2, L * 0.5, Math.PI / 2);   // muzzle flare
    add(new THREE.CylinderGeometry(T * 0.7, T * 0.7, L * 0.1, 10), aMat, 0, T * 0.2, -L * 0.44, Math.PI / 2);    // rear venturi
    if (gv.drum) add(new THREE.CylinderGeometry(T * 0.66, T * 0.66, T * 0.5, 10), aMat, 0, -T * 0.5, L * 0.02, 0);
    add(new THREE.BoxGeometry(T * 0.24, T * 0.4, L * 0.24), aMat, 0, T * 0.95, -L * 0.02);   // top rail/optic
    magH = 0;
  } else if (fam === "minigun") {
    // rotating barrel cluster + big receiver housing
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(new THREE.CylinderGeometry(T * 0.11, T * 0.11, L * 0.72, 6),
          METAL_DARK_MAT, Math.cos(a) * T * 0.3, T * 0.15 + Math.sin(a) * T * 0.3, L * 0.3, Math.PI / 2);
    }
    add(new THREE.BoxGeometry(T * 0.9, T * 0.9, L * 0.4), bMat, 0, T * 0.15, -L * 0.16);
    add(new THREE.CylinderGeometry(T * 0.5, T * 0.5, T * 0.4, 10), aMat, 0, -T * 0.6, -L * 0.2, 0);   // ammo drum
    magH = 0;
  } else if (fam === "flamer") {
    add(new THREE.CylinderGeometry(T * 0.17, T * 0.17, L * 0.8, 8), METAL_DARK_MAT, 0, T * 0.05, L * 0.2, Math.PI / 2);
    add(new THREE.CylinderGeometry(T * 0.3, T * 0.22, L * 0.14, 8), aMat, 0, T * 0.05, L * 0.56, Math.PI / 2);  // nozzle
    // twin fuel tanks slung under the body
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(T * 0.32, T * 0.32, L * 0.44, 8), aMat, side * T * 0.34, -T * 0.7, -L * 0.16, Math.PI / 2);
    }
    add(new THREE.CylinderGeometry(0.03, 0.03, L * 0.4, 5), METAL_DARK_MAT, 0, -T * 0.35, L * 0.1, Math.PI / 2); // fuel line
    magH = 0;
  } else if (fam === "energy") {
    // slim housing with a glowing emitter and side cells
    const glowMat = new THREE.MeshStandardMaterial({
      color: gv.glow || 0x66e0ff, emissive: gv.glow || 0x66e0ff, emissiveIntensity: 1.1,
    });
    add(new THREE.BoxGeometry(T * 0.5, T * 0.5, L * 0.6), METAL_DARK_MAT, 0, T * 0.1, L * 0.12);
    add(new THREE.CylinderGeometry(T * 0.14, T * 0.2, L * 0.26, 8), glowMat, 0, T * 0.1, L * 0.5, Math.PI / 2);  // emitter
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(T * 0.1, T * 0.28, L * 0.3), glowMat, side * T * 0.3, T * 0.1, L * 0.05);        // cells
    }
    add(new THREE.BoxGeometry(T * 0.36, T * 0.7, stockLen * 0.9), aMat, 0, -T * 0.02, -L * 0.4);
    magH = 0;
  } else if (fam === "crossbow") {
    add(new THREE.BoxGeometry(T * 0.3, T * 0.24, L * 0.9), bMat, 0, T * 0.05, L * 0.05);                  // stock rail
    // the limbs, swept forward
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(L * 0.42, 0.06, 0.1), aMat, side * L * 0.2, T * 0.2, L * 0.34, 0, 0, side * 0.35);
    }
    add(new THREE.BoxGeometry(L * 0.78, 0.03, 0.03), METAL_DARK_MAT, 0, T * 0.2, L * 0.2);               // string
    add(new THREE.CylinderGeometry(0.035, 0.035, L * 0.5, 5), aMat, 0, T * 0.28, L * 0.18, Math.PI / 2);  // loaded bolt
    add(new THREE.BoxGeometry(T * 0.3, T * 0.7, stockLen), aMat, 0, -T * 0.05, -L * 0.42);
    magH = 0;
  } else { // "rifle" family — also covers burst/carbine
    add(new THREE.CylinderGeometry(T * 0.2, T * 0.2, L * 0.34, 6), METAL_DARK_MAT, 0, 0, L * 0.42, Math.PI / 2);
    add(new THREE.BoxGeometry(T * 0.1, T * 0.5, T * 0.3), aMat, 0, T * 0.55, L * 0.34); // front sight post
    const stockShort = gv.stockStyle === "collapsible";
    add(new THREE.BoxGeometry(T * (stockShort ? 0.3 : 0.42), T * 0.85, stockLen * (stockShort ? 0.7 : 1.0)), aMat, 0, -T * 0.05, -L * 0.42);
    if (gv.carryHandle) add(new THREE.BoxGeometry(T * 0.18, T * 0.5, L * 0.3), aMat, 0, T * 0.65, L * 0.05);
    magH = 0.5; magZ = 0.06;
  }

  if (magH > 0) add(new THREE.BoxGeometry(T * 0.42, magH, T * 0.34), aMat, 0, -T * 0.7 - magH / 2, L * magZ, 0.1 * facing);

  // bipod: two thin angled legs near the front, folded slightly forward-down
  if (gv.bipod) {
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 4), METAL_DARK_MAT, side * T * 0.5, -T * 1.1, L * 0.4, 0.5);
    }
  }

  // ---- attachments (player weapon only — bots never carry these) ----
  if (atts && atts.length) {
    const hasBuiltinScope = fam === "sniper";
    if (atts.includes("scope") && !hasBuiltinScope) {
      add(new THREE.CylinderGeometry(T * 0.22, T * 0.22, L * 0.32, 8), METAL_DARK_MAT, 0, T * 0.75, L * 0.06, Math.PI / 2);
      add(new THREE.CylinderGeometry(T * 0.19, T * 0.19, 0.02, 8), LENS_MAT, 0, T * 0.75, L * 0.06 + L * 0.16, Math.PI / 2);
    }
    if (atts.includes("grip") && fam !== "shotgun") {
      add(new THREE.BoxGeometry(T * 0.3, T * 0.6, T * 0.3), METAL_DARK_MAT, 0, -T * 1.0, L * 0.3);
    }
    if (atts.includes("laser")) {
      add(new THREE.BoxGeometry(T * 0.16, T * 0.16, T * 0.5), METAL_DARK_MAT, T * 0.4, -T * 0.2, L * 0.28);
      add(new THREE.SphereGeometry(0.025, 6, 6), LASER_DOT_MAT, T * 0.4, -T * 0.2, L * 0.28 + T * 0.28);
    }
    if (atts.includes("extmag") && magH > 0) {
      // extension sleeve tacked on below the existing magazine
      add(new THREE.BoxGeometry(T * 0.34, magH * 0.8, T * 0.26), METAL_DARK_MAT, 0, -T * 0.7 - magH - magH * 0.35, L * magZ, 0.1 * facing);
    }
    if (atts.includes("silencer")) {
      muzzleZ += L * 0.22;
      add(new THREE.CylinderGeometry(T * 0.17, T * 0.2, L * 0.24, 8), METAL_DARK_MAT, 0, 0, L * 0.5 + L * 0.1, Math.PI / 2);
    }
  }

  // ---- muzzle flash sprite (hidden by default; toggled on fire) ----
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: FLASH_TEX, color: 0xffcf7a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flash.scale.set(0.55, 0.55, 0.55);
  flash.visible = false;
  flash.position.set(0, T * 0.05, fz(muzzleZ));
  grp.add(flash);

  grp.userData.muzzleLocal = new THREE.Vector3(0, T * 0.05, fz(muzzleZ));
  grp.userData.ejectLocal = new THREE.Vector3(T * 0.55, T * 0.15, fz(L * 0.05));
  grp.userData.flash = flash;
  grp.userData.skinnable = skinnable;
  return grp;
}

const STEEL_MAT = new THREE.MeshStandardMaterial({ color: 0xc7cdd6, roughness: 0.25, metalness: 0.85 });
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x5c4022, roughness: 0.8 });
const WRAP_MAT = new THREE.MeshStandardMaterial({ color: 0x201d1a, roughness: 0.9 });

/**
 * Melee weapons (slot 3) get their own hand-held shapes — a bare fist, a short
 * combat knife, a long katana, or a hafted axe — instead of falling back to a
 * gun silhouette. Only used for the first-person viewmodel (bots never wield
 * melee weapons visibly). Returns the same userData contract as buildGunModel
 * minus muzzle FX (melee has no flash/casings/smoke).
 */
function buildMeleeModel(meleeKey, facing) {
  const grp = new THREE.Group();
  const fz = (v) => v * facing;
  const add = (geo, mat, x, y, z, rx, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, fz(z));
    if (rx) m.rotation.x = rx;
    if (rz) m.rotation.z = rz;
    grp.add(m);
    return m;
  };

  if (meleeKey === "knife") {
    add(new THREE.BoxGeometry(0.06, 0.08, 0.18), WRAP_MAT, 0, -0.04, -0.06);
    add(new THREE.BoxGeometry(0.03, 0.05, 0.03), STEEL_MAT, 0, 0.01, 0.04); // guard
    add(new THREE.BoxGeometry(0.028, 0.035, 0.3), STEEL_MAT, 0, -0.015, 0.24);
  } else if (meleeKey === "katana") {
    add(new THREE.BoxGeometry(0.055, 0.06, 0.26), WRAP_MAT, 0, -0.05, -0.12);
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.5 }), 0, -0.05, 0.02, Math.PI / 2);
    add(new THREE.BoxGeometry(0.022, 0.05, 0.62), STEEL_MAT, 0, -0.03, 0.36);
  } else if (meleeKey === "axe") {
    add(new THREE.CylinderGeometry(0.022, 0.028, 0.4, 6), WOOD_MAT, 0, -0.06, 0.02, Math.PI / 2);
    add(new THREE.BoxGeometry(0.05, 0.2, 0.18), METAL_DARK_MAT, 0.07, -0.02, 0.2);
    add(new THREE.BoxGeometry(0.05, 0.06, 0.05), METAL_DARK_MAT, -0.02, -0.02, 0.2); // back spike
  } else { // "fist" (and any unrecognized key) — bare gloved hands
    add(new THREE.BoxGeometry(0.19, 0.17, 0.19), GLOVE_MAT, 0.03, -0.05, 0.14);
    add(new THREE.BoxGeometry(0.14, 0.13, 0.14), GLOVE_MAT, -0.14, -0.14, -0.02);
  }

  // melee items are naturally small/compact — scale the viewmodel up so it reads
  // clearly on screen instead of looking tiny next to how large the guns render
  grp.scale.setScalar(1.7);
  grp.userData.skinnable = [];
  return grp;
}

/**
 * Utility/throwable items (slot 4) get a shape driven by the item's `kind`
 * (grenade, canister, bottle, kit, pad, panel) and tinted with its own catalog
 * color — data-driven so a newly added UTILS entry still renders sensibly via
 * the default case. First-person viewmodel only, no muzzle FX.
 */
function buildUtilityModel(utilKey, facing) {
  const u = UTILS[utilKey] || UTILS.frag;
  const mat = new THREE.MeshStandardMaterial({ color: u.color, roughness: 0.5 });
  const grp = new THREE.Group();
  const fz = (v) => v * facing;
  const add = (geo, m, x, y, z, rx) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, fz(z));
    if (rx) mesh.rotation.x = rx;
    grp.add(mesh);
    return mesh;
  };

  switch (u.kind) {
    case "frag":
      add(new THREE.SphereGeometry(0.12, 10, 8), mat, 0, -0.04, 0.05);
      add(new THREE.BoxGeometry(0.035, 0.11, 0.035), METAL_DARK_MAT, 0.09, 0.05, 0.05); // spoon/lever
      break;
    case "flash":
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), mat, 0, -0.04, 0.05, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), METAL_DARK_MAT, 0, -0.04, 0.16, Math.PI / 2);
      break;
    case "smoke":
    case "freeze":
      add(new THREE.CylinderGeometry(0.095, 0.095, 0.24, 10), mat, 0, -0.04, 0.05, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 10), METAL_DARK_MAT, 0, -0.04, 0.18, Math.PI / 2);
      break;
    case "fire": { // molotov: glass bottle + rag
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 0.2, transparent: true, opacity: 0.82 });
      add(new THREE.CylinderGeometry(0.085, 0.1, 0.22, 8), glassMat, 0, -0.05, 0.03, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.035, 0.045, 0.08, 8), glassMat, 0, -0.05, 0.16, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.02, 0.15), new THREE.MeshStandardMaterial({ color: 0xd8d0b0 }), 0, 0.01, 0.14);
      break;
    }
    case "heal":
      add(new THREE.BoxGeometry(0.24, 0.15, 0.19), mat, 0, -0.05, 0.05);
      add(new THREE.BoxGeometry(0.15, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff }), 0, 0.02, 0.15);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff }), 0, 0.02, 0.15);
      break;
    case "pad":
      add(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 12), mat, 0, -0.08, 0.08);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.045, 12), new THREE.MeshStandardMaterial({ color: u.color, emissive: u.color, emissiveIntensity: 0.4 }), 0, -0.06, 0.08);
      break;
    case "shield":
      // dark frame first so the panel reads clearly against any backdrop (sky, snow, etc.)
      add(new THREE.BoxGeometry(0.3, 0.36, 0.025), METAL_DARK_MAT, 0, -0.02, 0.015);
      add(new THREE.BoxGeometry(0.26, 0.32, 0.035), new THREE.MeshStandardMaterial({ color: u.color, transparent: true, opacity: 0.85, roughness: 0.2, emissive: u.color, emissiveIntensity: 0.25 }), 0, -0.02, 0.02);
      add(new THREE.BoxGeometry(0.05, 0.34, 0.05), METAL_DARK_MAT, -0.14, -0.02, 0.02); // handle rail
      break;
    default:
      add(new THREE.SphereGeometry(0.1, 8, 8), mat, 0, -0.04, 0.05);
  }
  // small gloved grip stub so the item doesn't look like it's floating in the hand
  add(new THREE.BoxGeometry(0.08, 0.12, 0.08), GLOVE_MAT, 0, -0.17, -0.05);

  // same reasoning as melee: these are small hand props, scale up for on-screen readability
  grp.scale.setScalar(1.7);
  grp.userData.skinnable = [];
  return grp;
}

/**
 * Picks the right builder for whatever's equipped: a real gun, a melee weapon,
 * or a utility/throwable — so every slot gets its own look instead of every
 * non-gun slot silently falling back to a rifle silhouette.
 */
function buildEquippedModel(key, opts) {
  const gunDef = GUNS[key];
  if (gunDef && gunDef.melee) return buildMeleeModel(key, (opts && opts.facing) || 1);
  if (UTILS[key]) return buildUtilityModel(key, (opts && opts.facing) || 1);
  return buildGunModel(key, opts);
}

/**
 * A jointed low-poly soldier: camo fatigues + a bold team-colored vest/pack for
 * instant team read, hinged shoulders/hips so animateSoldier() can walk/aim it.
 * Returns the root Group; rig pivots live on root.userData.rig for animation.
 */
function makeSoldier(teamColor, roleColor, gunKey) {
  const g = new THREE.Group();
  const isRed = teamColor === 0xc94040;
  const camoMat = isRed ? CAMO_MAT.red : CAMO_MAT.blue;
  const vestMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55, emissive: teamColor, emissiveIntensity: 0.12 });

  // ---- torso (fixed — hips group below is what actually gets positioned) ----
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.0, 0.52), camoMat);
  torso.position.y = 1.37; torso.castShadow = true; g.add(torso);

  // bold team-colored chest rig — the main "read teams instantly" signal
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.62, 0.16), vestMat);
  vest.position.set(0, 1.42, 0.32); vest.castShadow = true; g.add(vest);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.22), vestMat);
  pack.position.set(0, 1.48, -0.34); pack.castShadow = true; g.add(pack);

  // ---- head assembly ----
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), SKIN_MAT);
  head.position.y = 2.14; head.castShadow = true; g.add(head);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), HELMET_MAT);
  helmet.position.y = 2.37; g.add(helmet);
  if (roleColor !== undefined) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.11, 0.64),
      new THREE.MeshStandardMaterial({ color: roleColor, emissive: roleColor, emissiveIntensity: 0.55 })
    );
    band.position.y = 2.52; g.add(band);
  }

  // ---- legs — hinged at the hip so they can swing when walking ----
  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.22, 0.9, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.86, 0.32), camoMat);
    thigh.position.y = -0.43; thigh.castShadow = true; pivot.add(thigh);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.38), BOOT_MAT);
    boot.position.y = -0.86; boot.castShadow = true; pivot.add(boot);
    g.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-1), rightLeg = makeLeg(1);

  // ---- arms — hinged at the shoulder; the right hand carries the gun ----
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.56, 1.78, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), camoMat);
    upper.position.y = -0.4; upper.castShadow = true; pivot.add(upper);
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), GLOVE_MAT);
    glove.position.y = -0.78; pivot.add(glove);
    g.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-1), rightArm = makeArm(1);

  // full detailed gun model, distinct per weapon family — no visible attachments
  // on bots (atts omitted), materials shared across soldiers for performance
  const gun = buildGunModel(gunKey, { facing: 1 });
  gun.position.set(-0.12, -0.62, 0.4); rightArm.add(gun);

  g.userData.rig = { leftLeg, rightLeg, leftArm, rightArm };
  g.userData.gun = gun;
  g.userData.flash = gun.userData.flash;
  return g;
}

/**
 * Per-frame limb animation: idle sway damps to a stop, walking swings legs
 * and counter-swings arms, an active target lifts the gun arm into an aim
 * pose (with a little kick on every shot), and death/downed states get their
 * own falling/collapsed poses. Called once per bot per frame from frame().
 */
function animateSoldier(b, dt) {
  const mesh = b.mesh, rig = mesh && mesh.userData && mesh.userData.rig;
  if (!mesh) return;

  // ---- falling over on a kill: tip forward/sideways, then vanish (R-VIS) ----
  // eases from whatever pose the mesh is already in (standing, or mid-slump if it
  // was downed first) toward flat-on-the-ground, so there's no snap either way.
  if (b.deathAnim !== undefined && b.deathAnim > 0) {
    b.deathAnim = Math.max(0, b.deathAnim - dt / 0.45);
    const ease = Math.min(1, dt * 8);
    mesh.rotation.x += (1.3 - mesh.rotation.x) * ease;
    mesh.rotation.z += ((b._deathTiltZ || 0) - mesh.rotation.z) * ease;
    mesh.position.y += (-0.12 - mesh.position.y) * ease;
    if (b.deathAnim === 0) mesh.visible = false;
    return;
  }

  if (b.isDummy || !b.alive || !rig) return;

  // riding a vehicle: updateVehicles() owns this bot's position/rotation, and
  // a seated soldier shouldn't be running on the spot (R-VEH-1)
  if (b.vehicle) {
    const ease = Math.min(1, dt * 8);
    rig.leftLeg.rotation.x += (-0.9 - rig.leftLeg.rotation.x) * ease;   // knees up, seated
    rig.rightLeg.rotation.x += (-0.9 - rig.rightLeg.rotation.x) * ease;
    rig.leftArm.rotation.x += (-0.5 - rig.leftArm.rotation.x) * ease;
    rig.rightArm.rotation.x += (-0.5 - rig.rightArm.rotation.x) * ease;
    mesh.rotation.x += (0 - mesh.rotation.x) * ease;
    return;
  }

  // ---- downed: slumped forward instead of the old cartoonish squash ----
  if (b.downed) {
    mesh.rotation.x += (1.05 - mesh.rotation.x) * Math.min(1, dt * 6);
    return;
  }

  // ---- crouch / jump / slide stance (R-AI-5) — decremented here (not in
  // updateBot) so a bot that loses its target mid-hop still finishes the
  // animation instead of freezing in a crouch or mid-air forever ----
  if (b.jumpT > 0) b.jumpT = Math.max(0, b.jumpT - dt);
  if (b.slideT > 0) b.slideT = Math.max(0, b.slideT - dt);
  const poseEase = Math.min(1, dt * 8);
  let targetY = 0, targetTiltX = 0;
  if (b.jumpT > 0) {
    targetY = Math.sin((1 - b.jumpT / 0.5) * Math.PI) * 0.5;
  } else if (b.slideT > 0) {
    targetY = -0.22; targetTiltX = 0.35;
  } else if (b.crouching) {
    targetY = -0.3;
  }
  mesh.position.y += (targetY - mesh.position.y) * poseEase;
  mesh.rotation.x += (targetTiltX - mesh.rotation.x) * poseEase;

  // ---- walk cycle: amplitude eases toward 0 (idle) or 1 (moving) ----
  const dx = b.pos.x - (b._animPrevX ?? b.pos.x), dz = b.pos.z - (b._animPrevZ ?? b.pos.z);
  const moving = (dx * dx + dz * dz) > (0.0009 * dt * dt) && dt > 0;
  b._animPrevX = b.pos.x; b._animPrevZ = b.pos.z;
  b.walkAmp = (b.walkAmp || 0) + ((moving ? 1 : 0) - (b.walkAmp || 0)) * Math.min(1, dt * 6);
  const prevWalkPhase = b.walkPhase || 0;
  b.walkPhase = prevWalkPhase + dt * 9;
  const swing = Math.sin(b.walkPhase) * b.walkAmp * 0.55;

  rig.leftLeg.rotation.x = swing;
  rig.rightLeg.rotation.x = -swing;

  // footsteps — only once actually walking (amp eased up), one per half-stride (R-AUD)
  if (b.walkAmp > 0.6 && Math.floor(b.walkPhase / Math.PI) > Math.floor(prevWalkPhase / Math.PI)) {
    const surface = (MAPS[currentMap] || MAPS.compound).surface || "dirt";
    Sound.playFootstep(surface, { pos: b.pos, listenerPos: player.pos, listenerYaw: player.yaw });
  }

  // ---- fire kick: a quick pop of extra rotation on the gun arm ----
  if (b.fireKickT > 0) b.fireKickT = Math.max(0, b.fireKickT - dt);
  const kick = b.fireKickT ? (b.fireKickT / 0.12) * 0.18 : 0;
  // muzzle flash sprite only stays lit for the first sliver of the kick window
  if (b.gunFlash) b.gunFlash.visible = b.fireKickT > 0.06;

  if (b._hasTarget) {
    // aiming: gun arm raises to a ready pose, off-hand steadies near the foregrip
    rig.rightArm.rotation.x += (-1.1 - kick - rig.rightArm.rotation.x) * Math.min(1, dt * 10);
    rig.leftArm.rotation.x += (-1.0 - rig.leftArm.rotation.x) * Math.min(1, dt * 10);
  } else {
    rig.rightArm.rotation.x = -swing * 0.9;
    rig.leftArm.rotation.x = swing * 0.9;
  }
}

const bots = [];
let botIdSeq = 0;
const BOT_NAMES = ["Reyes", "Vasquez", "Chen", "Novak", "Okafor", "Idris", "Lindqvist",
                   "Barros", "Kaminski", "Tanaka", "Moreau", "Silva"];

/** Pick this bot's individual weapon from its role's pool (R-AI, gun variety). */
function pickBotGun(role) {
  const pool = role.guns && role.guns.length ? role.guns : [role.gun];
  return pool[(Math.random() * pool.length) | 0];
}
function spawnBot(team, forceRole) {
  const isEnemy = team === "red";
  const roleKey = forceRole || ROLE_KEYS[(Math.random() * ROLE_KEYS.length) | 0];
  const role = ROLES[roleKey];
  const gunKey = pickBotGun(role);
  const mesh = makeSoldier(isEnemy ? 0xc94040 : 0x3f78c9, role.color, gunKey);
  scene.add(mesh);
  const base = isEnemy ? RED_SPAWN : BLUE_SPAWN;
  const bot = {
    id: ++botIdSeq,
    name: BOT_NAMES[botIdSeq % BOT_NAMES.length],
    team, role: roleKey, roleData: role, mesh,
    gunKey, gunGroup: mesh.userData.gun, gunFlash: mesh.userData.flash,
    hp: role.hp, maxHp: role.hp,
    speed: 6 * role.speed,
    pos: new THREE.Vector3(base.x + (Math.random() * 12 - 6), 0, base.z + (Math.random() * 8 - 4)),
    vel: new THREE.Vector3(),
    alive: true, cd: 0, seenAt: 0, respawnAt: 0,
    // Phase 3 AI state
    ai: "advance",          // advance | cover | flank | engage | revive | order
    aiTimer: 0,             // when to re-think
    coverPos: null,
    flankSign: Math.random() < 0.5 ? -1 : 1,
    nadeCd: 6 + Math.random() * 8,
    downed: false, bleed: 0, reviveProgress: 0,
    healCd: 0,
    chatCd: 6 + Math.random() * 14,     // ambient banter timer (R-AI-4)
    // mobility flavor (R-AI-5): strafing/sprint/crouch/jump/slide + live weapon swaps
    strafePhase: Math.random() * Math.PI * 2,
    wantSprint: false, crouching: false, jumpT: 0, slideT: 0,
    weaponSwitchCd: 4 + Math.random() * 8,
    // vehicles (R-VEH-1)
    vehicle: null, vehSeat: 0, driveTo: null, vehicleCd: Math.random() * 3,
  };
  mesh.position.copy(bot.pos);
  bots.push(bot);
  return bot;
}

/**
 * Swaps a live bot's carried weapon mid-match — rebuilds its arm-mounted gun
 * model in place (same mount point as makeSoldier used) and repoints
 * gunGroup/gunFlash so muzzle FX and gunfire sound keep working (R-AI-5).
 * Only disposes the outgoing gun's geometries — its materials are the shared
 * per-color cache from gunMat()/accentMat(), reused by every other soldier.
 */
function switchBotGun(b, newKey) {
  const rig = b.mesh.userData.rig;
  if (!rig || !b.gunGroup || newKey === b.gunKey) return;
  rig.rightArm.remove(b.gunGroup);
  b.gunGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  const newGun = buildGunModel(newKey, { facing: 1 });
  newGun.position.set(-0.12, -0.62, 0.4); // matches makeSoldier's mount offset
  rig.rightArm.add(newGun);
  b.gunKey = newKey;
  b.gunGroup = newGun;
  b.gunFlash = newGun.userData.flash;
}

// ============================================================
//  SHOOTING RANGE — static practice targets (R-MOD-5)
// ============================================================
/** A simple pop-up silhouette target: post + panel, no weapon, no AI. */
function makeTargetDummy() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 2.9, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x3a3f36, roughness: 0.9 })
  );
  post.position.y = 1.45; g.add(post);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.0, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x22261f, roughness: 0.85 })
  );
  panel.position.y = 2.5; panel.castShadow = true; g.add(panel);
  // a bright ring so hits register visually at a glance
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.05, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xd8453f, emissive: 0xd8453f, emissiveIntensity: 0.5 })
  );
  ring.position.set(0, 2.6, 0.05); g.add(ring);
  return g;
}

/** Lay out static targets at increasing distance down-range from BLUE_SPAWN. */
function buildRangeTargets(count) {
  const lanesX = [-16, -8, 0, 8, 16];
  const distances = [14, 26, 38, 52, 66, 80];
  const n = Math.max(6, count || 6);
  for (let i = 0; i < n; i++) {
    const x = lanesX[i % lanesX.length] + (Math.random() * 4 - 2);
    const dz = distances[i % distances.length];
    const mesh = makeTargetDummy();
    scene.add(mesh);
    const pos = new THREE.Vector3(x, 0, BLUE_SPAWN.z + dz);
    mesh.position.copy(pos);
    bots.push({
      id: ++botIdSeq, name: `Target ${i + 1}`, isDummy: true,
      team: "red", role: null, roleData: null, mesh,
      hp: 40, maxHp: 40, pos, vel: new THREE.Vector3(),
      alive: true, cd: 0, seenAt: 0, respawnAt: 0,
      ai: "advance", aiTimer: 0, coverPos: null, flankSign: 1, nadeCd: 999,
      downed: false, bleed: 0, reviveProgress: 0, healCd: 0, chatCd: 999999,
    });
  }
}

// ============================================================
//  PLAYER STATE
// ============================================================
const player = {
  pos: new THREE.Vector3().copy(BLUE_SPAWN),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 150, maxHp: 150,
  height: 2.4, radius: 0.5,
  onGround: true,
  stamina: 100, sliding: false, slideT: 0,
  alive: true, respawnAt: 0,
  zip: null, zipT: 0,                 // zipline ride state (R-MAP-4)
  vehicle: null,                      // vehicle you're riding/driving (R-VEH-1)
  team: "blue",                       // the player always fights for blue
  downed: false, bleed: 0, reviveProgress: 0, reviverName: "",
  role: "rusher", roleData: ROLES.rusher, speedMul: 1,
  reviveTargetProgress: 0,
  armor: 0, maxArmor: 0,
  slot: 0,
  loadout: profile.loadout.slice(),   // [primary, secondary, melee, utility]
  ammo: {}, reserve: {},
  fireCd: 0, reloading: 0, ads: false,
  kills: 0, assists: 0,
  utilUses: 0, utilCd: 0,            // R-ECO-6 (~30s between uses)
  burstLeft: 0, burstCd: 0,
  frozenT: 0,
  fireModes: {},        // per-gun alt fire selection (R-GUN-1)
  spinT: 0,             // minigun wind-up
};

/** Key of the item in the active slot. */
function curKey() { return player.loadout[player.slot]; }
/** Live stats for the equipped gun (null when the utility slot is active). */
function curWeapon() {
  const k = curKey();
  return GUNS[k] ? statsFor(k) : null;
}
function isUtilSlot() { return player.slot === 3; }

/** Apply the chosen role's stats to the player (R-ROL-1/2). */
function applyRole(roleKey) {
  const r = ROLES[roleKey] || ROLES.rusher;
  player.role = roleKey;
  profile.role = roleKey;      // weapon eligibility follows the active role (R-GUN-5)
  player.roleData = r;
  player.maxHp = r.hp;
  player.hp = Math.min(player.hp || r.hp, r.hp);
  player.speedMul = r.speed;
}

/** Fill mags/reserves for the current loadout — called on spawn (R-LDO-3, R-RSP-2). */
/**
 * Roles can only carry weapons that suit them (R-GUN-5). If the saved loadout
 * has something the current role can't use (you bought an LMG as a Heavy then
 * switched to Sniper), swap that slot to the best weapon the role CAN carry
 * rather than leaving them empty-handed.
 */
function enforceRoleLoadout() {
  const role = profile.role || selRole || "rusher";
  let changed = false;
  for (let slot = 0; slot < 3; slot++) {
    const k = profile.loadout[slot];
    if (!k || !GUNS[k] || roleCanUse(k, role)) continue;
    // prefer something already owned; fall back to the free starter for the slot
    const owned = profile.ownedGuns.filter(x => GUNS[x].slot === slot && roleCanUse(x, role));
    const fallback = owned[0] || Object.keys(GUNS).find(x => GUNS[x].slot === slot && GUNS[x].free);
    if (fallback) { profile.loadout[slot] = fallback; changed = true; }
  }
  if (changed) { P.save(); toast("Loadout adjusted to fit your role"); }
  return changed;
}

function applyLoadout() {
  enforceRoleLoadout();
  player.loadout = profile.loadout.slice();
  player.ammo = {}; player.reserve = {};
  for (const k of player.loadout) {
    const g = GUNS[k];
    if (!g) continue;
    const s = statsFor(k);
    player.ammo[k] = s.mag;
    player.reserve[k] = g.reserve;
  }
  const a = ARMOR[profile.armor] || ARMOR.none;
  player.maxArmor = a.value;
  player.armor = a.value;
  const u = UTILS[player.loadout[3]];
  player.utilUses = u ? u.uses : 0;
  player.utilCd = 0;
  player.slot = GUNS[player.loadout[0]] ? 0 : 1;
  player.burstLeft = 0;
}

// ============================================================
//  GUN FX — shared soft-glow texture, pooled shell casings + smoke puffs
//  (pooled so rapid fire from many bots never allocates new meshes mid-match)
// ============================================================
function makeGlowTexture() {
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 32;
  const ctx = cnv.getContext("2d");
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cnv);
}
const FLASH_TEX = makeGlowTexture();

const CASING_GEOM = new THREE.BoxGeometry(0.035, 0.035, 0.11);
const CASING_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.4, metalness: 0.6 });
const CASING_COUNT = 40;
const casingPool = [];
for (let i = 0; i < CASING_COUNT; i++) {
  const m = new THREE.Mesh(CASING_GEOM, CASING_MAT);
  m.visible = false;
  scene.add(m);
  casingPool.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, active: false });
}
let casingCursor = 0;
function spawnCasing(pos, rightDir) {
  const c = casingPool[casingCursor];
  casingCursor = (casingCursor + 1) % CASING_COUNT;
  c.mesh.position.copy(pos);
  c.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  c.vel.copy(rightDir).multiplyScalar(1.2 + Math.random() * 1.2);
  c.vel.y = 2.0 + Math.random() * 1.2;
  c.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  c.life = 0.9;
  c.active = true;
  c.mesh.visible = true;
}

const SMOKE_COUNT = 20;
const smokePool = [];
for (let i = 0; i < SMOKE_COUNT; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: FLASH_TEX, color: 0xaaaaaa, transparent: true, depthWrite: false, opacity: 0,
  }));
  s.visible = false;
  scene.add(s);
  smokePool.push({ sprite: s, life: 0, active: false });
}
let smokeCursor = 0;
function spawnSmoke(pos) {
  const s = smokePool[smokeCursor];
  smokeCursor = (smokeCursor + 1) % SMOKE_COUNT;
  s.sprite.position.copy(pos);
  s.sprite.scale.setScalar(0.18);
  s.sprite.material.opacity = 0.4;
  s.life = 0.5;
  s.active = true;
  s.sprite.visible = true;
}

/** World-space muzzle position of an assembled gun Group (from buildGunModel). */
function gunWorldMuzzle(gunGrp, out) {
  gunGrp.updateWorldMatrix(true, false);
  return out.copy(gunGrp.userData.muzzleLocal).applyMatrix4(gunGrp.matrixWorld);
}
/** Fires the full muzzle FX bundle (flash + casing + smoke) for one shot. */
const _fxRight = new THREE.Vector3(), _fxPos = new THREE.Vector3(), _fxQuat = new THREE.Quaternion();
function fireMuzzleFX(gunGrp) {
  if (!gunGrp) return;
  gunGrp.getWorldQuaternion(_fxQuat);
  gunWorldMuzzle(gunGrp, _fxPos);
  gunGrp.userData.flash.visible = true;
  gunGrp.userData.flash.material.rotation = Math.random() * Math.PI;
  _fxRight.set(1, 0, 0).applyQuaternion(_fxQuat);
  spawnCasing(_fxPos, _fxRight);
  spawnSmoke(_fxPos);
}
function updateGunFX(dt) {
  for (const c of casingPool) {
    if (!c.active) continue;
    c.life -= dt;
    c.vel.y -= 9.8 * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += c.spin.x * dt;
    c.mesh.rotation.y += c.spin.y * dt;
    if (c.life <= 0 || c.mesh.position.y < -2) { c.active = false; c.mesh.visible = false; }
  }
  for (const s of smokePool) {
    if (!s.active) continue;
    s.life -= dt;
    const k = Math.max(0, s.life / 0.5);
    s.sprite.scale.setScalar(0.18 + (1 - k) * 0.5);
    s.sprite.material.opacity = 0.4 * k;
    s.sprite.position.y += dt * 0.4;
    if (s.life <= 0) { s.active = false; s.sprite.visible = false; }
  }
}

// first-person weapon viewmodel — rebuilt whenever the equipped weapon or its
// attachments change (see the signature check in updatePlayer()). Starts as a
// placeholder rifle; the very first frame's signature check swaps it in for
// real before anything is rendered to the player.
let viewGun = buildGunModel("rifle", { facing: -1, atts: [] });
viewGun.position.set(0.32, -0.32, -0.7);
camera.add(viewGun);
let viewGunSig = "";
/** True if a material is one of the long-lived shared/cached ones every build reuses. */
function isSharedGunMaterial(m) {
  return m === METAL_DARK_MAT || m === LASER_DOT_MAT || m === LENS_MAT ||
    m === GLOVE_MAT || m === SKIN_MAT || m === HELMET_MAT || m === BOOT_MAT ||
    m === STEEL_MAT || m === WOOD_MAT || m === WRAP_MAT ||
    Object.values(GUN_MAT_CACHE).includes(m) || Object.values(GUN_ACCENT_CACHE).includes(m);
}
function rebuildViewGun(key, atts) {
  camera.remove(viewGun);
  // dispose the outgoing build's own geometries + its unique (non-cached) materials —
  // covers the skin-tinted gun clone, the flash sprite, and one-off melee/utility mats
  viewGun.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !isSharedGunMaterial(o.material)) o.material.dispose();
  });
  viewGun = buildEquippedModel(key, { facing: -1, atts });
  viewGun.position.set(0.32, -0.32, -0.7);
  camera.add(viewGun);
  applySkin();
}
const muzzle = new THREE.PointLight(0xffd27f, 0, 8);
muzzle.position.set(0.32, -0.28, -1.3);
camera.add(muzzle);

// ============================================================
//  INPUT
// ============================================================
const keys = {};
function selectSlot(i) {
  if (!player.alive) return;
  const k = player.loadout[i];
  if (!k) return;
  player.slot = i;
  player.reloading = 0;
  player.burstLeft = 0;
}
addEventListener("keydown", (e) => {
  // typing in chat swallows all gameplay keys
  if (chatOpen) return;
  if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); openChat(); return; }
  if (e.code === "KeyV" && running) { toggleFireMode(); return; }
  if (e.code === "Escape" && running && state.mode === "range") { leaveRange(); return; }

  keys[e.code] = true;
  if (e.code === "Digit1") selectSlot(0);
  if (e.code === "Digit2") selectSlot(1);
  if (e.code === "Digit3") selectSlot(2);
  if (e.code === "Digit4") selectSlot(3);
  if (e.code === "KeyR") startReload();
  if (e.code === "Space" && player.onGround && player.alive) { player.vel.y = 10; player.onGround = false; }
});
addEventListener("keyup", (e) => { if (!chatOpen) keys[e.code] = false; });

let mouseDown = false;
addEventListener("mousedown", (e) => {
  if (!running) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) player.ads = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) player.ads = false;
});
addEventListener("contextmenu", (e) => e.preventDefault());

// pointer lock look
const SENS = 0.0022;
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * SENS;
  player.pitch -= e.movementY * SENS;
  const lim = Math.PI / 2 - 0.05;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
});
const lockPrompt = document.getElementById("lockPrompt");
lockPrompt.addEventListener("click", () => { Sound.unlock(); canvas.requestPointerLock(); });
canvas.addEventListener("click", () => { Sound.unlock(); if (running) canvas.requestPointerLock(); });
document.addEventListener("pointerlockchange", () => {
  lockPrompt.classList.toggle("hidden", document.pointerLockElement === canvas);
});

// ============================================================
//  COLLISION
// ============================================================
function collide(pos) {
  const r = player.radius;
  for (const c of colliders) {
    if (player.pos.y > c.top + 0.2) continue; // above it — standing on top handled separately
    const nx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
    const nz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      pos.x = nx + (dx / d) * r;
      pos.z = nz + (dz / d) * r;
    }
  }
  const lim = MAP - 2;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
}

// ============================================================
//  SHOOTING
// ============================================================
const raycaster = new THREE.Raycaster();
let recoil = 0;

/** V cycles a gun between its default and its unlocked alt fire mode (R-GUN-1). */
function toggleFireMode() {
  const wk = curKey();
  const g = GUNS[wk];
  if (!g || g.melee || isUtilSlot()) return;
  if (!g.alt) { toast(`${g.name} has no second fire mode`); return; }
  const base = gunStats(wk, profile);
  if (!base.altUnlocked) { toast(`${g.name}: reach Lv3 to unlock ${FIRE_MODES[g.alt].name}`); return; }

  player.fireModes = player.fireModes || {};
  const on = player.fireModes[wk] === g.alt;
  player.fireModes[wk] = on ? null : g.alt;
  player.burstLeft = 0;
  const label = on ? (g.burst ? `Burst-${g.burst}` : g.auto ? "Auto" : "Semi")
                   : FIRE_MODES[g.alt].name;
  toast(`${g.name} — ${label}`);
}

function startReload() {
  const wk = curKey();
  const g = GUNS[wk];
  if (!g || g.melee || isUtilSlot()) return;
  const s = statsFor(wk);
  if (player.reloading > 0) return;
  if (player.ammo[wk] >= s.mag) return;
  if (player.reserve[wk] <= 0) { toast("No reserve ammo!"); return; }
  player.reloading = g.reload;
  Sound.playReloadOut();
}
function finishReload() {
  const wk = curKey();
  const s = statsFor(wk);
  const need = s.mag - player.ammo[wk];
  const take = Math.min(need, player.reserve[wk]);
  player.ammo[wk] += take; player.reserve[wk] -= take;
  Sound.playReloadIn();
}

/** One hitscan pellet. Returns the bot hit (or null). */
function castShot(spread, dmg, gun) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += (Math.random() * 2 - 1) * spread;
  dir.y += (Math.random() * 2 - 1) * spread;
  dir.z += (Math.random() * 2 - 1) * spread;
  dir.normalize();
  raycaster.set(camera.getWorldPosition(new THREE.Vector3()), dir);

  // Bodies are split into a head box and a torso/legs box so aim is rewarded
  // (R-GUN-3). The head box sits at the top of the 3.2-tall soldier volume.
  let hitBot = null, hitDist = Infinity, headshot = false;
  for (const b of bots) {
    if (!b.alive) continue;
    const head = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(b.pos.x, b.pos.y + 2.62, b.pos.z), new THREE.Vector3(0.62, 0.62, 0.62)
    );
    const hp = raycaster.ray.intersectBox(head, new THREE.Vector3());
    if (hp) {
      const d = hp.distanceTo(raycaster.ray.origin);
      if (d < hitDist) { hitDist = d; hitBot = b; headshot = true; }
      continue;                       // a head hit always beats the body hit
    }
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(b.pos.x, b.pos.y + 1.45, b.pos.z), new THREE.Vector3(1.2, 2.6, 1.2)
    );
    const pt = raycaster.ray.intersectBox(box, new THREE.Vector3());
    if (pt) {
      const d = pt.distanceTo(raycaster.ray.origin);
      if (d < hitDist) { hitDist = d; hitBot = b; headshot = false; }
    }
  }
  const worldHits = raycaster.intersectObjects(worldMeshes(), false);
  const worldDist = worldHits.length ? worldHits[0].distance : Infinity;

  if (hitBot && hitDist < worldDist) {
    // range falloff, then the headshot bonus (R-GUN-2/3)
    let out = dmg * falloffMul(hitDist, gun);
    if (headshot) out *= HEADSHOT.mult;
    damageBot(hitBot, out, headshot);
    return hitBot;
  }
  // hit the world instead — chip away at destructible cover (R-MAP-3),
  // or punch holes in a vehicle until it brews up (R-VEH-1)
  if (worldHits.length) {
    const col = worldHits[0].object.userData.collider;
    if (col && col.vehicle) damageVehicle(col.vehicle, dmg, true);
    else if (col && col.destructible) damageProp(col, dmg);
  }
  return null;
}

/** Damage a bot from the player, applying friendly-fire rules (R-CMB-4). */
function damageBot(b, dmg, headshot) {
  b.hp -= dmg;
  hitMarker(headshot);
  if (b.team === "blue") {
    P.addCoins(-COINS.teamkillPenalty);
    toast(`Friendly fire! -${COINS.teamkillPenalty} coins`);
  }
  if (b.hp <= 0 && b.alive) killBot(b, true);
}

function meleeSwing(s) {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let best = null, bestD = Infinity;
  for (const b of bots) {
    if (!b.alive) continue;
    const to = new THREE.Vector3(b.pos.x, 1.6, b.pos.z).sub(origin);
    const d = to.length();
    if (d > s.range) continue;
    if (to.normalize().dot(dir) < 0.6) continue;   // must be roughly in front
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) damageBot(best, s.dmg);
  // little lunge on the viewmodel
  viewGun.position.z = -1.1;
}

function tryFire(dt) {
  player.fireCd -= dt;
  player.burstCd -= dt;
  // barrels spin back down whenever you're not holding the trigger
  if (!mouseDown && player.spinT > 0) player.spinT = Math.max(0, player.spinT - dt * 1.6);
  if (!player.alive || player.reloading > 0) return;

  // ----- utility slot (throwables) -----
  if (isUtilSlot()) {
    const justPressed = mouseDown && !player._firedTap;
    player._firedTap = mouseDown;
    if (justPressed) throwUtility();
    return;
  }

  const wk = curKey();
  const g = GUNS[wk];
  if (!g) return;
  const s = statsFor(wk);

  // ----- melee -----
  if (g.melee) {
    const justPressed = mouseDown && !player._firedTap;
    player._firedTap = mouseDown;
    if (justPressed && player.fireCd <= 0) {
      player.fireCd = 60 / g.rpm;
      meleeSwing(s);
    }
    return;
  }

  // ----- guns -----
  const auto = g.auto;
  const justPressed = mouseDown && !player._firedTap;
  player._firedTap = mouseDown;

  // burst weapons: one trigger pull queues N rounds
  if (g.burst) {
    if (justPressed && player.burstLeft <= 0 && player.ammo[wk] > 0) player.burstLeft = g.burst;
    if (player.burstLeft <= 0 || player.fireCd > 0) return;
  } else {
    const wantFire = auto ? mouseDown : justPressed;
    if (!wantFire || player.fireCd > 0) return;
  }

  if (player.ammo[wk] <= 0) {
    if (justPressed) { toast("Reload! (R)"); Sound.playDryFire(); }
    player.burstLeft = 0;
    return;
  }

  // ----- minigun spin-up: the barrels have to wind up before the first round
  // leaves the gun (R-GUN-1) -----
  if (g.spinup) {
    player.spinT = Math.min(g.spinup, (player.spinT || 0) + dt);
    if (player.spinT < g.spinup) { Sound.playSpinup(); return; }
  }

  player.fireCd = 60 / g.rpm;
  player.ammo[wk]--;
  // practice modes (Shooting Range) never run dry — reserve tops itself off (R-MOD-5)
  if ((MODES[state.mode] || {}).practice) player.reserve[wk] = g.reserve;
  if (player.burstLeft > 0) player.burstLeft--;

  // spread: base * movement/jump penalty, reduced by ADS  (R-CMB-3)
  const moving = player.vel.x * player.vel.x + player.vel.z * player.vel.z > 4;
  let spread = s.spread * 0.01;
  if (moving) spread *= 2.2;
  if (!player.onGround) spread *= 3;
  // sniper perk: much steadier when aiming down sights (R-ROL-2)
  if (player.ads) spread *= (player.role === "sniper" ? 0.19 : 0.35);

  muzzleFlash();
  fireMuzzleFX(viewGun);
  const silenced = g.silentShot ||
    ((profile.attachments && profile.attachments[wk]) || []).includes("silencer");
  Sound.playGunshot(GUN_SFX[wk] || "crack", { silenced });
  recoil += s.kick * (player.ads ? 0.5 : 1) * 0.01;

  // ----- how this weapon actually delivers damage (R-GUN-1) -----
  switch (g.kind) {
    case "rocket":
      fireProjectileWeapon(g, s);
      break;
    case "beam":
      fireBeamWeapon(g, s, spread);
      break;
    case "flame":
      fireFlameWeapon(g, s);
      break;
    default: {
      const pellets = g.pellets || 1;
      for (let i = 0; i < pellets; i++) castShot(spread, s.dmg, g);
    }
  }
}

// ============================================================
//  NEW WEAPON KINDS  (R-GUN-1)
// ============================================================

/** Rocket / grenade launcher: a travelling shell that detonates on impact. */
function fireProjectileWeapon(g, s) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 1.2);

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x6a6f5a, emissive: 0xff7a2a, emissiveIntensity: 0.5 })
  );
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(mesh);

  projectiles.push({
    mesh,
    pos: from.clone(),
    vel: dir.clone().multiplyScalar(g.speed),
    gravity: g.arc ? 22 : 0,          // the GL lobs, the rocket flies flat
    life: 6,
    blast: g.blast,
    isShell: true,
  });
}

/** Energy weapon: instant hit plus a visible beam that fades out. */
function fireBeamWeapon(g, s, spread) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const hit = castShot(spread, s.dmg, g);

  // draw the bolt from muzzle to wherever the ray ended up
  const end = origin.clone().addScaledVector(dir, hit ? origin.distanceTo(hit.pos) : 120);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, origin.distanceTo(end), 6),
    new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.85 })
  );
  beam.position.copy(origin).lerp(end, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
    new THREE.Vector3().subVectors(end, origin).normalize());
  scene.add(beam);
  effects.push({ kind: "puff", mesh: beam, life: 0.09, maxLife: 0.09, at: end, radius: 0 });
}

/** Flamethrower: a short cone of fire that scorches everything in front. */
function fireFlameWeapon(g, s) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.getWorldPosition(new THREE.Vector3());

  for (const b of bots) {
    if (!b.alive || b.downed) continue;
    const to = new THREE.Vector3(b.pos.x, b.pos.y + 1.5, b.pos.z).sub(origin);
    const d = to.length();
    if (d > g.range) continue;
    if (to.normalize().dot(dir) < 1 - g.cone) continue;      // outside the cone
    if (!hasLOS(player.pos, b.pos)) continue;
    damageBot(b, s.dmg, false);
  }

  // a puff of flame at the muzzle so it reads visually
  const puff = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.5 })
  );
  puff.position.copy(origin).addScaledVector(dir, 2.4 + Math.random() * 2);
  scene.add(puff);
  effects.push({ kind: "puff", mesh: puff, life: 0.22, maxLife: 0.22, at: puff.position.clone(), radius: 0 });
}

/** Kill a bot. `byPlayer` drives coins/XP (R-ECO-1, R-ECO-5). */
function killBot(b, byPlayer) {
  // range targets just pop down and reset — no coins, no kill count, no score
  if (b.isDummy) {
    b.alive = false;
    b.mesh.visible = false;
    b.respawnAt = time + 1.6;
    return;
  }
  if (b.team === "red") {
    b.alive = false;
    b.deathAnim = 1;                        // falls over instead of vanishing (R-VIS)
    b._deathTiltZ = (Math.random() * 2 - 1) * 0.3;
    b.respawnAt = time + 5;
    if (byPlayer) {
      player.kills++;
      P.addCoins(COINS.kill);
      P.addXp(XP.kill);
      profile.stats.kills++;
      coinPopup(`+${COINS.kill}`);
      xpPopup(`+${XP.kill} XP`);
      // Gun Game: every kill moves you up the weapon ladder (R-MOD-1)
      if (state.mode === "gun") {
        if (OBJ.gunGameAdvance()) { endMatch(true); return; }
        applyGunGameWeapon();
      }
    }
    if (state.mode === "wave") state.waveKills++;
    else state.blueScore++;
  } else {
    downOrKillBot(b);                  // your own team lost someone
  }
}

/** Blue bots go DOWN first so they can be revived (R-AI-3); red bots just die. */
function downOrKillBot(b) {
  if (b.downed || !b.alive) return;
  if (b.team === "blue") {
    b.downed = true;
    b.hp = 0;
    b.bleed = REVIVE.bleedOut;
    b.reviveProgress = 0;               // animateSoldier eases the mesh into a slumped pose
    chatSys(`${b.name} is down!`);
    setTimeout(() => chatAlly(b.name, pick(DOWN_LINES)), 300);
    return;
  }
  b.alive = false; b.mesh.visible = false; b.respawnAt = time + 5;
  if (state.mode !== "wave") state.blueScore++;
}

/** Bled out without help. */
function finishBotDeath(b) {
  b.downed = false;
  b.alive = false;
  b.deathAnim = 1;                        // falls the rest of the way instead of vanishing
  b._deathTiltZ = (Math.random() * 2 - 1) * 0.3;
  b.respawnAt = time + 5;
  if (state.mode !== "wave") state.redScore++;
}

function reviveBot(b, byName) {
  b.downed = false;
  b.alive = true;
  b.hp = REVIVE.hpOnRevive;
  b.reviveProgress = 0;
  b.mesh.rotation.x = 0; b.mesh.rotation.z = 0; b.mesh.position.y = 0;
  b.mesh.visible = true;
  b.ai = "advance"; b.seenAt = 0;
  b.crouching = false; b.wantSprint = false; b.jumpT = 0; b.slideT = 0;
  chatSys(`${byName} revived ${b.name}`);
  setTimeout(() => chatAlly(b.name, pick(REVIVED_LINES)), 400);
}

/**
 * Meshes that block bullets — the map's solids plus any deployed shields.
 * The AI raycasts against this hundreds of times per frame, so the array is
 * cached and only rebuilt when the world actually changes.
 */
let shieldMeshes = [];
let wmCache = null, wmSolids = -1, wmShields = -1;

function worldMeshes() {
  if (wmCache && wmSolids === solids.length && wmShields === shieldMeshes.length) return wmCache;
  wmCache = shieldMeshes.length ? solids.concat(shieldMeshes) : solids;
  wmSolids = solids.length;
  wmShields = shieldMeshes.length;
  return wmCache;
}

/** Keep the deployed-shield list in sync with live effects (called once a frame). */
function refreshShieldMeshes() {
  let count = 0;
  for (const e of effects) if (e.kind === "shield" && e.mesh) count++;
  if (count === shieldMeshes.length) return;
  shieldMeshes = [];
  for (const e of effects) if (e.kind === "shield" && e.mesh) shieldMeshes.push(e.mesh);
  wmCache = null;
}

// ============================================================
//  DESTRUCTION  (R-MAP-3)
// ============================================================
/** Damage a destructible prop. Returns true if it broke. */
function damageProp(col, dmg) {
  if (!col || !col.destructible || col.broken) return false;
  col.hp -= dmg;

  // visibly scuff it as it takes damage
  const k = Math.max(0, col.hp / col.maxHp);
  col.mesh.material.color.multiplyScalar(0.985);
  col.mesh.scale.y = 0.75 + k * 0.25;
  col.mesh.position.y = (col.top * col.mesh.scale.y) / 2;

  if (col.hp <= 0) { breakProp(col); return true; }
  return false;
}

/** Destroy a prop: remove it, drop its collider and cover, throw debris. */
function breakProp(col) {
  if (col.broken) return;
  col.broken = true;

  spawnDebris(col);

  // remove visuals
  mapGroup.remove(col.mesh);
  col.mesh.geometry?.dispose?.();
  col.mesh.material?.dispose?.();
  for (const e of col.extra) {
    mapGroup.remove(e);
    e.geometry?.dispose?.();
    e.material?.dispose?.();
  }
  col.extra.length = 0;

  // it no longer blocks movement, bullets or sight
  let i = colliders.indexOf(col);
  if (i >= 0) colliders.splice(i, 1);
  i = solids.indexOf(col.mesh);
  if (i >= 0) solids.splice(i, 1);

  // cover points around it are gone too, so the AI stops hiding at thin air
  const cx = (col.min.x + col.max.x) / 2, cz = (col.min.z + col.max.z) / 2;
  const reach = Math.max(col.max.x - col.min.x, col.max.z - col.min.z) / 2 + 2.5;
  for (let j = coverPoints.length - 1; j >= 0; j--) {
    const p = coverPoints[j];
    if (Math.abs(p.x - cx) <= reach && Math.abs(p.z - cz) <= reach) coverPoints.splice(j, 1);
  }
}

function spawnDebris(col) {
  const cx = (col.min.x + col.max.x) / 2, cz = (col.min.z + col.max.z) / 2;
  const color = col.mesh.material.color.getHex();
  const n = col.kind === "building" ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const s = 0.5 + Math.random() * 1.1;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    );
    m.position.set(cx + (Math.random() * 2 - 1) * 2, col.top * 0.5 + Math.random() * 2, cz + (Math.random() * 2 - 1) * 2);
    mapGroup.add(m);
    debris.push({
      mesh: m, life: 2.6,
      vel: new THREE.Vector3((Math.random() * 2 - 1) * 7, 4 + Math.random() * 7, (Math.random() * 2 - 1) * 7),
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    });
  }
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.vel.y -= 24 * dt;
    d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.rotation.x += d.spin.x * dt;
    d.mesh.rotation.y += d.spin.y * dt;
    if (d.mesh.position.y < 0.3) { d.mesh.position.y = 0.3; d.vel.set(0, 0, 0); }
    d.life -= dt;
    if (d.life <= 0) {
      mapGroup.remove(d.mesh);
      d.mesh.geometry.dispose(); d.mesh.material.dispose();
      debris.splice(i, 1);
    }
  }
}

/** Explosions chew through nearby destructible cover. */
function damagePropsInRadius(at, radius, dmg) {
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i];
    if (!c.destructible || c.broken) continue;
    const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
    const d = Math.hypot(cx - at.x, cz - at.z);
    if (d > radius) continue;
    damageProp(c, dmg * (1 - d / radius));
  }
}

// ============================================================
//  LINE OF SIGHT + COVER  (used by the AI)
// ============================================================
const losCaster = new THREE.Raycaster();

/** Can `a` see `b`? Walls block; smoke clouds block too (R-SND/smoke tactics). */
function hasLOS(a, b, ignoreSmoke) {
  const from = new THREE.Vector3(a.x, 1.7, a.z);
  const to = new THREE.Vector3(b.x, 1.6, b.z);
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.001) return true;
  dir.normalize();
  losCaster.set(from, dir);
  losCaster.far = dist;
  const hits = losCaster.intersectObjects(worldMeshes(), false);
  if (hits.length && hits[0].distance < dist - 1) return false;

  if (!ignoreSmoke) {
    // a smoke cloud sitting on the sight line blocks vision
    for (const e of effects) {
      if (e.kind !== "smoke") continue;
      if (distPointToSegment(e.at, from, to) < e.radius * 0.85) return false;
    }
  }
  return true;
}

function distPointToSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const len2 = ab.lengthSq() || 1;
  const t = Math.max(0, Math.min(1, ap.dot(ab) / len2));
  return ap.sub(ab.multiplyScalar(t)).length();
}

/** Spots beside each piece of cover the AI can hide at. */
const coverPoints = [];
function buildCoverPoints() {
  for (const c of colliders) {
    const w = c.max.x - c.min.x, d = c.max.z - c.min.z;
    if (c.top < 1.3) continue;          // too short to hide behind
    if (w > 40 || d > 40) continue;     // boundary walls, not cover
    const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
    const ox = w / 2 + 1.4, oz = d / 2 + 1.4;
    coverPoints.push(
      new THREE.Vector3(cx + ox, 0, cz), new THREE.Vector3(cx - ox, 0, cz),
      new THREE.Vector3(cx, 0, cz + oz), new THREE.Vector3(cx, 0, cz - oz),
    );
  }
}

/**
 * Nearest spot that actually hides `from` from `threat`.
 * Raycasting every cover point is far too expensive, so candidates are cheaply
 * filtered and sorted by distance first and only the closest few are traced.
 */
const MAX_COVER_TRACES = 12;
const coverCandidates = [];
function findCover(from, threat) {
  coverCandidates.length = 0;
  for (const p of coverPoints) {
    const dx = p.x - from.x, dz = p.z - from.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 42 * 42) continue;
    const tx = p.x - threat.x, tz = p.z - threat.z;
    if (tx * tx + tz * tz < 81) continue;        // don't hide in their lap
    coverCandidates.push({ p, d2 });
  }
  coverCandidates.sort((a, b) => a.d2 - b.d2);

  const limit = Math.min(coverCandidates.length, MAX_COVER_TRACES);
  for (let i = 0; i < limit; i++) {
    const p = coverCandidates[i].p;
    if (!hasLOS(p, threat, true)) return p;      // closest genuinely-covered spot
  }
  return null;
}

// ============================================================
//  UTILITIES (slot 4) — throwables & gadgets  (R-LDO-2, R-ECO-6)
// ============================================================
const projectiles = [];   // in-flight throwables
const effects = [];       // landed area effects (smoke/fire/pad/shield/freeze)

function throwUtility() {
  const uk = player.loadout[3];
  const u = UTILS[uk];
  if (!u) return;
  if (player.utilCd > 0) { toast(`${u.name} on cooldown (${Math.ceil(player.utilCd)}s)`); return; }
  if (player.utilUses <= 0) { toast(`No ${u.name} left — resupply on respawn`); return; }

  player.utilUses--;
  player.utilCd = UTIL_COOLDOWN;      // long cooldown between uses

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({ color: u.color, emissive: u.color, emissiveIntensity: 0.3 })
  );
  const start = camera.getWorldPosition(new THREE.Vector3()).add(dir.clone().multiplyScalar(0.8));
  mesh.position.copy(start);
  scene.add(mesh);

  // Deployables (heal kit, jump pad, shield) drop at your feet so you can use them;
  // grenades and molotovs are thrown downrange.
  const power = u.place ? 4 : 26;
  const lift = u.place ? 1.5 : 5;

  projectiles.push({
    key: uk, u, mesh,
    pos: start.clone(),
    vel: dir.multiplyScalar(power).add(new THREE.Vector3(0, lift, 0)),
    fuse: u.fuse,
  });
  toast(`${u.name} ${u.place ? "deployed" : "thrown"}`);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    // ----- launcher shells: fly straight (or lob), detonate on contact (R-GUN-1) -----
    if (p.isShell) {
      p.vel.y -= (p.gravity || 0) * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.life -= dt;

      let boom = p.pos.y <= 0.2;                       // hit the dirt
      if (!boom) {
        for (const c of colliders) {                   // hit cover / a vehicle
          if (p.pos.x > c.min.x && p.pos.x < c.max.x &&
              p.pos.z > c.min.z && p.pos.z < c.max.z && p.pos.y < c.top) { boom = true; break; }
        }
      }
      if (!boom) {
        for (const b of bots) {                        // hit a body
          if (!b.alive || b.downed) continue;
          if (Math.abs(b.pos.x - p.pos.x) < 0.9 && Math.abs(b.pos.z - p.pos.z) < 0.9 &&
              p.pos.y < b.pos.y + 3) { boom = true; break; }
        }
      }
      if (boom || p.life <= 0) {
        const at = p.pos.clone(); at.y = Math.max(0.3, at.y);
        explode(at, p.blast.radius, p.blast.dmg, 0xffa040, null);
        Sound.playExplosion({ pos: at, listenerPos: player.pos, listenerYaw: player.yaw });
        scene.remove(p.mesh);
        p.mesh.geometry.dispose(); p.mesh.material.dispose();
        projectiles.splice(i, 1);
      }
      continue;
    }

    p.vel.y -= 22 * dt;
    p.pos.addScaledVector(p.vel, dt);
    // bounce off ground
    if (p.pos.y < 0.22) { p.pos.y = 0.22; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    p.mesh.position.copy(p.pos);
    p.fuse -= dt;
    if (p.fuse <= 0) {
      detonate(p);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

function detonate(p) {
  const u = p.u, at = p.pos.clone();
  const sndOpts = { pos: at, listenerPos: player.pos, listenerYaw: player.yaw };
  switch (u.kind) {
    case "frag": {
      explode(at, u.radius, u.dmg, 0xffb060, p.fromTeam);
      Sound.playExplosion(sndOpts);
      break;
    }
    case "fire": {          // molotov — lingering damage pool
      addEffect({ kind: "fire", at, radius: u.radius, life: u.life, dps: u.dmg, color: u.color, tick: 0 });
      Sound.playUtility("fire", sndOpts);
      break;
    }
    case "smoke": {
      addEffect({ kind: "smoke", at, radius: u.radius, life: u.life, color: u.color });
      Sound.playUtility("smoke", sndOpts);
      break;
    }
    case "flash": {         // blinds the player if close + in view
      const d = at.distanceTo(player.pos);
      if (d < u.radius) {
        const strength = 1 - d / u.radius;
        flashBlind(strength);
      }
      for (const b of bots) if (b.alive && b.pos.distanceTo(at) < u.radius) b.seenAt = time + 2.5; // stunned
      Sound.playUtility("flash", sndOpts);
      break;
    }
    case "heal": {          // healing kit — heals player + allies in radius
      if (at.distanceTo(player.pos) < u.radius) {
        player.hp = Math.min(player.maxHp, player.hp + u.heal);
        healPopup(`+${u.heal} HP`);
      }
      for (const b of bots) if (b.alive && b.team === "blue" && b.pos.distanceTo(at) < u.radius)
        b.hp = Math.min(b.maxHp, b.hp + u.heal);
      Sound.playUtility("heal", sndOpts);
      break;
    }
    case "freeze": {
      explode(at, u.radius, u.dmg, 0x9fe8ff);
      addEffect({ kind: "freeze", at, radius: u.radius, life: u.life, color: u.color });
      for (const b of bots) if (b.alive && b.pos.distanceTo(at) < u.radius) b.frozenUntil = time + u.life;
      Sound.playUtility("freeze", sndOpts);
      break;
    }
    case "pad": {
      addEffect({ kind: "pad", at, radius: u.radius, life: u.life, color: u.color });
      Sound.playUtility("pad", sndOpts);
      break;
    }
    case "shield": {
      addEffect({ kind: "shield", at, radius: u.radius, life: u.life, color: u.color });
      Sound.playUtility("shield", sndOpts);
      break;
    }
  }
}

/**
 * Instant radial damage (frag / freeze burst).
 * `fromTeam` (optional) marks a bot-thrown grenade — it spares that team,
 * and only the player's own grenades feed coins/XP.
 */
function explode(at, radius, dmg, color, fromTeam) {
  // visual puff
  const puff = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.6, 14, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
  );
  puff.position.copy(at); scene.add(puff);
  effects.push({ kind: "puff", mesh: puff, life: 0.4, maxLife: 0.4, at, radius: 0 });

  // blasts tear up destructible cover (R-MAP-3)
  damagePropsInRadius(at, radius * 1.15, dmg * 1.4);

  const byPlayer = !fromTeam;
  for (const b of bots) {
    if (!b.alive || b.downed) continue;
    if (fromTeam && b.team === fromTeam) continue;      // don't frag your own squad
    const d = b.pos.distanceTo(at);
    if (d > radius) continue;
    const falloff = 1 - d / radius;
    if (byPlayer) damageBot(b, dmg * falloff);
    else damageBotFromBot(b, dmg * falloff);
  }
  // the player is on blue — blue-thrown bot grenades don't hurt them
  if (fromTeam !== "blue") {
    const dp = player.pos.distanceTo(at);
    if (dp < radius && player.alive && !player.downed) damagePlayer(dmg * (1 - dp / radius) * 0.7, at);
  }
}

function addEffect(e) {
  let mesh;
  if (e.kind === "smoke") {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(e.radius, 16, 12),
      new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.72 })
    );
  } else if (e.kind === "fire" || e.kind === "freeze") {
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(e.radius, e.radius, 0.5, 20),
      new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.5 })
    );
  } else if (e.kind === "pad") {
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(e.radius, e.radius, 0.3, 18),
      new THREE.MeshStandardMaterial({ color: e.color, emissive: e.color, emissiveIntensity: 0.7 })
    );
  } else if (e.kind === "shield") {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(e.radius * 2, 2.6, 0.4),
      new THREE.MeshStandardMaterial({ color: e.color, transparent: true, opacity: 0.72 })
    );
    mesh.rotation.y = player.yaw;
  }
  if (mesh) {
    mesh.position.copy(e.at);
    if (e.kind !== "smoke") mesh.position.y = e.kind === "shield" ? 1.3 : 0.25;
    scene.add(mesh);
  }
  effects.push({ ...e, mesh, maxLife: e.life });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;

    if (e.kind === "fire") {
      e.tick -= dt;
      if (e.tick <= 0) {
        e.tick = 0.5;
        for (const b of bots) if (b.alive && b.pos.distanceTo(e.at) < e.radius) damageBot(b, e.dps * 0.5);
        if (player.alive && player.pos.distanceTo(e.at) < e.radius) damagePlayer(e.dps * 0.5, e.at);
      }
    } else if (e.kind === "pad") {
      if (player.alive && player.onGround && player.pos.distanceTo(e.at) < e.radius) {
        player.vel.y = 22; player.onGround = false;
      }
    } else if (e.kind === "puff" && e.mesh) {
      const k = e.life / e.maxLife;
      e.mesh.scale.setScalar(1 + (1 - k) * 1.6);
      e.mesh.material.opacity = 0.55 * k;
    }

    if (e.life <= 0) {
      if (e.mesh) scene.remove(e.mesh);
      effects.splice(i, 1);
    } else if (e.mesh && (e.kind === "smoke" || e.kind === "freeze")) {
      e.mesh.material.opacity = Math.min(0.72, (e.life / e.maxLife) * 0.9);
    }
  }
}

// flashbang screen blind
const flashOverlay = document.getElementById("flashOverlay");
let blindT = 0, blindMax = 0;
function flashBlind(strength) {
  blindT = 2.5 * strength; blindMax = blindT;
  toast("Flashed!");
}

// muzzle flash + hit feedback
let flashT = 0;
function muzzleFlash() { flashT = 0.05; muzzle.intensity = 3; }
const hitmarkerEl = document.getElementById("hitmarker");
function hitMarker(headshot) {
  hitmarkerEl.classList.remove("show");
  hitmarkerEl.classList.toggle("head", !!headshot);   // red X + ping on a headshot
  void hitmarkerEl.offsetWidth;
  hitmarkerEl.classList.add("show");
  if (headshot) Sound.playHeadshot();
}
const popupsEl = document.getElementById("popups");
function popup(txt, color, dy) {
  const el = document.createElement("div");
  el.className = "popup"; el.textContent = txt;
  el.style.left = (Math.random() * 30 - 15) + "px";
  if (color) el.style.color = color;
  if (dy) el.style.top = dy + "px";
  popupsEl.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
function coinPopup(txt) { popup(txt, null, 0); }
function xpPopup(txt) { popup(txt, "#9ad0ff", 22); }
function healPopup(txt) { popup(txt, "#6ee87a", -22); }

// directional damage indicator (R-CMB-5)
const dmgDirEl = document.getElementById("dmgDir");
let dmgDirT = 0;
function showDamageFrom(worldPos) {
  const dx = worldPos.x - player.pos.x, dz = worldPos.z - player.pos.z;
  const ang = Math.atan2(dx, dz) - player.yaw; // relative to facing
  const deg = ang * 180 / Math.PI;
  dmgDirEl.style.background = `conic-gradient(from ${deg}deg at 50% 50%, rgba(255,60,60,0.55) 0deg, rgba(255,60,60,0) 40deg, rgba(255,60,60,0) 320deg, rgba(255,60,60,0.55) 360deg)`;
  dmgDirEl.classList.add("show");
  dmgDirT = 0.9;
}

function damagePlayer(amount, fromPos) {
  if ((MODES[state.mode] || {}).practice) return;   // no damage in the Shooting Range
  if (!player.alive || player.downed) return;
  // role damage reduction (heavy) then armor soak (R-ECO-4, R-ROL-2)
  amount *= (1 - (player.roleData ? player.roleData.dr : 0));
  if (player.armor > 0) {
    const soak = Math.min(player.armor, amount * 0.65);
    player.armor -= soak;
    amount -= soak;
  }
  player.hp -= amount;
  if (fromPos) showDamageFrom(fromPos);
  if (player.hp <= 0) { player.hp = 0; playerDown(); }
}

/**
 * Lethal hit: if a teammate is still up, you go DOWN and they can revive you
 * (R-AI-3). Otherwise it's a straight death.
 */
function playerDown() {
  if (player.vehicle) exitVehicle(player);      // you can't hold the wheel while bleeding out
  const helpAvailable = bots.some(b => b.team === "blue" && b.alive && !b.downed);
  if (!helpAvailable) { playerDie(); return; }
  player.downed = true;
  player.bleed = REVIVE.bleedOut;
  player.reviveProgress = 0;
  document.getElementById("downed").classList.remove("hidden");
  chatSys("You are down — hold on!");
}

/** A teammate standing over you fills the revive bar. */
function revivePlayerTick(b, dt) {
  const speed = b.role === "medic" ? 1 / REVIVE.medicTime : 1 / REVIVE.time;
  player.reviveProgress += dt * speed;
  player.reviverName = b.name;
  if (player.reviveProgress >= 1) {
    player.downed = false;
    player.reviveProgress = 0;
    player.hp = REVIVE.hpOnRevive;
    document.getElementById("downed").classList.add("hidden");
    chatSys(`${b.name} revived you`);
    toast("Back on your feet!");
  }
}

function playerDie() {
  if (player.vehicle) exitVehicle(player);
  player.alive = false;
  player.downed = false;
  player.reviveProgress = 0;
  document.getElementById("downed").classList.add("hidden");
  document.exitPointerLock();

  const m = MODES[state.mode] || MODES.team;
  if (m.respawn) {
    player.respawnAt = time + 5;       // R-RSP-3 (5s)
    document.getElementById("respawn").classList.remove("hidden");
  } else {
    // no respawn (Solo/Team Deathmatch, S&D, Battle Royale) — you spectate
    state.spectating = true;
    const alliesLeft = bots.some(b => b.team === "blue" && b.alive && !b.downed);
    document.getElementById("specText").textContent =
      alliesLeft ? "Watching your squad finish the fight…" : "Your side is wiped out…";
    document.getElementById("eliminated").classList.remove("hidden");
  }
}
function respawnPlayer() {
  if (player.vehicle) exitVehicle(player);
  if (scopeActive) unscope();
  player.alive = true;
  player.hp = player.maxHp;
  player.pos.copy(BLUE_SPAWN).add(new THREE.Vector3(Math.random() * 8 - 4, 0, Math.random() * 6 - 3));
  player.vel.set(0, 0, 0);
  // R-RSP-2 / R-LDO-3: respawn with the bought loadout; loadout edits apply here
  applyLoadout();
  document.getElementById("respawn").classList.add("hidden");
}

// ============================================================
//  AI  (Phase 3) — roles, difficulty-scaled tactics, teammates, revives
//  R-AI-1: weak = rush → wait ~3s → shoot.  strong = cover, flank, grenades.
// ============================================================
const tmpDir = new THREE.Vector3();

/** Move a bot toward a world point, with freeze slow + obstacle nudge. */
function moveToward(b, dest, dt, speedMul = 1) {
  tmpDir.subVectors(dest, b.pos); tmpDir.y = 0;
  const d = tmpDir.length();
  if (d < 0.4) return d;
  tmpDir.divideScalar(d);
  const slow = (b.frozenUntil && time < b.frozenUntil) ? 0.35 : 1;
  const step = b.speed * slow * speedMul * dt;

  const nx = b.pos.x + tmpDir.x * step;
  const nz = b.pos.z + tmpDir.z * step;
  // simple obstacle avoidance: if blocked, slide along the wall
  if (!blockedAt(nx, nz)) { b.pos.x = nx; b.pos.z = nz; }
  else if (!blockedAt(nx, b.pos.z)) b.pos.x = nx;
  else if (!blockedAt(b.pos.x, nz)) b.pos.z = nz;
  else { // fully stuck — sidestep
    b.pos.x += -tmpDir.z * step * b.flankSign;
    b.pos.z += tmpDir.x * step * b.flankSign;
  }
  return d;
}

function blockedAt(x, z) {
  for (const c of colliders) {
    if (x > c.min.x - 0.7 && x < c.max.x + 0.7 && z > c.min.z - 0.7 && z < c.max.z + 0.7) return true;
  }
  return false;
}

function updateBot(b, dt) {
  // ----- range targets: never move, never shoot, just pop back up (R-MOD-5) -----
  if (b.isDummy) {
    if (!b.alive && time >= b.respawnAt) {
      b.hp = b.maxHp; b.alive = true; b.mesh.visible = true;
    }
    return;
  }

  // ----- downed teammates bleed out or wait for a revive (R-AI-3) -----
  if (b.downed) {
    if (b.vehicle) exitVehicle(b);
    b.bleed -= dt;
    if (b.bleed <= 0) finishBotDeath(b);
    b.mesh.position.copy(b.pos);
    return;
  }

  if (!b.alive) {
    if (b.vehicle) exitVehicle(b);
    if (time >= b.respawnAt) {
      const base = b.team === "red" ? RED_SPAWN : BLUE_SPAWN;
      b.pos.set(base.x + (Math.random() * 12 - 6), 0, base.z + (Math.random() * 8 - 4));
      b.hp = b.maxHp; b.alive = true; b.mesh.visible = true;
      b.mesh.rotation.x = 0; b.mesh.rotation.z = 0; b.mesh.position.y = 0;
      b.deathAnim = undefined; b._hasTarget = false;
      b.seenAt = 0; b.ai = "advance"; b.coverPos = null;
      b.crouching = false; b.wantSprint = false; b.jumpT = 0; b.slideT = 0;
    }
    return;
  }

  // ----- ambient squad chatter — allies talk on their own, not just on command -----
  if (b.team === "blue") {
    b.chatCd -= dt;
    if (b.chatCd <= 0) {
      b.chatCd = 10 + Math.random() * 16;
      if (time - lastAmbientChat > 4.5 && Math.random() < 0.6) {
        lastAmbientChat = time;
        chatAlly(b.name, pick(IDLE_CHATTER));
      }
    }
  }

  const D = DIFFICULTY[difficulty] || DIFFICULTY.recruit;
  const role = b.roleData;

  // ----- bots drive too (R-VEH-1). A bot grabs a vehicle when its target is
  // far away, drives at it, then bails out and fights on foot once it's close.
  // Passengers only ever share with their OWN side (canBoard enforces it), so
  // a red bot will never hop into a blue-driven truck. -----
  if (b.vehicle) {
    const v = b.vehicle;
    if (!v.alive) { b.vehicle = null; }
    else {
      const foe = nearestEnemyOf(b);
      const away = foe ? b.pos.distanceTo(foe.pos) : Infinity;
      if (v.driver === b) b.driveTo = foe ? foe.pos : (orderDestination(b) || RED_SPAWN);
      // close enough to fight, or nothing left to drive at → dismount
      if (away < 22 || !foe) { exitVehicle(b); }
      else {
        faceAlong(b, b.driveTo || b.pos);
        return;                        // riding: the vehicle sim moves this bot
      }
    }
  } else {
    b.vehicleCd = (b.vehicleCd || 0) - dt;
    if (b.vehicleCd <= 0) {
      b.vehicleCd = 1.5 + Math.random() * 2;
      const foe = nearestEnemyOf(b);
      const away = foe ? b.pos.distanceTo(foe.pos) : 0;
      if (foe && away > 40) {
        const v = nearbyVehicle(b, 30);
        if (v && Math.random() < 0.5 + D.mobility * 0.35) {
          enterVehicle(v, b);
          if (b.vehicle) { b.driveTo = foe.pos; return; }
        }
      }
    }
  }

  // ----- live weapon swaps: bots occasionally switch to another gun from their
  // role's pool mid-match, not just once at spawn (R-AI-5). Runs even without
  // a target so idle/patrolling bots stay a little unpredictable too. Recruits
  // still do this sometimes (mobility is never 0) — just less often than elites.
  b.weaponSwitchCd -= dt;
  if (b.weaponSwitchCd <= 0) {
    b.weaponSwitchCd = 16 - D.mobility * 7 + Math.random() * 10;
    const pool = role.guns && role.guns.length > 1 ? role.guns.filter((k) => k !== b.gunKey) : null;
    if (pool && pool.length && Math.random() < 0.25 + D.mobility * 0.35 && (b.cd <= 0.1)) {
      switchBotGun(b, pool[(Math.random() * pool.length) | 0]);
    }
  }

  // medics top themselves and nearby friends up over time
  if (b.role === "medic") {
    b.healCd -= dt;
    if (b.healCd <= 0) {
      b.healCd = 2;
      b.hp = Math.min(b.maxHp, b.hp + 8);
      for (const o of bots) {
        if (o.alive && !o.downed && o.team === b.team && o !== b && o.pos.distanceTo(b.pos) < 10)
          o.hp = Math.min(o.maxHp, o.hp + 6);
      }
    }
  }

  // ----- allies: reviving the player beats everything (R-AI-3) -----
  if (b.team === "blue" && player.downed) {
    const wantsRevive = teamOrder === "revive" || b.role === "medic" ||
                        b.pos.distanceTo(player.pos) < 45;
    if (wantsRevive) {
      const d = moveToward(b, player.pos, dt, 1.15);
      faceAlong(b, player.pos);
      if (d < REVIVE.range) revivePlayerTick(b, dt);
      clampBot(b);
      return;
    }
  }

  // ----- allies: revive downed teammates too -----
  if (b.team === "blue") {
    const hurt = bots.find(o => o.downed && o.team === "blue" && o.pos.distanceTo(b.pos) < 30);
    if (hurt && b.role === "medic") {
      const d = moveToward(b, hurt.pos, dt, 1.1);
      faceAlong(b, hurt.pos);
      if (d < REVIVE.range) {
        hurt.reviveProgress += dt / REVIVE.medicTime;
        if (hurt.reviveProgress >= 1) reviveBot(hurt, b.name);
      }
      clampBot(b);
      return;
    }
  }

  // ----- pick the nearest visible enemy -----
  let target = null, best = Infinity;
  const oppTeam = b.team === "red" ? "blue" : "red";
  if (b.team === "red" && player.alive && !player.downed) {
    const d = b.pos.distanceTo(player.pos);
    if (d < best) { best = d; target = { pos: player.pos, isPlayer: true }; }
  }
  for (const o of bots) {
    if (!o.alive || o.downed || o.team !== oppTeam) continue;
    const d = b.pos.distanceTo(o.pos);
    if (d < best) { best = d; target = { pos: o.pos, bot: o }; }
  }

  // ----- no enemy: follow team orders / hold ground -----
  if (!target) {
    b._hasTarget = false;
    const dest = orderDestination(b);
    if (dest) { moveToward(b, dest, dt); faceAlong(b, dest); }
    clampBot(b);
    return;
  }

  const dist = best;
  const engage = role.engage;
  const los = hasLOS(b.pos, target.pos);
  b._hasTarget = los && dist < engage * 1.8;   // drives the gun-raised aim pose (R-VIS)

  // ----- rethink tactics periodically -----
  b.aiTimer -= dt;
  if (b.aiTimer <= 0) {
    // more active AI (higher mobility) rethinks faster — feels twitchier, not just more accurate
    b.aiTimer = (0.8 + Math.random() * 0.8) / (0.7 + D.mobility * 0.5);
    const hurtBadly = b.hp < b.maxHp * 0.45;

    if (D.cover && hurtBadly) {
      b.coverPos = findCover(b.pos, target.pos);
      b.ai = b.coverPos ? "cover" : "engage";
    } else if (D.flank && dist < engage * 2.2 && dist > 8 && Math.random() < 0.5) {
      b.ai = "flank";
    } else {
      b.ai = "advance";
    }

    // ----- mobility flavor: sprint bursts, crouched holds, hops, slides (R-AI-5) -----
    b.wantSprint = dist > engage * 1.25 && Math.random() < 0.25 + D.mobility * 0.4;
    b.crouching = !b.wantSprint && dist < engage * 1.1 && los && Math.random() < 0.12 + D.mobility * 0.3;
    if (b.jumpT <= 0 && b.slideT <= 0 && Math.random() < 0.05 + D.mobility * 0.1) {
      b.jumpT = 0.5; // a quick hop — mostly cosmetic, reads as "alive" movement
    } else if (b.jumpT <= 0 && b.slideT <= 0 && dist > 5 && Math.random() < 0.04 + D.mobility * 0.12) {
      b.slideT = 0.4; b.crouching = false; // a burst slide toward/around the target
    }
  }

  // ----- grenades: strong AI flushes you out of cover (R-AI-1) -----
  b.nadeCd -= dt;
  if (D.grenades && b.nadeCd <= 0 && dist < 40 && dist > 9) {
    // throw when they're hiding, or occasionally when they're exposed
    if (!los || Math.random() < 0.35) {
      botThrowGrenade(b, target.pos);
      b.nadeCd = 11 + Math.random() * 9;
    } else {
      b.nadeCd = 3;
    }
  }

  // ----- act on the current tactic -----
  let destination = null, speedMul = 1;
  if (b.ai === "cover" && b.coverPos) {
    destination = b.coverPos;
    if (b.pos.distanceTo(b.coverPos) < 1.5 && b.hp > b.maxHp * 0.7) b.ai = "advance";
  } else if (b.ai === "flank") {
    // aim for a point off to the side of the target
    const away = new THREE.Vector3().subVectors(b.pos, target.pos).setY(0).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(b.flankSign * 16);
    destination = new THREE.Vector3().copy(target.pos).add(side);
    speedMul = 1.1;
  } else {
    const order = orderDestination(b);
    destination = (order && dist > engage) ? order : target.pos;
  }

  // ----- side-to-side weaving while in combat range — reads as active dodging
  // instead of a robotic beeline, scaled by difficulty mobility (R-AI-5) -----
  if (destination && dist < engage * 2.4) {
    b.strafePhase += dt * (1.4 + D.mobility * 1.3);
    const weave = Math.sin(b.strafePhase) * (1.1 + D.mobility * 1.7);
    const away = new THREE.Vector3().subVectors(b.pos, target.pos).setY(0);
    if (away.lengthSq() > 0.04) {
      away.normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(weave);
      destination = destination.clone().add(side);
    }
  }

  // sprinting/sliding speed up repositioning; crouching slows/holds it — purely
  // additive on top of the tactic's own speed. jumpT/slideT are ticked down in
  // animateSoldier (runs every frame regardless of target) so a bot that loses
  // its target mid-hop still finishes the animation instead of freezing in it.
  if (b.slideT > 0) speedMul *= 1.6;
  else if (b.wantSprint) speedMul *= 1.3;
  else if (b.crouching) speedMul *= 0.55;

  // close to preferred range, then hold
  const wantCloser = dist > engage * 0.75 || !los;
  if (destination && wantCloser) moveToward(b, destination, dt, speedMul * D.aggression);
  faceAlong(b, target.pos);

  // ----- shooting -----
  if (los && dist < engage * 1.6) {
    if (b.seenAt === 0) b.seenAt = time;
    // Recruits hesitate ~3s after spotting you; elites fire almost at once.
    if (time - b.seenAt >= D.reaction) {
      b.cd -= dt;
      if (b.cd <= 0) {
        b.cd = b.role === "sniper" ? 1.5 : b.role === "heavy" ? 0.35 : 0.5;
        botShoot(b, target, dist, D);
      }
    }
  } else {
    b.seenAt = 0;    // lost sight — must re-acquire (and re-hesitate)
  }

  clampBot(b);
}

// ============================================================
//  ZIPLINES  (R-MAP-4 — the one thing you CAN ride)
// ============================================================
const ziplinePromptEl = document.getElementById("ziplinePrompt");
const vehiclePromptEl = document.getElementById("vehiclePrompt");
const vehiclePromptText = document.getElementById("vehiclePromptText");
const vehicleHudEl = document.getElementById("vehicleHud");
const vehicleHudName = document.getElementById("vehicleHudName");
const vehicleHudFill = document.getElementById("vehicleHudFill");
const vehicleHudSpeed = document.getElementById("vehicleHudSpeed");

/** Nearest zipline anchor you could grab right now. */
function nearbyZipline() {
  for (const z of ziplines) {
    const d = Math.hypot(player.pos.x - z.start.x, player.pos.z - z.start.z);
    if (d < 5) return z;
  }
  return null;
}

function updateZipline(dt) {
  // riding: slide from start to end, then drop off
  if (player.zip) {
    const z = player.zip;
    player.zipT += (dt * 22) / z.length;
    if (player.zipT >= 1) { detachZipline(); return; }
    const p = new THREE.Vector3().lerpVectors(z.start, z.end, player.zipT);
    player.pos.set(p.x, p.y - 1.9, p.z);   // hang below the cable
    player.vel.set(0, 0, 0);
    player.onGround = false;
    if (keys["KeyE"] && player.zipT > 0.08) detachZipline();   // bail out early
    ziplinePromptEl.classList.add("hidden");
    return;
  }

  if (!player.alive || player.downed) {
    ziplinePromptEl.classList.add("hidden");
    return;
  }
  // note: vehicles exist on every map, ziplines only on forest — so this check
  // must run even when there are no ziplines here.
  const z = ziplines.length ? nearbyZipline() : null;
  ziplinePromptEl.classList.toggle("hidden", !z);
  if (z && keys["KeyE"] && !player.vehicle) { attachZipline(z); player._eLatch = true; }
}

// ============================================================
//  DRIVING  (R-VEH-1)
//  Anyone can drive. A driver may carry their OWN side only: the player and
//  blue bots share a vehicle, red bots share theirs, and you can never board
//  a vehicle an enemy is driving (or vice versa).
// ============================================================

/** Team of whoever is driving (an empty vehicle is open to everyone). */
function vehicleTeam(v) {
  return v.driver ? (v.driver === player ? "blue" : v.driver.team) : null;
}

/** May `who` (player object or bot) get into this vehicle right now? */
function canBoard(v, who) {
  if (!v.alive || v.occupants.length >= v.def.seats) return false;
  const t = vehicleTeam(v);
  if (!t) return true;                                  // empty — first come, first served
  const mine = who === player ? "blue" : who.team;
  return t === mine;                                    // never ride with the enemy
}

/** Nearest vehicle this actor could climb into. */
function nearbyVehicle(who, range) {
  const from = who === player ? player.pos : who.pos;
  let best = null, bestD = range || 6.5;
  for (const v of vehicles) {
    if (!v.alive || v.occupants.includes(who)) continue;
    const d = Math.hypot(from.x - v.pos.x, from.z - v.pos.z);
    if (d < bestD && canBoard(v, who)) { bestD = d; best = v; }
  }
  return best;
}

/** Local seat offset (nose is +Z). Seat 0 is the driver. */
function seatLocal(def, i) {
  if (def.style === "bike") return new THREE.Vector3(0, 0, i === 0 ? def.len * 0.08 : -def.len * 0.26);
  const row = Math.floor(i / 2), side = (i % 2) === 0 ? -1 : 1;
  return new THREE.Vector3(side * def.wid * 0.26, 0, def.len * 0.22 - row * 1.6);
}

/** World position of seat `i`, accounting for the vehicle's yaw. */
function seatWorld(v, i, out) {
  const l = seatLocal(v.def, i);
  const c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
  const o = out || new THREE.Vector3();
  // rotate local (x,z) by yaw — same convention the model group uses
  o.set(
    v.pos.x + l.x * c + l.z * sn,
    v.pos.y + v.def.tall * 0.35,
    v.pos.z - l.x * sn + l.z * c
  );
  return o;
}

function enterVehicle(v, who) {
  if (!canBoard(v, who)) return false;
  const seat = v.occupants.length;
  v.occupants.push(who);
  if (!v.driver) v.driver = who;
  if (who === player) {
    player.vehicle = v;
    player.zip = null;
    player.sliding = false;
    player.vel.set(0, 0, 0);
    toast(v.driver === player
      ? `Driving the ${v.def.name} — WASD to drive, E to get out`
      : `Riding in the ${v.def.name} — E to get out`);
  } else {
    who.vehicle = v;
    who.vehSeat = seat;
  }
  return true;
}

function exitVehicle(who) {
  const v = who === player ? player.vehicle : who.vehicle;
  if (!v) return;
  const i = v.occupants.indexOf(who);
  if (i >= 0) v.occupants.splice(i, 1);

  // step out beside the vehicle rather than inside its own collision box
  const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw))
    .multiplyScalar(v.def.wid * 0.5 + 2.2);
  const out = new THREE.Vector3(v.pos.x + side.x, 0, v.pos.z + side.z);

  if (who === player) {
    player.vehicle = null;
    player.pos.set(out.x, 0, out.z);
    player.vel.set(0, 0, 0);
    player.onGround = true;
    collide(player.pos);
  } else {
    who.vehicle = null;
    who.vehSeat = 0;
    who.pos.set(out.x, 0, out.z);
    clampBot(who);
  }

  // driver left — hand the wheel to whoever is still aboard
  if (v.driver === who) v.driver = v.occupants[0] || null;
}

/** Everyone still inside bails out (used when a wreck blows up). */
function ejectAll(v) {
  for (const who of v.occupants.slice()) exitVehicle(who);
  v.occupants.length = 0;
  v.driver = null;
}

/** Bullets and blasts chew through vehicles; at 0 hp they explode (R-VEH-1). */
function damageVehicle(v, dmg, byPlayer) {
  if (!v || !v.alive) return;
  v.hp -= dmg;
  if (byPlayer) hitMarker();
  if (v.hp <= 0) destroyVehicle(v, byPlayer);
}

function destroyVehicle(v, byPlayer) {
  if (!v.alive) return;
  v.alive = false;

  const at = new THREE.Vector3(v.pos.x, 1.2, v.pos.z);
  const riders = v.occupants.slice();

  // everyone inside is caught in the blast — get them out first so the
  // explosion damages them as normal people standing at the wreck
  ejectAll(v);
  for (const who of riders) {
    if (who === player) damagePlayer(v.def.boom.dmg * 1.2, at);
    else if (who.alive && !who.downed) {
      if (byPlayer) damageBot(who, v.def.boom.dmg * 1.2);
      else damageBotFromBot(who, v.def.boom.dmg * 1.2);
    }
  }

  explode(at, v.def.boom.radius, v.def.boom.dmg, 0xffa040, null);
  Sound.playExplosion({ pos: at, listenerPos: player.pos, listenerYaw: player.yaw });
  spawnVehicleDebris(v);

  // stop blocking movement/bullets, hide the shell
  let i = colliders.indexOf(v.col);
  if (i >= 0) colliders.splice(i, 1);
  i = solids.indexOf(v.col.mesh);
  if (i >= 0) solids.splice(i, 1);
  wmCache = null;
  v.group.visible = false;
  v.respawnAt = time + VEHICLE_RESPAWN;
}

function spawnVehicleDebris(v) {
  for (let i = 0; i < 10; i++) {
    const sz = 0.4 + Math.random() * 0.9;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(sz, sz, sz),
      new THREE.MeshStandardMaterial({ color: v.def.trim, roughness: 0.9 })
    );
    m.position.set(v.pos.x + (Math.random() * 2 - 1) * 2, 1 + Math.random() * 2,
                   v.pos.z + (Math.random() * 2 - 1) * 2);
    mapGroup.add(m);
    debris.push({
      mesh: m, life: 2.8,
      vel: new THREE.Vector3((Math.random() * 2 - 1) * 9, 5 + Math.random() * 8, (Math.random() * 2 - 1) * 9),
      spin: new THREE.Vector3(Math.random() * 7, Math.random() * 7, Math.random() * 7),
    });
  }
}

/** Put a destroyed vehicle back on the map somewhere else after a cooldown. */
function respawnVehicle(v) {
  let x = v.pos.x, z = v.pos.z;
  for (let attempt = 0; attempt < 60; attempt++) {
    const tx = (Math.random() * 2 - 1) * (MAP - 20);
    const tz = (Math.random() * 2 - 1) * (MAP - 18);
    if (vehicleSpotClear(v.def, tx, tz)) { x = tx; z = tz; break; }
  }
  v.pos.set(x, 0, z);
  v.yaw = Math.random() * Math.PI * 2;
  v.speed = 0;
  v.hp = v.maxHp;
  v.alive = true;
  v.group.visible = true;
  v.group.position.set(x, 0, z);
  v.group.rotation.y = v.yaw;
  syncVehicleCollider(v);
  colliders.push(v.col);
  solids.push(v.col.mesh);
  wmCache = null;
}

/** Would a vehicle body at (x,z) overlap solid cover? (ignores other vehicles) */
function vehicleBlockedAt(v, x, z) {
  const c = Math.abs(Math.cos(v.yaw)), sn = Math.abs(Math.sin(v.yaw));
  const hw = v.def.wid / 2, hl = v.def.len / 2;
  const ex = hw * c + hl * sn, ez = hw * sn + hl * c;
  for (const col of colliders) {
    if (col === v.col) continue;
    if (col.kind === "vehicle") continue;              // vehicles shove past each other
    if (col.top < 0.8) continue;                       // low kerbs don't stop a truck
    if (x + ex > col.min.x && x - ex < col.max.x &&
        z + ez > col.min.z && z - ez < col.max.z) return col;
  }
  return null;
}

/**
 * One frame of vehicle simulation: driver input → throttle/steering, then
 * movement, collisions, ramming, wheel spin and occupant placement.
 */
function updateVehicles(dt) {
  for (const v of vehicles) {
    if (!v.alive) {
      if (time >= v.respawnAt) respawnVehicle(v);
      continue;
    }

    // ---- driver intent ----
    let throttle = 0, steer = 0;
    const d = v.driver;
    if (d === player && player.alive && !player.downed) {
      if (keys["KeyW"]) throttle += 1;
      if (keys["KeyS"]) throttle -= 1;
      if (keys["KeyA"]) steer += 1;
      if (keys["KeyD"]) steer -= 1;
      if (keys["ShiftLeft"]) throttle *= 1.15;          // a little extra push
    } else if (d && d !== player && d.alive && !d.downed && d.driveTo) {
      // bot driver: steer toward its destination, full throttle unless it needs
      // to swing the nose around first
      const dx = d.driveTo.x - v.pos.x, dz = d.driveTo.z - v.pos.z;
      const want = Math.atan2(dx, dz);
      let diff = want - v.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      steer = Math.max(-1, Math.min(1, diff * 1.7));
      throttle = Math.abs(diff) > 2.2 ? -0.6 : 1;       // reverse out of a bad angle
    }

    // ---- longitudinal motion ----
    const def = v.def;
    if (throttle > 0) v.speed += def.accel * throttle * dt;
    else if (throttle < 0) v.speed -= def.brake * 0.55 * dt;
    else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), def.brake * 0.5 * dt);
    v.speed = Math.max(-def.maxSpeed * 0.45, Math.min(def.maxSpeed, v.speed));

    // steering only bites when actually rolling, and scales with speed
    if (Math.abs(v.speed) > 0.4) {
      const grip = Math.min(1, Math.abs(v.speed) / (def.maxSpeed * 0.5));
      v.yaw += steer * def.turn * grip * dt * Math.sign(v.speed);
    }

    // ---- integrate + collide ----
    const nx = v.pos.x + Math.sin(v.yaw) * v.speed * dt;
    const nz = v.pos.z + Math.cos(v.yaw) * v.speed * dt;
    const hit = vehicleBlockedAt(v, nx, nz);
    if (hit) {
      // crunch into cover: shed speed, and shove destructible props aside
      const impact = Math.abs(v.speed);
      if (hit.destructible && impact > 6) damageProp(hit, impact * 9);
      if (impact > 14) damageVehicle(v, (impact - 14) * 2.5, false);
      if (!v.alive) continue;
      // slide along whichever axis is still free instead of stopping dead —
      // otherwise a vehicle nosed into a wall can never work itself loose
      if (!vehicleBlockedAt(v, nx, v.pos.z)) { v.pos.x = nx; v.speed *= 0.75; }
      else if (!vehicleBlockedAt(v, v.pos.x, nz)) { v.pos.z = nz; v.speed *= 0.75; }
      else v.speed *= -0.15;                       // truly boxed in: bounce off
    } else {
      v.pos.x = nx; v.pos.z = nz;
    }
    const lim = MAP - 4;
    v.pos.x = Math.max(-lim, Math.min(lim, v.pos.x));
    v.pos.z = Math.max(-lim, Math.min(lim, v.pos.z));

    v.group.position.set(v.pos.x, 0, v.pos.z);
    v.group.rotation.y = v.yaw;
    syncVehicleCollider(v);

    // ---- wheels ----
    v.wheelSpin += v.speed * dt * 1.6;
    for (const w of v.wheels) w.rotation.x = v.wheelSpin;

    // ---- ramming: run people over (R-VEH-1) ----
    if (Math.abs(v.speed) > 6) {
      const frac = Math.min(1, Math.abs(v.speed) / def.maxSpeed);
      const dmg = def.ram * frac;
      const ex = (v.col.max.x - v.col.min.x) / 2 + 0.6;
      const ez = (v.col.max.z - v.col.min.z) / 2 + 0.6;
      for (const b of bots) {
        if (!b.alive || b.downed || b.vehicle) continue;
        if (Math.abs(b.pos.x - v.pos.x) > ex || Math.abs(b.pos.z - v.pos.z) > ez) continue;
        if (b._ramCd && time < b._ramCd) continue;
        b._ramCd = time + 0.5;
        const byPlayer = v.driver === player;
        if (byPlayer) damageBot(b, dmg);
        else if (b.team !== vehicleTeam(v)) damageBotFromBot(b, dmg);
        // knock them clear so they don't sit inside the chassis
        b.pos.x += Math.sin(v.yaw) * 1.6;
        b.pos.z += Math.cos(v.yaw) * 1.6;
      }
      // the player can be run over too — but not by their own ride
      if (player.alive && !player.downed && !player.vehicle &&
          Math.abs(player.pos.x - v.pos.x) <= ex && Math.abs(player.pos.z - v.pos.z) <= ez &&
          (!player._ramCd || time >= player._ramCd)) {
        player._ramCd = time + 0.5;
        damagePlayer(dmg, v.pos);
      }
    }

    // ---- seat occupants to the vehicle ----
    for (let i = 0; i < v.occupants.length; i++) {
      const who = v.occupants[i];
      const p = seatWorld(v, i);
      if (who === player) {
        player.pos.set(p.x, 0, p.z);
        player.vel.set(0, 0, 0);
        player.onGround = true;
      } else {
        who.pos.set(p.x, 0, p.z);
        who.mesh.position.set(p.x, v.def.tall * 0.35, p.z);
        who.mesh.rotation.y = v.yaw;
      }
    }
  }
}

/** E near a vehicle gets you in; E while aboard gets you out. */
function updateVehicleInput() {
  const pressed = !!keys["KeyE"];
  const tapped = pressed && !player._eLatch;
  player._eLatch = pressed;

  if (player.vehicle) {
    vehiclePromptEl.classList.add("hidden");
    ziplinePromptEl.classList.add("hidden");
    if (tapped) exitVehicle(player);
    return;
  }
  if (!player.alive || player.downed) { vehiclePromptEl.classList.add("hidden"); return; }

  const v = nearbyVehicle(player);
  vehiclePromptEl.classList.toggle("hidden", !v);
  if (v) {
    vehiclePromptText.textContent = v.driver ? `Ride in the ${v.def.name}` : `Drive the ${v.def.name}`;
    if (tapped) enterVehicle(v, player);
  }
}

function attachZipline(z) {
  player.zip = z;
  player.zipT = 0;
  player.sliding = false;
  toast("Riding the zipline — press E to drop off");
}
function detachZipline() {
  player.zip = null;
  player.zipT = 0;
  player.vel.y = 0;
}

/** Player holding E over a downed teammate revives them. */
const revivePromptEl = document.getElementById("revivePrompt");
const revivePromptText = document.getElementById("revivePromptText");
const reviveFillMe = document.getElementById("reviveFillMe");

function updatePlayerReviving(dt) {
  if (!player.alive || player.downed) { revivePromptEl.classList.add("hidden"); return; }
  const near = bots.find(b => b.downed && b.team === "blue" && b.pos.distanceTo(player.pos) < REVIVE.range);
  if (!near) {
    revivePromptEl.classList.add("hidden");
    player.reviveTargetProgress = 0;
    return;
  }
  revivePromptEl.classList.remove("hidden");
  revivePromptText.textContent = `Revive ${near.name}`;

  if (keys["KeyE"]) {
    const speed = player.role === "medic" ? 1 / REVIVE.medicTime : 1 / REVIVE.time;
    player.reviveTargetProgress += dt * speed;
    if (player.reviveTargetProgress >= 1) {
      reviveBot(near, "You");
      player.reviveTargetProgress = 0;
      P.addXp(XP.assist);
      xpPopup(`+${XP.assist} XP`);
    }
  } else {
    player.reviveTargetProgress = Math.max(0, player.reviveTargetProgress - dt);
  }
  reviveFillMe.style.width = (player.reviveTargetProgress * 100) + "%";
}

/** While you're down: bleed out, show the timer + any incoming revive. */
const bleedCountEl = document.getElementById("bleedCount");
const downedHintEl = document.getElementById("downedHint");
const reviveFillEl = document.getElementById("reviveFill");

function updateDowned(dt) {
  if (scopeActive) unscope();
  player.bleed -= dt;
  bleedCountEl.textContent = Math.max(0, Math.ceil(player.bleed));
  reviveFillEl.style.width = (Math.min(1, player.reviveProgress) * 100) + "%";

  const helper = bots.find(b => b.team === "blue" && b.alive && !b.downed &&
                                b.pos.distanceTo(player.pos) < REVIVE.range);
  downedHintEl.textContent = helper
    ? `${helper.name} is reviving you…`
    : (bots.some(b => b.team === "blue" && b.alive && !b.downed)
        ? "A teammate is on the way — press Enter to call for help"
        : "No teammates left…");

  // decay progress if nobody is standing over you
  if (!helper) player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.5);
  if (player.bleed <= 0) playerDie();
}

/** Nearest living enemy of this bot — the player counts as a target for red. */
function nearestEnemyOf(b) {
  let best = null, bestD = Infinity;
  const oppTeam = b.team === "red" ? "blue" : "red";
  if (b.team === "red" && player.alive && !player.downed) {
    bestD = b.pos.distanceTo(player.pos);
    best = { pos: player.pos, isPlayer: true };
  }
  for (const o of bots) {
    if (!o.alive || o.downed || o.team !== oppTeam) continue;
    const d = b.pos.distanceTo(o.pos);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function clampBot(b) {
  const lim = MAP - 3;
  b.pos.x = Math.max(-lim, Math.min(lim, b.pos.x));
  b.pos.z = Math.max(-lim, Math.min(lim, b.pos.z));
  b.mesh.position.copy(b.pos);
}
function faceAlong(b, at) {
  b.mesh.rotation.y = Math.atan2(at.x - b.pos.x, at.z - b.pos.z);
}

/** Where the current chat order sends this bot (R-AI-4). */
function orderDestination(b) {
  if (b.team !== "blue") return null;
  switch (teamOrder) {
    case "attack":  return orderPoint || RED_SPAWN;
    case "defend":  return orderPoint || BLUE_SPAWN;
    case "regroup": return player.pos;
    case "fallback": return BLUE_SPAWN;
    default: return null;
  }
}

function botShoot(b, target, dist, D) {
  const role = b.roleData;
  const gun = GUNS[b.gunKey] || GUNS[role.gun] || GUNS.rifle;
  b.fireKickT = 0.12;   // visual recoil pop on the gun arm, hit or miss (R-VIS)
  fireMuzzleFX(b.gunGroup);   // flash + shell casing + smoke, every shot attempt
  Sound.playGunshot(GUN_SFX[b.gunKey] || "crack", { pos: b.pos, listenerPos: player.pos, listenerYaw: player.yaw });

  // accuracy: role skill × difficulty, falling off with range
  const acc = Math.min(0.95, role.accuracy * D.accuracy * 0.6 - Math.min(0.3, dist / 260));
  if (Math.random() > acc) return;    // missed

  const dmg = gun.dmg * (role.key === "sniper" ? 0.45 : 0.62);  // bots hit softer than players

  if (target.isPlayer) damagePlayer(dmg, b.pos);
  else if (target.bot) damageBotFromBot(target.bot, dmg);
}

/** Bot-on-bot damage — never touches the player's coins/XP. */
function damageBotFromBot(t, dmg) {
  if (!t.alive || t.downed) return;
  const dr = t.roleData ? t.roleData.dr : 0;
  t.hp -= dmg * (1 - dr);
  if (t.hp <= 0) downOrKillBot(t);
}

function botThrowGrenade(b, at) {
  const u = UTILS.frag;
  const from = new THREE.Vector3(b.pos.x, 1.6, b.pos.z);
  const to = new THREE.Vector3(at.x, 0, at.z);
  const flat = new THREE.Vector3().subVectors(to, from); flat.y = 0;
  const dist = flat.length();
  flat.normalize();

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({ color: u.color, emissive: u.color, emissiveIntensity: 0.3 })
  );
  mesh.position.copy(from);
  scene.add(mesh);

  // lob it so it lands roughly on target
  const speed = Math.min(30, 9 + dist * 0.8);
  projectiles.push({
    key: "frag", u, mesh,
    pos: from.clone(),
    vel: flat.multiplyScalar(speed).add(new THREE.Vector3(0, 7, 0)),
    fuse: u.fuse + 0.4,
    fromTeam: b.team,          // won't hurt its own side
  });
  if (b.team === "red" && b.pos.distanceTo(player.pos) < 45) chatSys(`${b.name} lobs a grenade!`);
}

// ============================================================
//  CHAT + TEAM COMMANDS  (R-AI-4) — Enter to talk, no leaders:
//  anyone can call it, teammates read it and answer.
// ============================================================
let teamOrder = null;          // attack | defend | regroup | fallback | revive | null
let orderPoint = null;         // world point tied to the order
let chatOpen = false;

const chatLogEl = document.getElementById("chatLog");
const chatBoxEl = document.getElementById("chatBox");
const chatInputEl = document.getElementById("chatInput");

function chatPush(who, text, cls) {
  const el = document.createElement("div");
  el.className = `chat-msg ${cls}`;
  el.innerHTML = who ? `<span class="who">${who}</span>${text}` : text;
  chatLogEl.appendChild(el);
  while (chatLogEl.children.length > 6) chatLogEl.removeChild(chatLogEl.firstChild);
  setTimeout(() => el.remove(), 9000);
}
const chatSys = (t) => chatPush("", t, "sys");
const chatAlly = (name, t) => chatPush(name + ":", t, "ally");

function openChat() {
  if (chatOpen || !running) return;
  chatOpen = true;
  chatBoxEl.classList.remove("hidden");
  chatInputEl.value = "";
  chatInputEl.focus();
  document.exitPointerLock();
  for (const k in keys) keys[k] = false;    // don't keep walking while typing
}
function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  chatBoxEl.classList.add("hidden");
  chatInputEl.blur();
  if (running && player.alive) canvas.requestPointerLock();
}

// ---------- squad voice lines (R-AI-4) ----------
// Big varied pools so the squad doesn't repeat itself — one random line per
// order, plus unprompted ambient banter (see startAmbientChatter below).
const ORDER_LINES = {
  attack:  ["Pushing up — on me!", "Moving in, let's go!", "Attacking now!", "Copy, advancing!", "On your six, pushing!", "Let's go, let's go!"],
  defend:  ["Holding this position.", "Dug in here.", "Copy, holding.", "I've got this angle.", "Staying put.", "Not moving, copy."],
  regroup: ["Regrouping on you.", "Coming to you.", "On my way, forming up.", "Copy, regrouping.", "Heading your way."],
  fallback:["Falling back!", "Retreating!", "Copy, pulling back.", "Backing off now.", "Withdrawing, copy."],
  reviveDown:  ["Coming to get you — hold on!", "Hang on, I'm on my way!", "Don't die on me, almost there!", "Copy, moving to revive!"],
  reviveWatch: ["Copy, watching for downs.", "Got eyes on the squad.", "Copy, on revive duty.", "Understood, watching your back."],
};
const CHATTER = [
  "Copy that.", "Roger.", "Understood.", "On it.", "Got your back.",
  "lol", "ok", "no", "yep.", "nah.", "haha", "for real?", "no cap",
  "nice one.", "nice shot!", "gg", "my bad.", "solid.", "yeah.",
  "hold up.", "negative.", "watch your corners.", "let's push.",
  "focus fire!", "on your left.", "incoming!", "reloading, cover me!",
];
// unprompted squad banter — fires on its own during a match (see startAmbientChatter)
const IDLE_CHATTER = [
  "Stay sharp out there.", "Anyone got eyes on the flag?", "This map is rough.",
  "No sign of them over here.", "Let's push together.", "ok, I'm moving up.",
  "Watch that corner.", "Nice shot!", "Contact, get down!", "I'm low on ammo.",
  "Squad's looking good.", "No time to waste.", "Let's go, let's go!",
  "Hah, close one.", "Sticking with you.", "lol they never learn.",
  "ok ok, on it.", "no, go left!", "Reloading, cover me.", "Nice, gg.",
  "Careful, they're flanking.", "On your six.", "Feels quiet... too quiet.",
  "Let's wrap this up.", "Yeah, I see them.", "Negative, hold position.",
];
const DOWN_LINES = [
  "I'm down, need a medic!", "Help, I'm hit!", "Man down, revive me!",
  "I need a revive here!", "Somebody get me up!", "Down! A little help?",
];
const REVIVED_LINES = [
  "Thanks for the save!", "I owe you one.", "Back in it!",
  "Appreciate it!", "ok, I'm up!", "Good looking out.",
];
// note: `pick(arr)` is already defined later in this file (used for map RNG) — reused here.
let lastAmbientChat = -999;

/** Read an order out of free text and tell the squad. */
function sendChat(text) {
  const msg = text.trim();
  if (!msg) return;
  chatPush("You:", msg, "you");

  const t = msg.toLowerCase();
  const allies = bots.filter(b => b.team === "blue" && b.alive && !b.downed);
  const speaker = allies.length ? allies[(Math.random() * allies.length) | 0] : null;
  const reply = (line) => { if (speaker) setTimeout(() => chatAlly(speaker.name, line), 350); };

  if (/\b(attack|push|advance|go|charge)\b/.test(t)) {
    teamOrder = "attack"; orderPoint = null;
    reply(pick(ORDER_LINES.attack));
    toast("Squad: ATTACKING");
  } else if (/\b(defend|hold|guard|stay)\b/.test(t)) {
    teamOrder = "defend"; orderPoint = player.pos.clone();
    reply(pick(ORDER_LINES.defend));
    toast("Squad: DEFENDING here");
  } else if (/\b(regroup|group|follow|come|on me|with me)\b/.test(t)) {
    teamOrder = "regroup"; orderPoint = null;
    reply(pick(ORDER_LINES.regroup));
    toast("Squad: REGROUPING on you");
  } else if (/\b(revive|help|medic|res|save)\b/.test(t)) {
    teamOrder = "revive"; orderPoint = null;
    reply(pick(player.downed ? ORDER_LINES.reviveDown : ORDER_LINES.reviveWatch));
    toast("Squad: REVIVE priority");
  } else if (/\b(fall ?back|retreat|back off|withdraw)\b/.test(t)) {
    teamOrder = "fallback"; orderPoint = null;
    reply(pick(ORDER_LINES.fallback));
    toast("Squad: FALLING BACK");
  } else {
    // not an order — just squad chatter
    reply(pick(CHATTER));
  }
}

chatInputEl.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.code === "Enter" || e.code === "NumpadEnter") { sendChat(chatInputEl.value); closeChat(); }
  else if (e.code === "Escape") closeChat();
});

// ============================================================
//  GAME STATE / MODES
// ============================================================
let running = false;
let difficulty = "recruit"; // recruit | veteran | elite — scales enemy AI (R-AI-1)
const state = { mode: "team", teamSize: 3, blueScore: 0, redScore: 0, target: 30, wave: 0, waveKills: 0, waveGoal: 0 };

function startMatch(mode, teamSize, roleKey, diffKey, mapKey) {
  const m = MODES[mode] || MODES.team;
  resetVehicleState();      // never inherit a ride from the previous match
  state.mode = mode; state.teamSize = teamSize;
  state.blueScore = 0; state.redScore = 0; state.wave = 0; state.waveKills = 0;
  state.target = m.target || 0;
  state.spectating = false;
  difficulty = effectiveDifficulty(diffKey || difficulty);
  applyRole(roleKey || player.role);          // R-ROL-1
  applySkin();                                 // R-PRG-4 (cosmetic)
  teamOrder = null; orderPoint = null;
  chatLogEl.innerHTML = "";
  closeChat();
  player.downed = false; player.reviveProgress = 0; player.reviveTargetProgress = 0;
  document.getElementById("downed").classList.add("hidden");
  document.getElementById("revivePrompt").classList.add("hidden");
  document.getElementById("eliminated").classList.add("hidden");
  document.getElementById("respawn").classList.add("hidden");

  // build the voted map, then the objectives that sit on it
  buildMap(mapKey || currentMap);

  // clear old bots
  for (const b of bots) scene.remove(b.mesh);
  bots.length = 0;

  if (mode === "range") {
    // solo practice: static targets only, no allies, nothing shoots back (R-MOD-5)
    buildRangeTargets(6);
    modeLabel = m.name.toUpperCase();
  } else if (mode === "wave") {
    // co-op: a few allies + endless scaling waves (R-MOD-3)
    for (let i = 0; i < Math.max(1, teamSize - 1); i++) spawnBot("blue");
    nextWave();
  } else if (!m.teams) {
    // solo modes (FFA / Solo DM / Gun Game / Battle Royale): everyone is an enemy.
    // FFA and BR are uncapped — they scale past the 5v5 limit (R-MOD-2).
    const count = m.uncapped ? Math.max(6, teamSize * 3) : teamSize * 2;
    for (let i = 0; i < count; i++) spawnBot("red");
    modeLabel = m.name.toUpperCase();
  } else {
    // team modes: allies + enemies
    for (let i = 0; i < teamSize - 1; i++) spawnBot("blue");
    for (let i = 0; i < teamSize; i++) spawnBot("red");
    modeLabel = m.name.toUpperCase();
  }

  // solo-mode bots start spread across the map rather than in one base
  if (!m.teams && mode !== "wave" && mode !== "range") {
    for (const b of bots) {
      b.pos.set((Math.random() * 2 - 1) * (MAP - 20), 0, (Math.random() * 2 - 1) * (MAP - 20));
      b.mesh.position.copy(b.pos);
    }
  }

  OBJ.setupObjectives(mode);

  player.alive = true;
  player.pos.copy(BLUE_SPAWN);
  player.kills = 0;
  applyLoadout();                 // equips bought loadout + armor (R-LDO-3, R-RSP-2)
  if (mode === "gun") applyGunGameWeapon();
  player.hp = player.maxHp;
  // clear leftover throwables/effects from a previous match
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const e of effects) if (e.mesh) scene.remove(e.mesh);
  effects.length = 0;

  document.getElementById("menu").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  document.getElementById("exitRangeBtn").classList.toggle("hidden", mode !== "range");
  running = true;
  canvas.requestPointerLock();
  player.zip = null; player.zipT = 0;
  toast(`${m.name} — ${MAPS[currentMap].name}, ${TIMES[currentTime].name}, ${WEATHER[currentWeather].name}`);
  chatSys(m.desc);
  if (!m.respawn) chatSys("No respawns in this mode — stay alive.");
  if (mode === "range") chatSys("Infinite ammo, no damage. Press ESC or click Exit Range to leave.");
}

/** Bail out of the Shooting Range back to the menu — there's no win/lose to wait out. */
function leaveRange() {
  if (state.mode !== "range") return;
  running = false;
  state.spectating = false;
  document.exitPointerLock();
  for (const b of bots) scene.remove(b.mesh);
  bots.length = 0;
  document.getElementById("hud").classList.add("hidden");
  document.getElementById("exitRangeBtn").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
}

const DIFF_ORDER = ["recruit", "veteran", "elite"];
/**
 * Final enemy difficulty = your pick, raised by your win streak (R-RNK-4)
 * and capped for new players by matchmaking protection (R-RNK-3).
 */
function effectiveDifficulty(picked) {
  let i = Math.max(0, DIFF_ORDER.indexOf(picked));
  const streak = profile.stats.streak || 0;
  const bump = streakHardening(streak);
  if (bump) i = Math.min(DIFF_ORDER.length - 1, i + bump);

  if (P.protectedPlayer()) i = Math.min(i, 0);   // shielded: Recruit only
  return DIFF_ORDER[i];
}

/** Paint the viewmodel with the equipped skin. Cosmetic only (R-PRG-4). */
function applySkin() {
  const c = P.skinColor();
  const s = SKINS[profile.skin];
  // higher rarities get a subtle glow so they read as special
  const rank = s ? RARITY[s.rarity].order : 0;
  const skinnable = (viewGun.userData && viewGun.userData.skinnable) || [];
  for (const mat of skinnable) {
    mat.color.setHex(c);
    mat.emissive.setHex(rank >= 3 ? c : 0x000000);
    mat.emissiveIntensity = rank >= 4 ? 0.5 : rank >= 3 ? 0.25 : 0;
  }
}

/** Gun Game: force the current ladder weapon into the primary slot. */
function applyGunGameWeapon() {
  const key = OBJ.gunGameWeapon();
  player.loadout[0] = key;
  const s = statsFor(key);
  player.ammo[key] = s.mag;
  player.reserve[key] = GUNS[key].reserve;
  player.slot = 0;
}

function nextWave() {
  state.wave++;
  state.waveKills = 0;
  const count = 3 + state.wave;      // scaling (R-MOD-3)
  state.waveGoal = count;
  // waves get smarter as they get bigger
  difficulty = state.wave >= 7 ? "elite" : state.wave >= 4 ? "veteran" : "recruit";
  for (let i = 0; i < count; i++) spawnBot("red");
  modeLabel = "WAVE " + state.wave;
  toast(`Wave ${state.wave} — ${count} ${DIFFICULTY[difficulty].name} enemies`);
}

function checkWin() {
  const m = MODES[state.mode] || MODES.team;

  if (state.mode === "wave") {
    // wave mode: red bots don't respawn; clear the wave -> next one
    const anyRedAlive = bots.some(b => b.team === "red" && b.alive);
    if (!anyRedAlive) nextWave();
    // co-op loss: everyone on your side is gone
    if (!player.alive && !bots.some(b => b.team === "blue" && b.alive && !b.downed)) endMatch(false);
    return;
  }

  // score targets (Team Battle, FFA, CTF, Domination)
  if (m.target) {
    if (state.blueScore >= m.target) return endMatch(true);
    if (state.redScore >= m.target) return endMatch(false);
  }

  // elimination modes: last side standing wins (R-RSP-3 — no respawn)
  if (!m.respawn) {
    const redUp = bots.some(b => b.team === "red" && b.alive && !b.downed);
    const blueUp = (player.alive && !player.downed) ||
                   bots.some(b => b.team === "blue" && b.alive && !b.downed);
    if (!redUp) return endMatch(true);
    if (!blueUp) return endMatch(false);
  }
}

/** Objectives call this to score; Domination passes fractional ticks. */
function addScore(team, n) {
  if (team === "blue") state.blueScore += n; else state.redScore += n;
}
/** Objectives call this to end the match outright (bomb detonate/defuse). */
function objectiveWin(team) { endMatch(team === "blue"); }
/** A bot killed by the battle-royale zone. */
function zoneKill(b) {
  b.alive = false; b.downed = false; b.mesh.visible = false; b.respawnAt = Infinity;
}

function endMatch(won) {
  if (!running) return;              // don't double-resolve
  running = false;
  state.spectating = false;
  document.exitPointerLock();

  // RR from performance, streak coins, rank-ups and skin unlocks (R-RNK-2/4)
  const result = P.recordMatch(won, {
    kills: player.kills,
    assists: player.assists,
    score: state.blueScore,
  });
  toast(won ? `VICTORY! +${COINS.win} coins` : "DEFEAT");
  renderHeader();

  setTimeout(() => {
    document.getElementById("hud").classList.add("hidden");
    document.getElementById("respawn").classList.add("hidden");
    document.getElementById("eliminated").classList.add("hidden");
    document.getElementById("downed").classList.add("hidden");
    objBannerEl.classList.remove("show");
    showResult(result);
  }, 1800);
}

// ---------- post-match result + rank-up celebration ----------
const resultScreen = document.getElementById("resultScreen");
function showResult(r) {
  const title = document.getElementById("resultTitle");
  title.textContent = r.won ? "VICTORY" : "DEFEAT";
  title.className = r.won ? "win" : "lose";

  document.getElementById("resultRrDelta").textContent =
    `${r.rrDelta >= 0 ? "+" : ""}${r.rrDelta} RR`;

  const ri = P.rankInfo();
  document.getElementById("resultRrFill").style.width = ri.pct + "%";
  document.getElementById("resultRankLine").textContent =
    ri.next ? `${ri.rank.name} — ${ri.into} / ${ri.need} RR` : `${ri.rank.name} — MAX RANK`;

  // rank up
  const up = document.getElementById("resultRankUp");
  up.classList.toggle("hidden", !r.rankedUp);
  if (r.rankedUp) {
    document.getElementById("resultRankBadge").style.background = r.rank.color;
    document.getElementById("resultRankName").textContent = r.rank.name;
  }

  // skins unlocked by this match
  const skinBox = document.getElementById("resultSkins");
  skinBox.innerHTML = "";
  for (const k of r.newSkins) {
    const s = SKINS[k]; if (!s) continue;
    const rar = RARITY[s.rarity];
    const el = document.createElement("div");
    el.className = "skin-unlock";
    el.style.color = rar.color;
    el.style.borderColor = rar.color + "88";
    el.style.background = rar.color + "18";
    el.textContent = `${rar.name.toUpperCase()} SKIN UNLOCKED — ${s.name}`;
    skinBox.appendChild(el);
  }

  // extras: streak, bonus coins, level up
  const extras = [];
  if (r.won && r.streak > 1) extras.push(`🔥 <b>${r.streak}</b>-win streak — enemies will be tougher`);
  if (r.bonusCoins) extras.push(`Streak bonus: <b>+${r.bonusCoins}</b> coins`);
  if (!r.won && r.streak === 0) extras.push(`Win streak reset`);
  if (r.leveledUp) extras.push(`Level up! Now <b>Lv ${P.level()}</b>`);
  document.getElementById("resultExtras").innerHTML = extras.join("<br>");

  resultScreen.classList.remove("hidden");
}
document.getElementById("resultClose").addEventListener("click", () => {
  resultScreen.classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  renderHeader();
});

/**
 * Respawn gating. Wave enemies never come back, and in elimination modes
 * (Team/Solo Deathmatch, S&D, Battle Royale) nobody comes back (R-RSP-3).
 */
function tuneRespawn(b) {
  const m = MODES[state.mode] || MODES.team;
  if (state.mode === "wave" && b.team === "red") b.respawnAt = Infinity;
  else if (!m.respawn) b.respawnAt = Infinity;
}

// ============================================================
//  HUD / helpers
// ============================================================
let toastT = 0;
const toastEl = document.getElementById("toast");
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("show"); toastT = 2.5; }

const hpFill = document.getElementById("hpFill");
const stFill = document.getElementById("stFill");
const hpText = document.getElementById("hpText");
const ammoNow = document.getElementById("ammoNow");
const ammoReserve = document.getElementById("ammoReserve");
const weaponNameEl = document.getElementById("weaponName");
const coinsEl = document.getElementById("coins");
const crosshairEl = document.getElementById("crosshair");
const scopeOverlayEl = document.getElementById("scopeOverlay");
let scopeActive = false;
/** Force the scope reticle off and restore normal FOV — used when the player
 * can no longer be aiming (downed, respawning) since updatePlayer (the only
 * place that normally toggles it) doesn't run in those states. */
function unscope() {
  scopeActive = false;
  scopeOverlayEl.classList.add("hidden");
  crosshairEl.classList.remove("hidden");
  camera.fov = 75;
  camera.updateProjectionMatrix();
}
const blueScoreEl = document.getElementById("blueScore");
const redScoreEl = document.getElementById("redScore");
const respawnCount = document.getElementById("respawnCount");
const matchLabelEl = document.getElementById("matchLabel");
const objBannerEl = document.getElementById("objBanner");
let modeLabel = "TEAM";
const minimap = document.getElementById("minimap");
const mmCtx = minimap.getContext("2d");

const armorRow = document.getElementById("armorRow");
const arFill = document.getElementById("arFill");
const arText = document.getElementById("arText");
const slotBar = document.getElementById("slotBar");

/**
 * Writing to the DOM every frame is the single most expensive thing the HUD
 * does, so each field is only touched when its value actually changes.
 */
const hudLast = {};
function setText(el, v) { if (hudLast[el.id] !== v) { hudLast[el.id] = v; el.textContent = v; } }
function setWidth(el, v) {
  const key = el.id + ":w";
  if (hudLast[key] !== v) { hudLast[key] = v; el.style.width = v; }
}

function updateHUD() {
  const k = curKey();

  // vehicle panel: chassis health + speed while aboard (R-VEH-1)
  const rv = player.vehicle;
  vehicleHudEl.classList.toggle("hidden", !rv);
  if (rv) {
    setText(vehicleHudName, rv.driver === player ? rv.def.name : `${rv.def.name} (passenger)`);
    setWidth(vehicleHudFill, Math.max(0, rv.hp / rv.maxHp * 100).toFixed(1) + "%");
    setText(vehicleHudSpeed, Math.round(Math.abs(rv.speed) * 3.6) + " km/h");
  }

  setWidth(hpFill, (player.hp / player.maxHp * 100).toFixed(1) + "%");
  setText(hpText, Math.ceil(player.hp));
  setWidth(stFill, player.stamina.toFixed(0) + "%");

  // armor bar only when you own armor
  armorRow.classList.toggle("hidden", player.maxArmor <= 0);
  if (player.maxArmor > 0) {
    setWidth(arFill, (player.armor / player.maxArmor * 100).toFixed(1) + "%");
    setText(arText, Math.ceil(player.armor));
  }

  // ammo / utility readout
  if (isUtilSlot()) {
    const u = UTILS[k];
    setText(ammoNow, player.utilUses);
    setText(ammoReserve, u ? u.uses : 0);
    setText(weaponNameEl, (u ? u.name : "—") + (player.utilCd > 0 ? ` · ${Math.ceil(player.utilCd)}s` : ""));
  } else if (GUNS[k]?.melee) {
    setText(ammoNow, "∞");
    setText(ammoReserve, "—");
    setText(weaponNameEl, GUNS[k].name);
  } else {
    const s = statsFor(k);
    setText(ammoNow, player.reloading > 0 ? "--" : player.ammo[k]);
    setText(ammoReserve, player.reserve[k]);
    const lv = s.level > 1 ? ` Lv${s.level}` : "";
    setText(weaponNameEl, s.name + lv + (player.ads ? " · ADS" : ""));
  }

  setText(coinsEl, profile.coins);
  setText(blueScoreEl, state.mode === "wave" ? player.kills : Math.floor(state.blueScore));
  setText(redScoreEl, state.mode === "wave" ? state.wave : Math.floor(state.redScore));
  setText(matchLabelEl, `${modeLabel} · ${ROLES[player.role].name}`);

  // objective banner (flags / bomb / zone / control points)
  const banner = OBJ.objectiveBanner();
  setText(objBannerEl, banner);
  objBannerEl.classList.toggle("show", !!banner);

  drawSlotBar();

  // crosshair grows with spread
  const moving = player.vel.x * player.vel.x + player.vel.z * player.vel.z > 4;
  let size = 26 + (moving ? 14 : 0) + (!player.onGround ? 16 : 0);
  if (player.ads) size = 14;
  if (hudLast.crosshair !== size) {
    hudLast.crosshair = size;
    crosshairEl.style.width = size + "px";
    crosshairEl.style.height = size + "px";
  }
}

let slotBarSig = "";
function drawSlotBar() {
  const cdPct = player.utilCd > 0 ? Math.ceil(player.utilCd) : 0;
  const sig = player.loadout.join("|") + player.slot + cdPct + player.utilUses;
  if (sig === slotBarSig) return;      // only rebuild when something changed
  slotBarSig = sig;
  let h = "";
  for (let i = 0; i < 4; i++) {
    const key = player.loadout[i];
    const nm = i === 3 ? (UTILS[key]?.name || "—") : (GUNS[key]?.name || "—");
    const isCd = i === 3 && player.utilCd > 0;
    h += `<div class="slot-pip ${i === player.slot ? "active" : ""}">
      <b>${i + 1}</b>${nm}
      ${i === 3 ? `<span style="color:#ffd257">×${player.utilUses}</span>` : ""}
      ${isCd ? `<span class="cd"></span><span class="cd-txt">${cdPct}</span>` : ""}
    </div>`;
  }
  slotBar.innerHTML = h;
}

function drawMinimap() {
  const s = minimap.width, half = MAP;
  mmCtx.clearRect(0, 0, s, s);
  mmCtx.fillStyle = "rgba(8,12,18,0.6)"; mmCtx.fillRect(0, 0, s, s);
  const toMM = (x, z) => [(x / half * 0.5 + 0.5) * s, (z / half * 0.5 + 0.5) * s];
  // spawns
  let [bx, bz] = toMM(BLUE_SPAWN.x, BLUE_SPAWN.z);
  mmCtx.fillStyle = "rgba(74,157,255,0.4)"; mmCtx.beginPath(); mmCtx.arc(bx, bz, 10, 0, 7); mmCtx.fill();
  let [rx, rz] = toMM(RED_SPAWN.x, RED_SPAWN.z);
  mmCtx.fillStyle = "rgba(255,90,90,0.4)"; mmCtx.beginPath(); mmCtx.arc(rx, rz, 10, 0, 7); mmCtx.fill();
  // objectives: bomb sites, control points, flags, safe zone
  for (const s of OBJ.obj.sites) {
    const [x, z] = toMM(s.pos.x, s.pos.z);
    mmCtx.strokeStyle = s.functional ? "#ffd257" : "rgba(200,180,120,0.5)";
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath(); mmCtx.arc(x, z, 6, 0, 7); mmCtx.stroke();
    mmCtx.fillStyle = mmCtx.strokeStyle;
    mmCtx.font = "bold 8px sans-serif"; mmCtx.fillText(s.name, x - 2, z + 3);
  }
  for (const p of OBJ.obj.points) {
    const [x, z] = toMM(p.pos.x, p.pos.z);
    mmCtx.fillStyle = p.owner === "blue" ? "#4a9dff" : p.owner === "red" ? "#ff5a5a" : "#9aa6b2";
    mmCtx.beginPath(); mmCtx.arc(x, z, 6, 0, 7); mmCtx.fill();
    mmCtx.fillStyle = "#0d1117"; mmCtx.font = "bold 8px sans-serif"; mmCtx.fillText(p.name, x - 2, z + 3);
  }
  if (OBJ.obj.flags) {
    for (const f of [OBJ.obj.flags.blue, OBJ.obj.flags.red]) {
      const [x, z] = toMM(f.pos.x, f.pos.z);
      mmCtx.fillStyle = f.team === "blue" ? "#4a9dff" : "#ff5a5a";
      mmCtx.fillRect(x - 3, z - 5, 6, 10);
    }
  }
  if (OBJ.obj.zone) {
    const [cx, cz] = toMM(OBJ.obj.zone.center.x, OBJ.obj.zone.center.z);
    mmCtx.strokeStyle = "#64b5ff"; mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.arc(cx, cz, OBJ.obj.zone.radius / MAP * 0.5 * s, 0, 7);
    mmCtx.stroke();
  }

  // bots
  for (const b of bots) {
    if (!b.alive) continue;
    const [x, z] = toMM(b.pos.x, b.pos.z);
    mmCtx.fillStyle = b.team === "red" ? "#ff5a5a" : "#4a9dff";
    mmCtx.fillRect(x - 2, z - 2, 4, 4);
  }
  // player + facing
  const [px, pz] = toMM(player.pos.x, player.pos.z);
  mmCtx.save();
  mmCtx.translate(px, pz); mmCtx.rotate(-player.yaw);
  mmCtx.fillStyle = "#eafff2";
  mmCtx.beginPath(); mmCtx.moveTo(0, -6); mmCtx.lineTo(4, 5); mmCtx.lineTo(-4, 5); mmCtx.closePath(); mmCtx.fill();
  mmCtx.restore();
}

// ============================================================
//  MENU WIRING
// ============================================================
let selMode = "team", selSize = 3, selRole = "rusher", selDiff = "recruit";
let selTime = "random", selWeather = "random";

// time of day + weather pickers (R-MAP-5)
document.querySelectorAll(".time-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".time-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); selTime = b.dataset.time;
}));
document.querySelectorAll(".wx-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".wx-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); selWeather = b.dataset.wx;
}));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// mode picker
const modeDescEl = document.getElementById("modeDesc");
function refreshModeDesc() {
  const m = MODES[selMode];
  const rules = [];
  rules.push(m.respawn ? "respawns on" : "NO respawns");
  if (m.uncapped) rules.push("no player cap");
  if (m.objective === "flags") rules.push("flags");
  if (m.bombSites) rules.push("bomb sites");
  modeDescEl.textContent = `${m.desc}  (${rules.join(" · ")})`;
}

// role picker
const roleDescEl = document.getElementById("roleDesc");
document.querySelectorAll(".role-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".role-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); selRole = b.dataset.role;
  profile.role = selRole; P.save();           // the Armory filters weapons by role (R-GUN-5)
  enforceRoleLoadout();
  const r = ROLES[selRole];
  roleDescEl.textContent = `${r.desc}  —  ${r.perk}`;
}));
roleDescEl.textContent = `${ROLES.rusher.desc}  —  ${ROLES.rusher.perk}`;

// difficulty picker
const diffDescEl = document.getElementById("diffDesc");
document.querySelectorAll(".diff-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".diff-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); selDiff = b.dataset.diff;
  diffDescEl.textContent = DIFFICULTY[selDiff].desc;
}));
diffDescEl.textContent = DIFFICULTY.recruit.desc;
document.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".mode-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); selMode = b.dataset.mode;
  refreshModeDesc();
}));
refreshModeDesc();
document.querySelectorAll(".size-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".size-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); selSize = Number(b.dataset.size);
}));
document.querySelectorAll(".ctl-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".ctl-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  if (b.dataset.ctl === "mobile") toast("Mobile controls arrive in a later phase — using PC for now.");
}));
// ---------- map voting (R-MAP-2) ----------
const voteScreen = document.getElementById("voteScreen");
const voteOptions = document.getElementById("voteOptions");
const voteResult = document.getElementById("voteResult");
let voteLocked = false;

function openMapVote() {
  voteLocked = false;
  voteResult.textContent = "";
  voteOptions.innerHTML = "";
  document.getElementById("menu").classList.add("hidden");
  voteScreen.classList.remove("hidden");

  for (const key of MAP_KEYS) {
    const def = MAPS[key];
    const el = document.createElement("button");
    el.className = "vote-opt";
    el.dataset.map = key;
    el.innerHTML = `
      <div class="swatch" style="background:linear-gradient(160deg,#${def.sky.toString(16).padStart(6,"0")},#${def.ground.toString(16).padStart(6,"0")})"></div>
      <b>${def.name}</b>
      <small>${def.desc}</small>
      <span class="tally"></span>`;
    el.addEventListener("click", () => { goFullscreen(); castVote(key); });
    voteOptions.appendChild(el);
  }
}

function castVote(playerPick) {
  if (voteLocked) return;
  voteLocked = true;

  // your squad votes too — how many depends on the mode's team size
  const squad = Math.max(1, selSize - 1) + 2;
  const tally = {};
  for (const k of MAP_KEYS) tally[k] = 0;
  tally[playerPick] += 1;
  for (let i = 0; i < squad; i++) tally[MAP_KEYS[(Math.random() * MAP_KEYS.length) | 0]]++;

  // highest tally wins; ties break toward the player's pick
  let winner = playerPick;
  for (const k of MAP_KEYS) if (tally[k] > tally[winner]) winner = k;

  voteOptions.querySelectorAll(".vote-opt").forEach(el => {
    const k = el.dataset.map;
    el.querySelector(".tally").textContent = `${tally[k]} vote${tally[k] === 1 ? "" : "s"}`;
    el.classList.toggle("picked", k === winner);
  });
  voteResult.textContent = `${MAPS[winner].name} wins the vote — deploying…`;

  setTimeout(() => {
    voteScreen.classList.add("hidden");
    // "Random" rolls fresh conditions every match (R-MAP-5)
    currentTime = selTime === "random" ? pick(TIME_KEYS) : selTime;
    currentWeather = selWeather === "random" ? pick(WEATHER_KEYS) : selWeather;
    startMatch(selMode, selSize, selRole, selDiff, winner);
  }, 1400);
}

document.getElementById("playBtn").addEventListener("click", () => {
  Sound.unlock(); // first reliable user gesture before a match starts (R-AUD)
  goFullscreen();  // this click is a real user gesture — fullscreen only works from here
  // Shooting Range is solo practice — no squad, no map vote, straight in (R-MOD-5)
  if (selMode === "range") {
    currentTime = "day"; currentWeather = "clear";
    document.getElementById("menu").classList.add("hidden");
    startMatch("range", selSize, selRole, selDiff, "range");
    return;
  }
  openMapVote();
});
document.getElementById("exitRangeBtn").addEventListener("click", leaveRange);

// Sound settings — volume slider + mute toggle (R-AUD), persisted in sound.js via localStorage
const volumeSlider = document.getElementById("volumeSlider");
const muteBtn = document.getElementById("muteBtn");
function refreshSoundUI() {
  volumeSlider.value = Math.round(Sound.getMasterVolume() * 100);
  muteBtn.textContent = Sound.isMuted() ? "🔇" : "🔊";
  muteBtn.classList.toggle("muted", Sound.isMuted());
}
volumeSlider.addEventListener("input", () => {
  Sound.unlock();
  Sound.setMasterVolume(volumeSlider.value / 100);
  refreshSoundUI();
});
muteBtn.addEventListener("click", () => {
  Sound.unlock();
  Sound.setMuted(!Sound.isMuted());
  refreshSoundUI();
});
refreshSoundUI();

// Armory (shop + loadout)
initShop(toast);

// Objectives module gets a small context so it never imports back into game.js
OBJ.initObjectives({
  THREE, scene,
  player: () => player,
  bots: () => bots,
  keys: () => keys,
  blueSpawn: () => BLUE_SPAWN,
  redSpawn: () => RED_SPAWN,
  mapSize: () => MAP,
  toast, chatSys,
  addScore, win: objectiveWin, zoneKill,
  damagePlayer,
});

// build the default map so the scene isn't empty behind the menu
buildMap(currentMap);

// ============================================================
//  MOVEMENT
// ============================================================
function updatePlayer(dt) {
  if (!player.alive) return;

  // E handling for getting in/out of vehicles runs before anything else (R-VEH-1)
  updateVehicleInput();

  // ----- riding a vehicle: the vehicle moves you, the camera swings out
  // behind it (third-person) and you can still aim + fire any weapon -----
  if (player.vehicle) {
    const v = player.vehicle;
    // safety net: if the vehicle we think we're in isn't on the live map any
    // more (match ended, map rebuilt, wreck cleaned up), bail out on foot
    // instead of staying stuck in the driving camera with no controls.
    if (!v.alive || !vehicles.includes(v)) {
      player.vehicle = null;
      viewGun.visible = true;
      vehicleHudEl.classList.add("hidden");
    } else {
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + v.def.tall * 0.7, player.pos.z);
    // orbit the camera behind the player's look direction, pulled back and up
    const back = 9 + v.def.len * 0.55;
    const camPos = new THREE.Vector3(
      eye.x + Math.sin(player.yaw) * back,
      eye.y + 4.2,
      eye.z + Math.cos(player.yaw) * back
    );
    // don't let the camera sink through the ground
    camPos.y = Math.max(1.6, camPos.y);
    camera.position.copy(camPos);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + recoil - 0.16;
    recoil *= 0.86;
    // the camera is outside the vehicle, so the first-person viewmodel would
    // just float in mid-air — hide it while riding (shooting still works, it
    // raycasts from the camera)
    viewGun.visible = false;
    return;
    }
  }

  if (!viewGun.visible) viewGun.visible = true;

  // riding a zipline overrides normal movement (R-MAP-4)
  updateZipline(dt);
  if (player.zip) {
    camera.position.set(player.pos.x, player.pos.y + player.height, player.pos.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + recoil;
    recoil *= 0.86;
    return;
  }

  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const wish = new THREE.Vector3();
  if (keys["KeyW"]) wish.add(forward);
  if (keys["KeyS"]) wish.sub(forward);
  if (keys["KeyD"]) wish.add(right);
  if (keys["KeyA"]) wish.sub(right);
  const moving = wish.lengthSq() > 0;
  if (moving) wish.normalize();

  // sprint + stamina (R-MOV-2/3), scaled by role (R-ROL-2)
  const roleSpeed = player.speedMul || 1;
  let speed = 8.5 * roleSpeed;                      // fast base
  const drain = player.role === "rusher" ? 21 : 35; // rusher perk: slower drain
  const wantSprint = keys["ShiftLeft"] && moving && player.stamina > 1 && !player.sliding;
  if (wantSprint) { speed = 13 * roleSpeed; player.stamina = Math.max(0, player.stamina - drain * dt); }
  else player.stamina = Math.min(100, player.stamina + 45 * dt); // recharge fast
  if (player.ads) speed *= 0.55;

  // medic perk: regenerates health out of combat
  if (player.role === "medic" && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 4 * dt);
  }

  // slide (WASD + C) — a quick burst then decays (R-MOV-1)
  if (keys["KeyC"] && moving && player.onGround && !player.sliding && player.stamina > 20) {
    player.sliding = true; player.slideT = 0.5; player.stamina -= 15;
  }
  if (player.sliding) {
    player.slideT -= dt;
    speed = 18 * Math.max(0, player.slideT / 0.5) + 6;
    if (player.slideT <= 0 || !keys["KeyC"]) player.sliding = false;
  }

  player.vel.x = wish.x * speed;
  player.vel.z = wish.z * speed;

  // gravity / jump
  player.vel.y -= 26 * dt;
  const next = player.pos.clone();
  next.x += player.vel.x * dt;
  next.z += player.vel.z * dt;
  next.y += player.vel.y * dt;

  // ground / box-top landing
  let groundY = 0;
  for (const c of colliders) {
    if (next.x > c.min.x - player.radius && next.x < c.max.x + player.radius &&
        next.z > c.min.z - player.radius && next.z < c.max.z + player.radius) {
      if (player.pos.y >= c.top - 0.1 && c.top > groundY) groundY = c.top;
    }
  }
  if (next.y <= groundY) { next.y = groundY; player.vel.y = 0; player.onGround = true; }
  else player.onGround = false;

  // footsteps — surface comes from the current map, cadence from sprint/walk (R-AUD)
  if (moving && player.onGround && !player.sliding) {
    const stepRate = wantSprint ? 13 : 8.4;
    const prevPhase = player._stepPhase || 0;
    const newPhase = prevPhase + dt * stepRate;
    if (Math.floor(newPhase / Math.PI) > Math.floor(prevPhase / Math.PI)) {
      const surface = (MAPS[currentMap] || MAPS.compound).surface || "dirt";
      Sound.playFootstep(surface, { self: true, sprint: wantSprint });
    }
    player._stepPhase = newPhase;
  } else {
    player._stepPhase = 0;
  }

  collide(next);
  player.pos.copy(next);

  // camera follow (crouch a bit while sliding)
  const eye = player.height + (player.sliding ? -0.8 : 0);
  camera.position.set(player.pos.x, player.pos.y + eye, player.pos.z);

  // recoil recovers
  recoil *= 0.86;
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + recoil;

  // viewmodel bob + ADS position
  const t = time * 10;
  const bob = moving && player.onGround ? Math.sin(t) * 0.02 : 0;
  const tgt = player.ads ? new THREE.Vector3(0, -0.18, -0.5) : new THREE.Vector3(0.32, -0.32 + bob, -0.7);
  viewGun.position.lerp(tgt, 0.25);

  // rebuild the viewmodel whenever the equipped weapon or its attachments
  // change — cheap string check every frame, real work only on an actual change
  const wk = curKey();
  const attsNow = (profile.attachments && profile.attachments[wk]) || [];
  const sig = wk + ":" + attsNow.join(",");
  if (sig !== viewGunSig) { rebuildViewGun(wk, attsNow); viewGunSig = sig; }

  // ----- scoped ADS (R-CMB-4): sniper/DMR (built-in scope) or any gun with a
  // scope attachment narrow the FOV and swap the plain crosshair for a round
  // scope reticle while aiming, instead of just a tighter default crosshair. -----
  const gs = statsFor(wk);
  const scopeZoom = (player.ads && gs.zoom > 1) ? gs.zoom : 1;
  const targetFov = 75 / scopeZoom;
  if (Math.abs(camera.fov - targetFov) > 0.02) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
  const scoped = scopeZoom > 1;
  if (scoped !== scopeActive) {
    scopeActive = scoped;
    scopeOverlayEl.classList.toggle("hidden", !scoped);
    crosshairEl.classList.toggle("hidden", scoped);
  }
}

// ============================================================
//  MAIN LOOP
// ============================================================
let time = 0, last = performance.now(), mmTick = 0;
function frame(dt) {
  time += dt;

  resize(); // self-heal canvas size (cheap no-op when unchanged)

  if (running) {
    if (player.downed) {
      updateDowned(dt);
    } else {
      updatePlayer(dt);
      tryFire(dt);
      updatePlayerReviving(dt);
    }

    if (player.reloading > 0) { player.reloading -= dt; if (player.reloading <= 0) finishReload(); }
    if (player.utilCd > 0) player.utilCd = Math.max(0, player.utilCd - dt);

    updateProjectiles(dt);
    updateEffects(dt);
    updateGunFX(dt);
    updateDebris(dt);
    refreshShieldMeshes();   // keeps the raycast cache correct

    for (const b of bots) { tuneRespawn(b); updateBot(b, dt); animateSoldier(b, dt); }
    updateVehicles(dt);      // drivable vehicles + ramming (R-VEH-1)
    OBJ.updateObjectives(dt);
    updateEnvironmentCycle(dt);   // day/night + weather drift over the match (R-MAP-6)

    // respawn player (only in modes that allow it — R-RSP-3)
    if (!player.alive && !player.downed && !state.spectating) {
      const left = Math.ceil(player.respawnAt - time);
      respawnCount.textContent = Math.max(0, left);
      if (time >= player.respawnAt) respawnPlayer();
    }

    checkWin();
    updateHUD();
    // the minimap redraws a whole canvas; 20fps is plenty for it
    if ((mmTick = (mmTick + 1) % 3) === 0) drawMinimap();
  }

  updateWeather(dt);   // keeps falling even on the menu, so the scene looks alive
  updateDrones(dt);    // ambient holo-drones bob even on the menu backdrop

  // fx timers
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) { muzzle.intensity = 0; if (viewGun.userData.flash) viewGun.userData.flash.visible = false; } }
  if (blindT > 0) {
    blindT -= dt;
    flashOverlay.style.opacity = Math.max(0, Math.min(1, blindT / blindMax));
    if (blindT <= 0) flashOverlay.style.opacity = 0;
  }
  if (dmgDirT > 0) { dmgDirT -= dt; if (dmgDirT <= 0) dmgDirEl.classList.remove("show"); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove("show"); }

  renderer.render(scene, camera);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Debug hook: lets automated tests step the real simulation when the tab is
// hidden (browsers pause requestAnimationFrame for hidden tabs). No effect on play.
window.__FL = {
  frame,
  startMatch,
  applyLoadout,
  applyRole,
  selectSlot,
  throwUtility,
  statsFor,
  sendChat,
  hasLOS,
  findCover,
  buildMap,
  castVote,
  openMapVote,
  applyEnvironment,
  effectiveDifficulty,
  applySkin,
  showResult,
  get viewGunColor() { const m = viewGun.userData.skinnable && viewGun.userData.skinnable[0]; return m ? "#" + m.color.getHexString() : null; },
  damageProp,
  breakProp,
  attachZipline,
  OBJ,
  get currentMap() { return currentMap; },
  get colliders() { return colliders; },
  get vehicles() { return vehicles; },
  get ziplines() { return ziplines; },
  get debris() { return debris; },
  get env() { return { time: currentTime, weather: currentWeather,
                       particles: weatherPoints ? weatherPoints.geometry.attributes.position.count : 0,
                       sunIntensity: +sun.intensity.toFixed(2),
                       fogFar: scene.fog ? Math.round(scene.fog.far) : null }; },
  get coverPoints() { return coverPoints; },
  get teamOrder() { return teamOrder; },
  get difficulty() { return difficulty; },
  set difficulty(v) { difficulty = v; },
  get state() { return state; },
  get player() { return player; },
  get bots() { return bots; },
  get profile() { return profile; },
  get projectiles() { return projectiles; },
  get effects() { return effects; },
  P,
  set fire(v) { mouseDown = v; },
  set yaw(v) { player.yaw = v; },
};
