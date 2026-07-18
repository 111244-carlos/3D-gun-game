import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe7f1);
scene.fog = new THREE.FogExp2(0xc7e7ed, 0.007);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420);
camera.rotation.order = "YXZ";
scene.add(camera);

const clock = new THREE.Clock();
const keys = new Set();
const enemies = [];
const projectiles = [];
const particles = [];
const casings = [];
const rangeTargets = [];
const colliders = [];
const c4Charges = [];
const NO_MAGAZINE_TYPES = ["Grenade", "Jump Pad", "Bow", "Slingshot", "Melee", "Shield", "Explosive"];

const modes = {
  team: "Team Battle",
  ffa: "Free For All",
  ctf: "Capture Flag",
  range: "Try Range"
};

const weapons = [
  { name: "Vanguard AR", type: "Assault Rifle", cost: 0, ammo: 32, damage: 18, rpm: 690, range: 92, speed: 150, spread: 0.012, recoil: 0.28, color: 0xf0c22e, slot: 0, fire: "hitscan" },
  { name: "Longwatch", type: "Sniper", cost: 420, ammo: 5, damage: 125, rpm: 48, range: 210, speed: 240, spread: 0.00045, recoil: 1.1, color: 0x46534b, slot: 1, fire: "hitscan", zoom: true },
  { name: "Pebble Sling", type: "Slingshot", cost: 0, ammo: 18, damage: 26, rpm: 705, range: 55, speed: 58, spread: 0.018, recoil: 0.18, color: 0x8f6a42, slot: 2, fire: "arc" },
  { name: "Tri-Burst", type: "Burst Rifle", cost: 0, ammo: 30, damage: 17, rpm: 760, range: 88, speed: 155, spread: 0.01, recoil: 0.34, color: 0x2c3744, slot: 3, fire: "burst" },
  { name: "Frag Grenade", type: "Grenade", cost: 220, ammo: 6, damage: 82, rpm: 58, range: 42, speed: 34, spread: 0.006, recoil: 0.35, color: 0x394332, fire: "grenade" },
  { name: "Jump Pad", type: "Jump Pad", cost: 140, ammo: 3, damage: 0, rpm: 80, range: 18, speed: 0, spread: 0, recoil: 0.1, color: 0x279e90, fire: "pad" },
  { name: "Ranger Bow", type: "Bow", cost: 260, ammo: 14, damage: 54, rpm: 90, range: 85, speed: 74, spread: 0.006, recoil: 0.2, color: 0x6d5133, fire: "arrow" },
  { name: "Steel Crossbow", type: "Crossbow", cost: 330, ammo: 8, damage: 72, rpm: 72, range: 105, speed: 96, spread: 0.004, recoil: 0.3, color: 0x45494b, fire: "bolt" },
  { name: "Volt Lance", type: "Energy Rifle", cost: 520, ammo: Infinity, damage: 22, rpm: 620, range: 115, speed: 190, spread: 0.006, recoil: 0.17, color: 0x2e6d8f, fire: "energy" },
  { name: "Pulse Pistol", type: "Energy Pistol", cost: 0, ammo: Infinity, damage: 28, rpm: 360, range: 72, speed: 135, spread: 0.011, recoil: 0.32, color: 0x3979a0, fire: "energy" },
  { name: "Ember Hose", type: "Flamethrower", cost: 650, ammo: 90, damage: 7, rpm: 920, range: 22, speed: 35, spread: 0.045, recoil: 0.05, color: 0x8c3f24, fire: "flame" },
  { name: "Storm LMG", type: "Heavy Rifle", cost: 720, ammo: 80, damage: 19, rpm: 820, range: 98, speed: 150, spread: 0.019, recoil: 0.46, color: 0x424b3c, fire: "hitscan" },
  { name: "Rampage Minigun", type: "Minigun", cost: 900, ammo: 150, damage: 14, rpm: 1500, range: 95, speed: 165, spread: 0.03, recoil: 0.5, color: 0x3a3f33, fire: "hitscan" },
  { name: "Combat Uzi", type: "Uzi", cost: 150, ammo: 32, damage: 13, rpm: 900, range: 45, speed: 140, spread: 0.03, recoil: 0.22, color: 0x25272b, fire: "hitscan" },
  { name: "Rapid SMG", type: "SMG", cost: 260, ammo: 35, damage: 15, rpm: 780, range: 58, speed: 145, spread: 0.024, recoil: 0.24, color: 0x555f52, fire: "hitscan" },
  { name: "Scatter Shotgun", type: "Shotgun", cost: 300, ammo: 6, damage: 11, rpm: 78, range: 30, speed: 150, spread: 0.05, recoil: 0.6, color: 0x6b4423, fire: "shotgun", pellets: 8 },
  { name: "Combat Knife", type: "Melee", cost: 0, ammo: 1, damage: 45, rpm: 300, range: 2.4, speed: 0, spread: 0, recoil: 0.05, color: 0xcfd4d6, fire: "melee" },
  { name: "Katana", type: "Melee", cost: 480, ammo: 1, damage: 85, rpm: 140, range: 2.8, speed: 0, spread: 0, recoil: 0.08, color: 0xe6e6e6, fire: "melee" },
  { name: "Riot Shield", type: "Shield", cost: 260, ammo: 1, damage: 12, rpm: 110, range: 2.0, speed: 0, spread: 0, recoil: 0.05, color: 0x384252, fire: "shield", block: 0.85 },
  { name: "C-4 Charge", type: "Explosive", cost: 380, ammo: 4, damage: 140, rpm: 90, range: 20, speed: 30, spread: 0, recoil: 0.2, color: 0x35401f, fire: "c4", blastRadius: 9 }
].map((weapon, index) => ({
  ...weapon,
  id: index,
  owned: weapon.cost === 0,
  currentAmmo: weapon.ammo
}));

const SLIDE_DURATION = 0.55;
const SLIDE_COOLDOWN = 0.4;
const SLIDE_DIP = 0.45;

const player = {
  position: new THREE.Vector3(0, 1.7, 16),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  height: 1.7,
  health: 100,
  armor: 100,
  coins: 0,
  kills: 0,
  onGround: true,
  aiming: false,
  ability: 100,
  activeSlot: 0,
  selectedWeapon: 0,
  slots: [0, 2, 3, 9],
  mode: "team",
  sliding: false,
  slideTimer: 0,
  slideCooldown: 0,
  slideDir: new THREE.Vector3(),
  slideVisual: 0
};

const ui = {
  status: document.querySelector("#status"),
  coins: document.querySelector("#coins"),
  kills: document.querySelector("#kills"),
  modeLabel: document.querySelector("#modeLabel"),
  health: document.querySelector("#health"),
  healthMini: document.querySelector("#healthMini"),
  armor: document.querySelector("#armor"),
  blueScore: document.querySelector("#blueScore"),
  redScore: document.querySelector("#redScore"),
  roundTimer: document.querySelector("#roundTimer"),
  ability: document.querySelector("#ability"),
  weaponClass: document.querySelector("#weaponClass"),
  weaponName: document.querySelector("#weaponName"),
  ammoNow: document.querySelector("#ammoNow"),
  ammoMax: document.querySelector("#ammoMax"),
  statDamage: document.querySelector("#statDamage"),
  statRate: document.querySelector("#statRate"),
  statRange: document.querySelector("#statRange"),
  statCost: document.querySelector("#statCost"),
  slots: document.querySelector("#slots"),
  weaponList: document.querySelector("#weaponList"),
  buyWeapon: document.querySelector("#buyWeapon"),
  tryWeapon: document.querySelector("#tryWeapon"),
  reload: document.querySelector("#reload"),
  aimLock: document.querySelector("#aimLock"),
  scopeOverlay: document.querySelector("#scopeOverlay"),
  nameTags: document.querySelector("#nameTags"),
  toast: document.querySelector("#toast")
};

const materials = {
  ground: new THREE.MeshStandardMaterial({ color: 0xc99b59, roughness: 0.92 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xb08a61, roughness: 0.78 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x9d7553, roughness: 0.74 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2d3335, metalness: 0.8, roughness: 0.32 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x101314, roughness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc79545, metalness: 0.8, roughness: 0.27 }),
  enemy: new THREE.MeshStandardMaterial({ color: 0xa43b35, roughness: 0.54 }),
  ally: new THREE.MeshStandardMaterial({ color: 0x3b80b5, roughness: 0.54 }),
  flagBlue: new THREE.MeshStandardMaterial({ color: 0x3d92e6, roughness: 0.4 }),
  flagRed: new THREE.MeshStandardMaterial({ color: 0xdf4b42, roughness: 0.4 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xe4ddcd, roughness: 0.72 }),
  hit: new THREE.MeshBasicMaterial({ color: 0x18110d }),
  energy: new THREE.MeshBasicMaterial({ color: 0x5be0ff }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff7436, transparent: true, opacity: 0.72 })
};

const weaponRoot = new THREE.Group();
camera.add(weaponRoot);

const worldRoot = new THREE.Group();
const rangeRoot = new THREE.Group();
scene.add(worldRoot, rangeRoot);

let activeWeaponId = player.slots[player.activeSlot];
let lastShot = 0;
let isReloading = false;
let recoilPitch = 0;
let recoilYaw = 0;
let sway = 0;
let enemySpawnTimer = 0;
let burstTimer = 0;
let pendingBurst = 0;
let selectedListWeapon = 0;
let mouseDown = false;
let roundTime = 120;
let blueScore = 0;
let redScore = 0;
let aimLockRequested = false;
let uiTimer = 0;
let audioContext = null;
let lastHitSound = 0;
const allyNames = ["Frank", "John", "Michael", "Bob", "Alex", "Sam"];
const enemyNames = ["Rex", "Viper", "Ghost", "Mason", "Duke", "Blaze"];

init();

function init() {
  buildLights();
  buildArena();
  buildRange();
  buildWeaponList();
  buildSlots();
  setMode("team");
  equipSlot(0);
  showToast("WASD move, Space jump, right mouse aim, E Super, 1-4 switch");

  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  document.querySelector("#rangeMode").addEventListener("click", () => enterRange(activeWeaponId));
  ui.tryWeapon.addEventListener("click", () => enterRange(selectedListWeapon));
  ui.buyWeapon.addEventListener("click", buySelectedWeapon);
  ui.reload.addEventListener("click", reloadWeapon);
  ui.aimLock.addEventListener("click", requestMouseAim);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", resize);
  resize();
  animate();
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xdce9e8, 0x334038, 1.55));

  const sun = new THREE.DirectionalLight(0xffefd3, 3.2);
  sun.position.set(-16, 28, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  const arenaGlow = new THREE.PointLight(0x8ec8ff, 42, 64, 2);
  arenaGlow.position.set(0, 8, 0);
  scene.add(arenaGlow);
}

function buildArena() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(116, 0.5, 116), materials.ground);
  floor.position.y = -0.25;
  floor.receiveShadow = true;
  worldRoot.add(floor);

  buildBackdrop();

  addWall(0, 2.2, -58, 116, 4.4, 2);
  addWall(0, 2.2, 58, 116, 4.4, 2);
  addWall(-58, 2.2, 0, 2, 4.4, 116);
  addWall(58, 2.2, 0, 2, 4.4, 116);

  const cover = [
    [-24, 1.1, -18, 12, 2.2, 5],
    [18, 1.1, -24, 5, 2.2, 14],
    [-16, 1.1, 20, 7, 2.2, 14],
    [28, 1.1, 18, 14, 2.2, 5],
    [0, 1.1, 0, 8, 2.2, 8],
    [-36, 1.1, 34, 8, 2.2, 8],
    [36, 1.1, -36, 8, 2.2, 8]
  ];
  cover.forEach(([x, y, z, w, h, d]) => addWall(x, y, z, w, h, d));

  buildFlag(-45, -45, materials.flagBlue);
  buildFlag(45, 45, materials.flagRed);

  buildSilos(-10, -46);
  buildSilos(10, -44);
  buildWarehouse(42, -14);
  buildContainerStack(-38, -34);

  for (let i = 0; i < 42; i++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(THREE.MathUtils.randFloat(0.7, 1.6), THREE.MathUtils.randFloat(0.4, 1.1), THREE.MathUtils.randFloat(0.7, 1.6)),
      materials.concrete
    );
    crate.position.set(THREE.MathUtils.randFloatSpread(96), crate.geometry.parameters.height / 2, THREE.MathUtils.randFloatSpread(96));
    crate.rotation.y = Math.random() * Math.PI;
    crate.castShadow = true;
    crate.receiveShadow = true;
    worldRoot.add(crate);
  }
}

function buildBackdrop() {
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0xd7c9ad, roughness: 0.96 });
  for (let i = 0; i < 12; i++) {
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(THREE.MathUtils.randFloat(12, 24), THREE.MathUtils.randFloat(26, 44), 5),
      mountainMat
    );
    mountain.position.set(-70 + i * 13, mountain.geometry.parameters.height * 0.48 - 2, -86 - Math.random() * 10);
    mountain.rotation.y = Math.random() * Math.PI;
    mountain.castShadow = true;
    worldRoot.add(mountain);
  }
}

function buildSilos(x, z) {
  const siloMat = new THREE.MeshStandardMaterial({ color: 0xa97442, roughness: 0.88, metalness: 0.08 });
  for (let i = 0; i < 3; i++) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 11, 24), siloMat);
    silo.position.set(x + i * 5, 5.5, z + Math.sin(i) * 2);
    silo.castShadow = true;
    silo.receiveShadow = true;
    worldRoot.add(silo);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.35, 20, 8), siloMat);
    cap.scale.y = 0.35;
    cap.position.set(silo.position.x, 11.2, silo.position.z);
    cap.castShadow = true;
    worldRoot.add(cap);
  }
}

function buildWarehouse(x, z) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb8835a, roughness: 0.82 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x45515a, roughness: 0.62, metalness: 0.12 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 18), wallMat);
  house.position.set(x, 4, z);
  house.castShadow = true;
  house.receiveShadow = true;
  worldRoot.add(house);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(26, 1.3, 20), roofMat);
  roof.position.set(x, 8.8, z);
  roof.rotation.z = -0.06;
  roof.castShadow = true;
  worldRoot.add(roof);
}

function buildContainerStack(x, z) {
  const colors = [0xa44e3c, 0xb79548, 0x52768a, 0x926548];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(6.5, 2.1, 2.6),
        new THREE.MeshStandardMaterial({ color: colors[(row + col) % colors.length], roughness: 0.78, metalness: 0.08 })
      );
      container.position.set(x + col * 6.8, 1.05 + row * 2.15, z);
      container.castShadow = true;
      container.receiveShadow = true;
      worldRoot.add(container);
    }
  }
}

function addWall(x, y, z, w, h, d) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.wall);
  wall.position.set(x, y, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  wall.userData.bounds = { x, z, halfX: w * 0.5 + 0.42, halfZ: d * 0.5 + 0.42 };
  colliders.push(wall.userData.bounds);
  worldRoot.add(wall);
}

function buildFlag(x, z, material) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.2, 18), materials.steel);
  pole.position.set(x, 2.6, z);
  pole.castShadow = true;
  worldRoot.add(pole);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.08), material);
  flag.position.set(x + 1.1, 4.2, z);
  flag.castShadow = true;
  worldRoot.add(flag);
}

function buildRange() {
  rangeRoot.visible = false;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(42, 0.4, 190), materials.concrete);
  floor.position.set(0, -0.2, -90);
  floor.receiveShadow = true;
  rangeRoot.add(floor);

  const backstop = new THREE.Mesh(new THREE.BoxGeometry(42, 14, 2.2), new THREE.MeshStandardMaterial({ color: 0x5a5147, roughness: 0.95 }));
  backstop.position.set(0, 7, -174);
  backstop.castShadow = true;
  backstop.receiveShadow = true;
  rangeRoot.add(backstop);

  const lineMat = new THREE.MeshStandardMaterial({ color: 0x303637, roughness: 0.65 });
  for (let x = -15; x <= 15; x += 6) {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 160), lineMat);
    lane.position.set(x, 0.04, -88);
    rangeRoot.add(lane);
  }

  [
    { z: -34, size: 1.25 },
    { z: -70, size: 1.05 },
    { z: -112, size: 0.9 },
    { z: -152, size: 0.74 }
  ].forEach((row, rowIndex) => {
    [-10, -5, 0, 5, 10].forEach((x) => {
      const target = createTarget(row.size);
      target.position.set(x, 2.05, row.z);
      target.userData = { health: 100, size: row.size, baseX: x, rowIndex, range: true };
      rangeRoot.add(target);
      rangeTargets.push(target);
    });
  });
}

function createTarget(size) {
  const target = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), materials.steel);
  stand.position.y = -1.1;
  target.add(stand);

  const board = new THREE.Mesh(new THREE.BoxGeometry(size * 1.2, size * 1.55, 0.06), materials.paper);
  board.castShadow = true;
  target.add(board);

  [0xd5cbb8, 0x25282a, 0xd5cbb8, 0xb9312c].forEach((color, i) => {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(size * (0.45 - i * 0.085), size * (0.45 - i * 0.085), 0.012, 52),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.z = 0.038 + i * 0.004;
    target.add(ring);
  });
  return target;
}

function onKeyDown(event) {
  unlockAudio();
  const key = event.key.toLowerCase();
  keys.add(key);

  if (event.code === "Space") {
    event.preventDefault();
    jump();
  }
  if (key === "e" && player.ability >= 100) useAbility();
  if (key === "r") reloadWeapon();
  if (["1", "2", "3", "4"].includes(key)) equipSlot(Number(key) - 1);
  if (key === "shift" && !event.repeat) startSlide();
}

function onPointerMove(event) {
  const sensitivity = player.aiming ? 0.0012 : 0.0022;
  if (document.pointerLockElement === canvas) {
    player.yaw -= event.movementX * sensitivity;
    player.pitch -= event.movementY * sensitivity;
  } else {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    player.yaw = -x * 0.45;
    player.pitch = -y * 0.28;
  }
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.05, 0.72);
}

function onPointerDown(event) {
  unlockAudio();
  if (event.target.closest?.("button")) return;
  if (event.button === 0 && aimLockRequested && document.pointerLockElement !== canvas) requestMouseAim();
  if (event.button === 0) {
    mouseDown = true;
    fireWeapon();
  }
  if (event.button === 2) {
    event.preventDefault();
    const weapon = weapons[activeWeaponId];
    if (weapon.fire === "c4" && c4Charges.length > 0) {
      detonateC4();
    } else if (weapon.zoom) {
      player.aiming = true;
    } else if (player.ability >= 100 && !player.aiming) {
      useAbility();
    } else {
      player.aiming = true;
    }
  }
}

function onPointerUp(event) {
  if (event.button === 0) mouseDown = false;
  if (event.button === 2) player.aiming = false;
}

function requestMouseAim() {
  aimLockRequested = true;
  if (!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try {
    const lock = canvas.requestPointerLock();
    if (lock?.catch) lock.catch(() => showToast("Mouse aim is ready; move over the game if lock is blocked"));
  } catch {
    showToast("Mouse aim is ready; move over the game if lock is blocked");
  }
}

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  ui.aimLock.textContent = locked ? "Mouse aim active" : "Click to use mouse aim";
  ui.aimLock.style.opacity = locked ? "0.35" : "1";
});

function jump() {
  if (!player.onGround) return;
  if (player.sliding) endSlide();
  player.velocity.y = 8.2;
  player.onGround = false;
}

function startSlide() {
  if (!player.onGround || player.sliding || player.slideCooldown > 0) return;
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const move = new THREE.Vector3();
  if (keys.has("w")) move.add(forward);
  if (keys.has("s")) move.sub(forward);
  if (keys.has("d")) move.add(right);
  if (keys.has("a")) move.sub(right);
  if (move.lengthSq() === 0) return;
  move.normalize();

  player.sliding = true;
  player.slideTimer = SLIDE_DURATION;
  player.slideDir.copy(move);
  ui.status.textContent = "Sliding";
  playSound("hit");
}

function endSlide() {
  player.sliding = false;
  player.slideTimer = 0;
  player.slideCooldown = SLIDE_COOLDOWN;
}

function setMode(mode) {
  player.mode = mode;
  document.querySelectorAll(".mode").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  if (mode === "range") {
    enterRange(activeWeaponId);
    return;
  }

  worldRoot.visible = true;
  rangeRoot.visible = false;
  player.position.set(0, player.height, 18);
  player.velocity.set(0, 0, 0);
  player.sliding = false;
  player.slideTimer = 0;
  player.slideVisual = 0;
  enemies.splice(0).forEach((enemy) => {
    enemy.label?.remove();
    enemy.group.removeFromParent();
  });
  if (mode !== "ffa") {
    [
      ["ally", -18, -9],
      ["ally", -6, -13],
      ["ally", 8, -12],
      ["ally", 20, -8]
    ].forEach(([team, x, z]) => spawnEnemy(team, new THREE.Vector3(x, 0, z)));
  }
  for (let i = 0; i < (mode === "ffa" ? 7 : 5); i++) spawnEnemy("enemy");
  ui.status.textContent = `${modes[mode]} active`;
  updateUI();
}

function enterRange(weaponId) {
  player.mode = "range";
  activeWeaponId = weaponId;
  selectedListWeapon = weaponId;
  worldRoot.visible = false;
  rangeRoot.visible = true;
  player.position.set(0, player.height, 8);
  player.velocity.set(0, 0, 0);
  enemies.splice(0).forEach((enemy) => {
    enemy.label?.remove();
    enemy.group.removeFromParent();
  });
  buildWeapon(weapons[activeWeaponId]);
  document.querySelectorAll(".mode").forEach((button) => button.classList.remove("active"));
  ui.status.textContent = `Trying ${weapons[weaponId].name}`;
  showToast("Try Range: test any weapon here, even locked ones");
  updateUI();
}

function spawnEnemy(forcedTeam, forcedPosition) {
  const team = forcedTeam || (player.mode === "team" || player.mode === "ctf" ? (Math.random() > 0.72 ? "ally" : "enemy") : "enemy");
  const group = new THREE.Group();

  // Team colors with glowing accents
  const isAlly = team === "ally";
  const primaryColor = isAlly ? 0x4a9eff : 0xff3d3d;
  const baseColor = isAlly ? 0x2c5aa0 : 0x8b2c2c;

  // Armor material
  const armorMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: 0.6,
    roughness: 0.4
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    metalness: 0.4,
    roughness: 0.3,
    emissive: primaryColor,
    emissiveIntensity: 0.3
  });

  // Main body/torso (sits above the hips, legs handle the lower body)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 6, 12), armorMat);
  body.position.y = 1.25;
  body.castShadow = true;
  group.add(body);

  // Chest accent panel (glowing stripe down center)
  const chestAccent = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.4), accentMat);
  chestAccent.position.set(0, 1.25, 0.22);
  chestAccent.castShadow = true;
  group.add(chestAccent);

  // Shoulder pivots let the arms swing during the walk cycle
  const armLength = 0.75;
  const armHalf = armLength / 2 + 0.14;
  const shoulderY = 1.55;

  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.42, shoulderY, 0);
  group.add(leftShoulder);
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, armLength, 4, 8), armorMat);
  leftArm.position.y = -armHalf;
  leftArm.castShadow = true;
  leftShoulder.add(leftArm);

  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.42, shoulderY, 0);
  group.add(rightShoulder);
  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, armLength, 4, 8), armorMat);
  rightArm.position.y = -armHalf;
  rightArm.castShadow = true;
  rightShoulder.add(rightArm);

  // Hip pivots let the legs swing during the walk cycle
  const legLength = 0.75;
  const legHalf = legLength / 2 + 0.11;
  const hipY = 0.86;

  const leftHip = new THREE.Group();
  leftHip.position.set(-0.18, hipY, 0);
  group.add(leftHip);
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, legLength, 4, 8), armorMat);
  leftLeg.position.y = -legHalf;
  leftLeg.castShadow = true;
  leftHip.add(leftLeg);

  const rightHip = new THREE.Group();
  rightHip.position.set(0.18, hipY, 0);
  group.add(rightHip);
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, legLength, 4, 8), armorMat);
  rightLeg.position.y = -legHalf;
  rightLeg.castShadow = true;
  rightHip.add(rightLeg);

  // Neck connects torso and head
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c29a, roughness: 0.65 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 10), skinMat);
  neck.position.y = 1.92;
  group.add(neck);

  // Round head with a face (+Z is the model's facing direction)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), skinMat);
  head.position.y = 2.18;
  head.castShadow = true;
  group.add(head);

  // Combat helmet: team-colored dome over the top of the head, leaving the face open
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), armorMat);
  helmet.position.y = 2.2;
  helmet.castShadow = true;
  group.add(helmet);

  // Helmet brim above the eyes
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 20, 1, false, -Math.PI * 0.35, Math.PI * 0.7), armorMat);
  brim.position.y = 2.26;
  brim.castShadow = true;
  group.add(brim);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.35 });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
  leftEye.position.set(-0.11, 2.23, 0.26);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
  rightEye.position.set(0.11, 2.23, 0.26);
  group.add(rightEye);

  const noseMat = new THREE.MeshStandardMaterial({ color: 0xd9a87e, roughness: 0.7 });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), noseMat);
  nose.position.set(0, 2.15, 0.29);
  group.add(nose);

  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x8f4a3d, roughness: 0.6 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.03), mouthMat);
  mouth.position.set(0, 2.05, 0.27);
  group.add(mouth);

  const leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skinMat);
  leftEar.position.set(-0.29, 2.18, 0);
  group.add(leftEar);
  const rightEar = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skinMat);
  rightEar.position.set(0.29, 2.18, 0);
  group.add(rightEar);

  // Gun held in front, barrel pointing forward (+Z, same way lookAt aims the model)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.7), materials.steel);
  gun.position.set(0.3, 1.35, 0.5);
  gun.castShadow = true;
  group.add(gun);

  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 12), materials.steel);
  gunBarrel.rotation.x = Math.PI * 0.5;
  gunBarrel.position.set(0.3, 1.39, 1.05);
  gunBarrel.castShadow = true;
  group.add(gunBarrel);

  let pos = forcedPosition;
  if (!pos) {
    do {
      pos = new THREE.Vector3(THREE.MathUtils.randFloatSpread(88), 0, THREE.MathUtils.randFloatSpread(88));
    } while (pos.distanceTo(player.position) < 18);
  }
  group.position.copy(pos);
  worldRoot.add(group);

  const label = document.createElement("div");
  const sameTeamCount = enemies.filter((enemy) => enemy.team === team).length;
  label.className = `name-tag ${team === "enemy" ? "enemy" : "ally"}`;
  label.textContent = team === "ally" ? allyNames[sameTeamCount % allyNames.length] : enemyNames[sameTeamCount % enemyNames.length];
  ui.nameTags.append(label);

  enemies.push({
    group,
    label,
    team,
    health: team === "ally" ? 95 : 100,
    speed: team === "ally" ? 3.8 : THREE.MathUtils.randFloat(3.1, 4.7),
    shootTimer: THREE.MathUtils.randFloat(1.5, 3.0),
    strafe: Math.random() > 0.5 ? 1 : -1,
    reward: team === "ally" ? 0 : THREE.MathUtils.randInt(18, 34),
    walkPhase: Math.random() * Math.PI * 2,
    limbs: { leftHip, rightHip, leftShoulder, rightShoulder, body },
    sliding: false,
    slideTimer: 0,
    slideCooldown: THREE.MathUtils.randFloat(1.5, 4),
    slideDir: new THREE.Vector3()
  });
}

function buildWeapon(weapon) {
  weaponRoot.clear();
  const aimed = player.aiming && weapon.zoom;
  weaponRoot.position.set(aimed ? 0.16 : 0.62, aimed ? -0.5 : -0.58, aimed ? -1.05 : -1.3);
  weaponRoot.rotation.set(-0.05, aimed ? -0.03 : -0.16, 0);

  const gunMat = new THREE.MeshStandardMaterial({
    color: weapon.color,
    metalness: weapon.type.includes("Energy") ? 0.38 : 0.72,
    roughness: weapon.type.includes("Energy") ? 0.22 : 0.36,
    emissive: weapon.type.includes("Energy") ? new THREE.Color(0x063344) : new THREE.Color(0x000000)
  });

  if (weapon.type === "Melee") {
    buildMeleeWeapon(weapon);
    return;
  }
  if (weapon.type === "Shield") {
    buildShieldWeapon(weapon, gunMat);
    return;
  }

  const bodyLength = ["Pistol", "Energy Pistol", "Uzi", "SMG"].includes(weapon.type)
    ? 0.85
    : weapon.type === "Grenade" || weapon.type === "Explosive"
      ? 0.45
      : 1.45;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, bodyLength), gunMat);
  body.position.set(0, 0, -0.42);
  body.castShadow = true;
  weaponRoot.add(body);

  if (weapon.fire === "grenade") {
    const grenade = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 12), gunMat);
    grenade.position.set(0, 0, -0.78);
    weaponRoot.add(grenade);
  } else if (weapon.fire === "pad") {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.14, 28), gunMat);
    pad.rotation.x = Math.PI * 0.5;
    pad.position.set(0, -0.08, -0.86);
    weaponRoot.add(pad);
  } else if (weapon.fire === "c4") {
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.5), gunMat);
    brick.position.set(0, -0.02, -0.7);
    weaponRoot.add(brick);
    const blinker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    blinker.position.set(0, 0.14, -0.68);
    weaponRoot.add(blinker);
  } else if (weapon.type === "Bow" || weapon.type === "Crossbow" || weapon.type === "Slingshot") {
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 32, Math.PI), gunMat);
    limb.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.5);
    limb.position.set(0, 0.02, -0.95);
    weaponRoot.add(limb);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.03), materials.rubber);
    string.position.set(0, 0.02, -1.12);
    weaponRoot.add(string);
  } else if (weapon.type === "Minigun") {
    const barrelCluster = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 12), materials.steel);
      barrel.rotation.x = Math.PI * 0.5;
      barrel.position.set(Math.cos(angle) * 0.11, 0.04 + Math.sin(angle) * 0.11, -1.75);
      barrelCluster.add(barrel);
    }
    barrelCluster.name = "muzzle";
    weaponRoot.add(barrelCluster);
  } else {
    const barrelLength = weapon.type === "Sniper" ? 2.1 : weapon.type === "Flamethrower" ? 1.5 : weapon.type === "Shotgun" ? 0.85 : ["Uzi", "SMG"].includes(weapon.type) ? 0.95 : 1.25;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, barrelLength, 22), materials.steel);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0, 0.04, -barrelLength * 0.5 - 1.05);
    barrel.castShadow = true;
    weaponRoot.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.18, 22), materials.rubber);
    muzzle.rotation.x = Math.PI * 0.5;
    muzzle.position.set(0, 0.04, -barrelLength - 1.05);
    muzzle.name = "muzzle";
    weaponRoot.add(muzzle);
  }

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.56, 0.2), materials.rubber);
  grip.position.set(0, -0.38, -0.08);
  grip.rotation.x = -0.22;
  weaponRoot.add(grip);

  if (!NO_MAGAZINE_TYPES.includes(weapon.type)) {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.28, weapon.type === "Heavy Rifle" ? 0.82 : 0.58, 0.25), materials.rubber);
    mag.position.set(0, -0.43, -0.52);
    mag.rotation.x = 0.06;
    weaponRoot.add(mag);
  }

  if (weapon.zoom || weapon.type === "Crossbow") {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 22), materials.rubber);
    scope.rotation.z = Math.PI * 0.5;
    scope.position.set(0, 0.32, -0.45);
    weaponRoot.add(scope);
  }

  const light = new THREE.PointLight(weapon.type.includes("Energy") ? 0x5be0ff : 0xff8a35, 0, 8, 2);
  light.position.set(0, 0.06, -2.2);
  light.name = "muzzleLight";
  weaponRoot.add(light);
}

function buildMeleeWeapon(weapon) {
  const isKatana = weapon.name === "Katana";
  const bladeLength = isKatana ? 1.3 : 0.5;
  const bladeMat = new THREE.MeshStandardMaterial({ color: weapon.color, metalness: 0.85, roughness: 0.18 });

  const blade = new THREE.Mesh(new THREE.BoxGeometry(isKatana ? 0.05 : 0.07, isKatana ? 0.05 : 0.09, bladeLength), bladeMat);
  blade.position.set(0.12, -0.1, -0.75 - bladeLength * 0.5);
  blade.rotation.x = -0.1;
  blade.castShadow = true;
  weaponRoot.add(blade);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), materials.steel);
  guard.position.set(0.12, -0.1, -0.72);
  weaponRoot.add(guard);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), materials.rubber);
  handle.rotation.x = Math.PI * 0.5;
  handle.position.set(0.12, -0.1, -0.55);
  weaponRoot.add(handle);

  const light = new THREE.PointLight(0xffffff, 0, 4, 2);
  light.position.set(0.12, -0.1, -1.2);
  light.name = "muzzleLight";
  weaponRoot.add(light);
}

function buildShieldWeapon(weapon, gunMat) {
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.0, 0.08), gunMat);
  shield.position.set(0.08, -0.15, -0.75);
  shield.castShadow = true;
  weaponRoot.add(shield);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 24), materials.steel);
  rim.position.set(0.08, -0.15, -0.71);
  weaponRoot.add(rim);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.1), materials.rubber);
  handle.position.set(0.08, -0.15, -0.35);
  weaponRoot.add(handle);

  const light = new THREE.PointLight(0xffffff, 0, 4, 2);
  light.position.set(0.08, -0.15, -1.1);
  light.name = "muzzleLight";
  weaponRoot.add(light);
}

function fireWeapon() {
  const weapon = weapons[activeWeaponId];
  const now = performance.now();
  const delay = 60000 / weapon.rpm;
  if (isReloading || now - lastShot < delay) return;
  const usesAmmo = weapon.fire !== "melee" && weapon.fire !== "shield";
  if (usesAmmo && weapon.currentAmmo <= 0) {
    showToast("Empty. Reload with R.");
    reloadWeapon();
    return;
  }

  lastShot = now;
  if (usesAmmo) weapon.currentAmmo -= 1;
  recoilPitch += weapon.recoil * 0.015;
  recoilYaw += THREE.MathUtils.randFloatSpread(weapon.recoil * 0.01);
  weaponRoot.position.z += weapon.recoil * 0.08;
  weaponRoot.rotation.x -= weapon.recoil * 0.035;
  if (weapon.fire !== "melee" && weapon.fire !== "shield") flashWeapon(weapon);
  playSound(weapon.fire);

  if (weapon.fire === "burst") {
    pendingBurst = 2;
    burstTimer = 0.06;
    shootHitscan(weapon);
  } else if (weapon.fire === "hitscan" || weapon.fire === "energy") {
    shootHitscan(weapon);
  } else if (weapon.fire === "shotgun") {
    shootShotgun(weapon);
  } else if (weapon.fire === "melee" || weapon.fire === "shield") {
    meleeAttack(weapon);
  } else if (weapon.fire === "flame") {
    shootFlame(weapon);
  } else if (weapon.fire === "grenade") {
    launchProjectile(weapon, "grenade");
  } else if (weapon.fire === "pad") {
    deployJumpPad();
  } else if (weapon.fire === "c4") {
    placeC4(weapon);
  } else {
    launchProjectile(weapon, weapon.fire);
  }

  if (!NO_MAGAZINE_TYPES.includes(weapon.type)) createCasing();
  ui.status.textContent = `${weapon.name} fired`;
  updateUI();
}

function shootHitscan(weapon) {
  const direction = getAimDirection(weapon.spread * (player.aiming ? 0.35 : 1));
  const origin = camera.position.clone();
  let closest = null;

  const candidates = getDamageCandidates();
  candidates.forEach((target) => {
    const targetPos = target.group.position.clone().add(new THREE.Vector3(0, target.range ? 0 : 1.05, 0));
    const toTarget = targetPos.clone().sub(origin);
    const forwardDistance = toTarget.dot(direction);
    if (forwardDistance < 0 || forwardDistance > weapon.range) return;
    const miss = targetPos.distanceTo(origin.clone().addScaledVector(direction, forwardDistance));
    const hitRadius = target.range ? target.group.userData.size * 0.68 : 0.82;
    if (miss <= hitRadius && (!closest || forwardDistance < closest.distance)) {
      closest = { target, distance: forwardDistance, point: origin.clone().addScaledVector(direction, forwardDistance) };
    }
  });

  drawTracer(origin, origin.clone().addScaledVector(direction, closest?.distance || weapon.range), weapon.fire === "energy" ? 0x5be0ff : 0xffd36e);
  if (closest) damageTarget(closest.target, weapon.damage, closest.point, weapon);
}

function shootShotgun(weapon) {
  const origin = camera.position.clone();
  const pellets = weapon.pellets || 8;
  const candidates = getDamageCandidates();

  for (let i = 0; i < pellets; i++) {
    const direction = getAimDirection(weapon.spread * (player.aiming ? 0.5 : 1));
    let closest = null;
    candidates.forEach((target) => {
      const targetPos = target.group.position.clone().add(new THREE.Vector3(0, target.range ? 0 : 1.05, 0));
      const toTarget = targetPos.clone().sub(origin);
      const forwardDistance = toTarget.dot(direction);
      if (forwardDistance < 0 || forwardDistance > weapon.range) return;
      const miss = targetPos.distanceTo(origin.clone().addScaledVector(direction, forwardDistance));
      const hitRadius = target.range ? target.group.userData.size * 0.68 : 0.82;
      if (miss <= hitRadius && (!closest || forwardDistance < closest.distance)) {
        closest = { target, distance: forwardDistance, point: origin.clone().addScaledVector(direction, forwardDistance) };
      }
    });
    if (i === 0) drawTracer(origin, origin.clone().addScaledVector(direction, closest?.distance || weapon.range), 0xffd36e);
    if (closest) damageTarget(closest.target, weapon.damage, closest.point, weapon);
  }
}

function meleeAttack(weapon) {
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
  const origin = camera.position.clone();
  let hit = null;

  getDamageCandidates().forEach((target) => {
    const targetPos = getTargetCenter(target);
    const toTarget = targetPos.clone().sub(origin);
    const distance = toTarget.length();
    if (distance > weapon.range) return;
    const angle = toTarget.normalize().dot(forward);
    if (angle > 0.55 && (!hit || distance < hit.distance)) hit = { target, distance, point: targetPos };
  });

  if (hit) damageTarget(hit.target, weapon.damage, hit.point, weapon);
}

function shootFlame(weapon) {
  const direction = getAimDirection(weapon.spread);
  for (let i = 0; i < 10; i++) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.08, 0.2), 10, 8), materials.flame);
    flame.position.copy(camera.position).addScaledVector(direction, 1.3);
    flame.userData.velocity = direction.clone().multiplyScalar(THREE.MathUtils.randFloat(14, 24));
    flame.userData.life = THREE.MathUtils.randFloat(0.25, 0.52);
    scene.add(flame);
    particles.push(flame);
  }

  getDamageCandidates().forEach((target) => {
    const targetPos = getTargetCenter(target);
    const toEnemy = targetPos.clone().sub(camera.position);
    const distance = toEnemy.length();
    const angle = toEnemy.normalize().dot(direction);
    const hitRadius = target.range ? target.group.userData.size * 0.85 : 0.85;
    if (distance < weapon.range + hitRadius && angle > 0.82) damageTarget(target, weapon.damage, targetPos, weapon);
  });
}

function launchProjectile(weapon, kind) {
  const direction = getAimDirection(weapon.spread);
  const color = kind === "grenade" ? 0x3a4233 : kind === "arrow" || kind === "bolt" ? 0xd8c397 : 0x9e8360;
  const geometry = kind === "grenade" ? new THREE.SphereGeometry(0.18, 14, 10) : new THREE.CylinderGeometry(0.035, 0.035, 0.8, 10);
  const projectile = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: kind === "bolt" ? 0.45 : 0.05 }));
  projectile.position.copy(camera.position).addScaledVector(direction, 1.3);
  projectile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  projectile.userData = {
    kind,
    weapon,
    velocity: direction.multiplyScalar(weapon.speed),
    life: kind === "grenade" ? 2.2 : weapon.range / weapon.speed,
    gravity: kind === "grenade" || kind === "arc" || kind === "arrow" ? 11.0 : 5.0
  };
  scene.add(projectile);
  projectiles.push(projectile);
}

function deployJumpPad() {
  const direction = getAimDirection(0);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.45, 0.22, 32),
    new THREE.MeshStandardMaterial({ color: 0x25b59e, metalness: 0.35, roughness: 0.28, emissive: new THREE.Color(0x06423c) })
  );
  pad.position.copy(player.position).addScaledVector(direction, 4.2);
  pad.position.y = 0.12;
  pad.userData.kind = "pad";
  pad.userData.life = 16;
  scene.add(pad);
  particles.push(pad);
  showToast("Jump pad deployed");
}

function placeC4(weapon) {
  const direction = getAimDirection(0);
  const charge = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.32),
    new THREE.MeshStandardMaterial({ color: weapon.color, metalness: 0.4, roughness: 0.5, emissive: new THREE.Color(0x220000) })
  );
  const point = player.position.clone().addScaledVector(direction, Math.min(weapon.range, 8));
  point.y = 0.14;
  charge.position.copy(point);
  scene.add(charge);
  c4Charges.push({ mesh: charge, position: point.clone(), weapon });
  showToast(c4Charges.length >= weapon.ammo ? "Charges armed. Right-click to detonate." : "C-4 placed");
}

function detonateC4() {
  if (c4Charges.length === 0) return;
  const weapon = c4Charges[0].weapon;
  c4Charges.forEach((charge) => {
    superExplosionAt(charge.position, weapon.blastRadius || 9, weapon.damage, { ...weapon, name: "C-4 Detonation" }, 0xff9a3c);
    charge.mesh.removeFromParent();
  });
  c4Charges.length = 0;
  weapon.currentAmmo = weapon.ammo;
  updateUI();
  showToast("C-4 detonated");
}

function useAbility() {
  const weapon = weapons[activeWeaponId];
  player.ability = 0;
  playSound(weapon.fire === "flame" ? "flame" : weapon.fire === "grenade" ? "grenade" : "energy");

  if (weapon.name === "Tri-Burst") {
    fireSuperHitscan(weapon, { shots: 6, damageMultiplier: 2, interval: 42, spreadMultiplier: 0.8, label: "Tri-Burst Overclock" });
  } else if (weapon.name === "Vanguard AR") {
    fireSuperHitscan(weapon, { shots: 10, damageMultiplier: 1.35, interval: 38, spreadMultiplier: 0.55, label: "Vanguard Barrage" });
  } else if (weapon.name === "Longwatch") {
    firePiercingShot(weapon, 2.6, "Longwatch Rail Shot");
  } else if (weapon.name === "Pebble Sling") {
    launchSuperProjectile({ ...weapon, damage: weapon.damage * 3.2, range: weapon.range * 1.25, speed: weapon.speed * 1.15 }, "arc", "Pebble Meteor");
  } else if (weapon.name === "Frag Grenade") {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => launchSuperProjectile({ ...weapon, damage: weapon.damage * 0.85, spread: weapon.spread + 0.055, speed: weapon.speed * 0.95 }, "grenade", "Cluster Grenade"), i * 90);
    }
    showToast("Cluster Grenade launched");
  } else if (weapon.name === "Jump Pad") {
    deploySuperJumpPad(weapon);
  } else if (weapon.name === "Ranger Bow") {
    fireSuperHitscan(weapon, { shots: 5, damageMultiplier: 1.45, interval: 95, spreadMultiplier: 2.6, label: "Arrow Rain" });
  } else if (weapon.name === "Steel Crossbow") {
    firePiercingShot(weapon, 2.15, "Crossbow Skewer");
  } else if (weapon.name === "Volt Lance") {
    chainLightning(weapon);
  } else if (weapon.name === "Pulse Pistol") {
    fireSuperHitscan(weapon, { shots: 9, damageMultiplier: 1.15, interval: 35, spreadMultiplier: 2.2, label: "Pulse Fan" });
  } else if (weapon.name === "Ember Hose") {
    superConeDamage(weapon, weapon.damage * 5.5, weapon.range * 1.55, 0.62, "Inferno Sweep");
  } else if (weapon.name === "Storm LMG") {
    fireSuperHitscan(weapon, { shots: 18, damageMultiplier: 1.2, interval: 28, spreadMultiplier: 1.35, label: "Storm Suppression" });
  } else {
    fireSuperHitscan(weapon, { shots: 6, damageMultiplier: 1.6, interval: 55, spreadMultiplier: 1, label: `${weapon.name} Super` });
  }
}

function fireSuperHitscan(weapon, options) {
  const superWeapon = {
    ...weapon,
    damage: weapon.damage * options.damageMultiplier,
    spread: weapon.spread * options.spreadMultiplier,
    range: weapon.range * 1.2,
    name: options.label
  };
  for (let i = 0; i < options.shots; i++) {
    setTimeout(() => {
      flashWeapon(superWeapon);
      playSound(weapon.fire);
      shootHitscan(superWeapon);
    }, i * options.interval);
  }
  showToast(`${options.label}: ${options.shots} super rounds`);
}

function firePiercingShot(weapon, damageMultiplier, label) {
  const direction = getAimDirection(weapon.spread * 0.2);
  const origin = camera.position.clone();
  drawTracer(origin, origin.clone().addScaledVector(direction, weapon.range * 1.45), 0x8efbff);
  getDamageCandidates().forEach((target) => {
    const targetPos = getTargetCenter(target);
    const toTarget = targetPos.clone().sub(origin);
    const forwardDistance = toTarget.dot(direction);
    if (forwardDistance < 0 || forwardDistance > weapon.range * 1.45) return;
    const miss = targetPos.distanceTo(origin.clone().addScaledVector(direction, forwardDistance));
    const hitRadius = target.range ? target.group.userData.size * 0.75 : 0.9;
    if (miss <= hitRadius) damageTarget(target, weapon.damage * damageMultiplier, targetPos, { ...weapon, name: label });
  });
  flashWeapon(weapon);
  showToast(label);
}

function launchSuperProjectile(weapon, kind, label) {
  launchProjectile({ ...weapon, name: label }, kind);
  showToast(label);
}

function deploySuperJumpPad(weapon) {
  deployJumpPad();
  player.velocity.y = Math.max(player.velocity.y, 16);
  player.onGround = false;
  superExplosionAt(player.position.clone(), 11, 54, { ...weapon, name: "Launch Shockwave" }, 0x25f0d0);
  showToast("Launch Shockwave");
}

function chainLightning(weapon) {
  const origin = camera.position.clone();
  const direction = getAimDirection(weapon.spread * 0.25);
  const targets = getDamageCandidates()
    .map((target) => {
      const targetPos = getTargetCenter(target);
      const toTarget = targetPos.clone().sub(origin);
      const forwardDistance = toTarget.dot(direction);
      const miss = targetPos.distanceTo(origin.clone().addScaledVector(direction, forwardDistance));
      return { target, targetPos, forwardDistance, miss };
    })
    .filter((item) => item.forwardDistance > 0 && item.forwardDistance < weapon.range * 1.3 && item.miss < (item.target.range ? item.target.group.userData.size : 1.4))
    .sort((a, b) => a.forwardDistance - b.forwardDistance)
    .slice(0, 5);

  let previous = origin;
  targets.forEach((item, index) => {
    drawTracer(previous, item.targetPos, 0x5be0ff);
    damageTarget(item.target, weapon.damage * (2.3 - index * 0.25), item.targetPos, { ...weapon, name: "Chain Lightning" });
    previous = item.targetPos;
  });
  if (targets.length === 0) drawTracer(origin, origin.clone().addScaledVector(direction, weapon.range), 0x5be0ff);
  showToast("Chain Lightning");
}

function superConeDamage(weapon, damage, range, coneWidth, label) {
  const direction = getAimDirection(weapon.spread * 0.35);
  for (let i = 0; i < 28; i++) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.12, 0.32), 10, 8), materials.flame);
    const spray = direction.clone().add(new THREE.Vector3(THREE.MathUtils.randFloatSpread(0.26), THREE.MathUtils.randFloatSpread(0.12), THREE.MathUtils.randFloatSpread(0.26))).normalize();
    flame.position.copy(camera.position).addScaledVector(spray, 1.3);
    flame.userData.velocity = spray.multiplyScalar(THREE.MathUtils.randFloat(24, 38));
    flame.userData.life = THREE.MathUtils.randFloat(0.45, 0.78);
    scene.add(flame);
    particles.push(flame);
  }
  getDamageCandidates().forEach((target) => {
    const targetPos = getTargetCenter(target);
    const toTarget = targetPos.clone().sub(camera.position);
    const distance = toTarget.length();
    const angle = toTarget.normalize().dot(direction);
    if (distance < range && angle > coneWidth) damageTarget(target, damage * (1 - distance / (range * 1.35)), targetPos, { ...weapon, name: label });
  });
  showToast(label);
}

function superExplosionAt(point, radius, damage, weapon, color = 0xff7a36) {
  for (let i = 0; i < 26; i++) addImpact(point.clone().add(new THREE.Vector3(THREE.MathUtils.randFloatSpread(radius * 0.45), THREE.MathUtils.randFloat(0, 3), THREE.MathUtils.randFloatSpread(radius * 0.45))), color);
  getDamageCandidates().forEach((target) => {
    const targetPos = getTargetCenter(target);
    const distance = targetPos.distanceTo(point);
    if (distance < radius) damageTarget(target, Math.max(8, damage * (1 - distance / radius)), targetPos, weapon);
  });
  playSound("explode");
}

function getSuperName(weapon) {
  const names = {
    "Vanguard AR": "Vanguard Barrage",
    Longwatch: "Rail Shot",
    "Pebble Sling": "Pebble Meteor",
    "Tri-Burst": "Overclock Burst",
    "Frag Grenade": "Cluster Grenade",
    "Jump Pad": "Launch Shockwave",
    "Ranger Bow": "Arrow Rain",
    "Steel Crossbow": "Skewer Bolt",
    "Volt Lance": "Chain Lightning",
    "Pulse Pistol": "Pulse Fan",
    "Ember Hose": "Inferno Sweep",
    "Storm LMG": "Storm Suppression"
  };
  return names[weapon.name] || `${weapon.name} Super`;
}

function getAimDirection(spread) {
  const direction = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(spread),
    THREE.MathUtils.randFloatSpread(spread),
    -1
  ).normalize();
  return direction.applyEuler(camera.rotation).normalize();
}

function getDamageCandidates() {
  if (player.mode === "range") return rangeTargets.map((target) => ({ group: target, range: true }));
  return enemies;
}

function getTargetCenter(target) {
  return target.group.position.clone().add(new THREE.Vector3(0, target.range ? 0 : 1.05, 0));
}

function unlockAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playSound(kind) {
  if (!audioContext) return;
  const soundMap = {
    hitscan: () => playTone(130, 0.045, "square", 0.08, 0.55),
    burst: () => playTone(170, 0.035, "square", 0.06, 0.35),
    energy: () => playTone(520, 0.07, "sawtooth", 0.055, 1.8),
    arc: () => playTone(220, 0.08, "triangle", 0.05, -0.8),
    arrow: () => playTone(310, 0.055, "triangle", 0.04, -1.1),
    bolt: () => playTone(260, 0.05, "square", 0.05, -0.7),
    grenade: () => playTone(115, 0.12, "triangle", 0.06, -0.35),
    flame: () => playNoise(0.11, 0.07, 940),
    pad: () => playTone(360, 0.12, "sine", 0.06, 1.1),
    shotgun: () => playNoise(0.09, 0.12, 650),
    melee: () => playTone(180, 0.05, "sawtooth", 0.05, -0.5),
    shield: () => playTone(140, 0.06, "square", 0.05, -0.3),
    c4: () => playTone(200, 0.05, "triangle", 0.04, -0.2),
    explode: () => playNoise(0.45, 0.18, 170),
    hit: () => playTone(95, 0.035, "square", 0.035, -0.2),
    kill: () => {
      playTone(420, 0.08, "triangle", 0.035, 0.6);
      setTimeout(() => playTone(620, 0.08, "triangle", 0.03, 0.4), 70);
    }
  };
  soundMap[kind]?.();
}

function playTone(frequency, duration, type, volume, pitchSweep = 0) {
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (pitchSweep !== 0) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 2 ** pitchSweep), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playNoise(duration, volume, filterFrequency) {
  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

  const now = audioContext.currentTime;
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterFrequency, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFrequency * 0.35), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start(now);
  source.stop(now + duration);
}

function damageTarget(target, amount, point, weapon) {
  if (target.team === "ally") return;
  addImpact(point, weapon.type?.includes("Energy") ? 0x5be0ff : 0xffd36e);
  const now = performance.now();
  if (now - lastHitSound > 55) {
    lastHitSound = now;
    playSound("hit");
  }

  if (target.range) {
    const size = target.group.userData.size || 1;
    target.group.userData.health = (target.group.userData.health || 100) - amount;
    const decal = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), materials.hit);
    decal.position.copy(target.group.worldToLocal(point.clone()));
    decal.position.z = 0.08;
    target.group.add(decal);
    if (target.group.userData.health <= 0) {
      target.group.userData.health = 100;
      target.group.position.y = 0.25;
      setTimeout(() => {
        target.group.position.y = 2.05;
        target.group.children
          .filter((child) => child.geometry?.type === "CircleGeometry")
          .forEach((child) => child.removeFromParent());
      }, 800);
    }
    player.coins += Math.max(1, Math.round(size * 2));
    return;
  }

  target.health -= amount;
  target.group.rotation.z += THREE.MathUtils.randFloatSpread(0.08);
  if (target.health <= 0) killEnemy(target);
}

function killEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index >= 0) enemies.splice(index, 1);
  enemy.label?.remove();
  enemy.group.removeFromParent();
  player.kills += 1;
  player.coins += enemy.reward;
  player.ability = Math.min(100, player.ability + 34);
  blueScore += 1;
  playSound("kill");
  showToast(`Enemy down +${enemy.reward} coins`);
  if (player.mode !== "range") spawnEnemy("enemy");
}

function updateNameTags() {
  enemies.forEach((enemy) => {
    if (!enemy.label) return;
    const tagPosition = enemy.group.position.clone().add(new THREE.Vector3(0, 3.05, 0));
    const screen = tagPosition.project(camera);
    const visible = screen.z < 1 && Math.abs(screen.x) < 1.18 && Math.abs(screen.y) < 1.18;
    enemy.label.style.display = visible ? "block" : "none";
    if (!visible) return;
    enemy.label.style.left = `${(screen.x * 0.5 + 0.5) * window.innerWidth}px`;
    enemy.label.style.top = `${(-screen.y * 0.5 + 0.5) * window.innerHeight}px`;
  });
}

function addImpact(point, color) {
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color }));
  spark.position.copy(point);
  spark.userData.life = 0.35;
  spark.userData.velocity = new THREE.Vector3(THREE.MathUtils.randFloatSpread(2), THREE.MathUtils.randFloat(1, 4), THREE.MathUtils.randFloatSpread(2));
  scene.add(spark);
  particles.push(spark);
}

function drawTracer(start, end, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82 }));
  line.userData.life = 0.08;
  scene.add(line);
  particles.push(line);
}

function flashWeapon(weapon) {
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(weapon.fire === "flame" ? 0.28 : 0.16, weapon.fire === "flame" ? 0.85 : 0.42, 16),
    new THREE.MeshBasicMaterial({ color: weapon.type.includes("Energy") ? 0x5be0ff : 0xffa451, transparent: true, opacity: 0.78 })
  );
  flash.rotation.x = -Math.PI * 0.5;
  flash.position.set(0, 0.05, -2.28);
  weaponRoot.add(flash);
  setTimeout(() => flash.removeFromParent(), 46);

  const light = weaponRoot.getObjectByName("muzzleLight");
  if (light) light.intensity = weapon.type.includes("Energy") ? 55 : 42;
}

function createCasing() {
  const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 14), materials.brass);
  casing.rotation.z = Math.PI * 0.5;
  casing.position.copy(camera.position).add(new THREE.Vector3(0.55, -0.24, -0.5).applyEuler(camera.rotation));
  casing.userData.velocity = new THREE.Vector3(THREE.MathUtils.randFloat(1.2, 2.6), THREE.MathUtils.randFloat(0.6, 1.8), THREE.MathUtils.randFloat(-0.3, 0.5)).applyEuler(camera.rotation);
  scene.add(casing);
  casings.push(casing);
  if (casings.length > 36) casings.shift().removeFromParent();
}

function reloadWeapon() {
  const weapon = weapons[activeWeaponId];
  if (isReloading || weapon.currentAmmo === weapon.ammo) return;
  isReloading = true;
  ui.status.textContent = "Reloading";
  weaponRoot.rotation.z = 0.32;
  setTimeout(() => {
    weapon.currentAmmo = weapon.ammo;
    isReloading = false;
    weaponRoot.rotation.z = 0;
    ui.status.textContent = "Ready";
    updateUI();
  }, weapon.type === "Heavy Rifle" ? 1650 : 920);
}

function equipSlot(slot) {
  if (!player.slots[slot] && player.slots[slot] !== 0) return;
  player.activeSlot = slot;
  activeWeaponId = player.slots[slot];
  selectedListWeapon = activeWeaponId;
  buildWeapon(weapons[activeWeaponId]);
  updateUI();
  showToast(`${slot + 1}: ${weapons[activeWeaponId].name}`);
}

function buySelectedWeapon() {
  const weapon = weapons[selectedListWeapon];
  if (weapon.owned) {
    assignToCurrentSlot(weapon.id);
    return;
  }
  if (player.coins < weapon.cost) {
    showToast(`Need ${weapon.cost - player.coins} more coins`);
    return;
  }
  player.coins -= weapon.cost;
  weapon.owned = true;
  assignToCurrentSlot(weapon.id);
  showToast(`${weapon.name} unlocked`);
}

function assignToCurrentSlot(weaponId) {
  player.slots[player.activeSlot] = weaponId;
  activeWeaponId = weaponId;
  buildWeapon(weapons[weaponId]);
  buildSlots();
  buildWeaponList();
  updateUI();
}

function buildWeaponList() {
  ui.weaponList.innerHTML = "";
  weapons.forEach((weapon) => {
    const button = document.createElement("button");
    button.className = `weapon-card${weapon.id === selectedListWeapon ? " active" : ""}${weapon.owned ? "" : " locked"}`;
    button.innerHTML = `<strong>${weapon.name}</strong><span>${weapon.type} ${weapon.owned ? "Owned" : `${weapon.cost} coins`}</span>`;
    button.addEventListener("click", () => {
      selectedListWeapon = weapon.id;
      buildWeaponList();
      updateUI();
    });
    ui.weaponList.append(button);
  });
}

function buildSlots() {
  ui.slots.innerHTML = "";
  player.slots.forEach((weaponId, index) => {
    const button = document.createElement("button");
    button.className = `slot${index === player.activeSlot ? " active" : ""}`;
    button.textContent = `${index + 1} ${weapons[weaponId].type}`;
    button.addEventListener("click", () => equipSlot(index));
    ui.slots.append(button);
  });
}

function updateMovement(delta) {
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const move = new THREE.Vector3();
  if (keys.has("w")) move.add(forward);
  if (keys.has("s")) move.sub(forward);
  if (keys.has("d")) move.add(right);
  if (keys.has("a")) move.sub(right);
  if (move.lengthSq() > 0) move.normalize();

  if (player.slideCooldown > 0) player.slideCooldown -= delta;

  if (player.sliding) {
    player.slideTimer -= delta;
    const slideProgress = Math.max(player.slideTimer / SLIDE_DURATION, 0);
    const slideSpeed = THREE.MathUtils.lerp(8.2, 15.5, slideProgress);
    player.velocity.x = THREE.MathUtils.damp(player.velocity.x, player.slideDir.x * slideSpeed, 14, delta);
    player.velocity.z = THREE.MathUtils.damp(player.velocity.z, player.slideDir.z * slideSpeed, 14, delta);
    if (player.slideTimer <= 0 || !player.onGround) endSlide();
  } else {
    const speed = player.aiming ? 5.1 : 8.2;
    player.velocity.x = THREE.MathUtils.damp(player.velocity.x, move.x * speed, 12, delta);
    player.velocity.z = THREE.MathUtils.damp(player.velocity.z, move.z * speed, 12, delta);
  }
  player.velocity.y -= 22 * delta;
  player.position.addScaledVector(player.velocity, delta);

  if (player.position.y <= player.height) {
    player.position.y = player.height;
    player.velocity.y = 0;
    player.onGround = true;
  }

  player.position.x = THREE.MathUtils.clamp(player.position.x, -54, 54);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -54, player.mode === "range" ? 12 : 54);
  resolveColliders();

  player.slideVisual = THREE.MathUtils.damp(player.slideVisual, player.sliding ? SLIDE_DIP : 0, 10, delta);

  camera.position.copy(player.position);
  camera.position.y -= player.slideVisual;
  camera.rotation.y = player.yaw + recoilYaw;
  camera.rotation.x = player.pitch + recoilPitch;
  const scoped = player.aiming && weapons[activeWeaponId].zoom;
  camera.fov = THREE.MathUtils.damp(camera.fov, scoped ? 28 : player.aiming ? 48 : 68, 10, delta);
  camera.updateProjectionMatrix();
}

function resolveColliders() {
  if (player.mode === "range") return;
  colliders.forEach((box) => {
    const dx = player.position.x - box.x;
    const dz = player.position.z - box.z;
    if (Math.abs(dx) < box.halfX && Math.abs(dz) < box.halfZ) {
      const pushX = box.halfX - Math.abs(dx);
      const pushZ = box.halfZ - Math.abs(dz);
      if (pushX < pushZ) {
        player.position.x += Math.sign(dx || 1) * pushX;
        player.velocity.x = 0;
      } else {
        player.position.z += Math.sign(dz || 1) * pushZ;
        player.velocity.z = 0;
      }
    }
  });
}

function updateEnemies(delta) {
  if (player.mode === "range") return;
  enemySpawnTimer -= delta;
  if (enemySpawnTimer <= 0 && enemies.length < (player.mode === "ffa" ? 12 : 9)) {
    spawnEnemy();
    enemySpawnTimer = 3.4;
  }

  enemies.forEach((enemy) => {
    const toPlayer = player.position.clone().sub(enemy.group.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const direction = toPlayer.normalize();
    const strafe = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(enemy.strafe);
    const desired = enemy.team === "enemy" ? (distance > 12 ? direction : strafe) : strafe;

    enemy.slideCooldown -= delta;
    if (enemy.sliding) {
      enemy.slideTimer -= delta;
      if (enemy.slideTimer <= 0) {
        enemy.sliding = false;
        enemy.slideCooldown = THREE.MathUtils.randFloat(3, 6);
      }
    } else if (enemy.slideCooldown <= 0 && distance > 6 && distance < 40) {
      enemy.sliding = true;
      enemy.slideTimer = 0.45;
      enemy.slideDir.copy(desired);
    }

    const moveDir = enemy.sliding ? enemy.slideDir : desired;
    const slideMultiplier = enemy.sliding ? 2.3 : 1;

    if (enemy.team === "enemy") {
      enemy.group.position.addScaledVector(moveDir, enemy.speed * slideMultiplier * delta);
      enemy.group.lookAt(player.position.x, enemy.group.position.y, player.position.z);
      enemy.shootTimer -= delta;
      if (enemy.shootTimer <= 0 && distance < 32) {
        enemy.shootTimer = THREE.MathUtils.randFloat(1.8, 3.2);
        const rawDamage = THREE.MathUtils.randInt(2, 5);
        const heldWeapon = weapons[activeWeaponId];
        const blocking = heldWeapon.fire === "shield" && player.aiming;
        const damage = blocking ? rawDamage * (1 - heldWeapon.block) : rawDamage;
        const armorHit = Math.min(player.armor, damage);
        player.armor -= armorHit;
        player.health = Math.max(0, player.health - (damage - armorHit));
        if (damage > 0) redScore += Math.random() > 0.82 ? 1 : 0;
        const muzzleWorld = enemy.group.localToWorld(new THREE.Vector3(0.3, 1.39, 1.32));
        const aimPoint = player.position.clone().add(new THREE.Vector3(THREE.MathUtils.randFloatSpread(0.5), THREE.MathUtils.randFloatSpread(0.5) - 0.25, THREE.MathUtils.randFloatSpread(0.5)));
        drawTracer(muzzleWorld, aimPoint, 0xff6a4e);
        addImpact(player.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 0xff5b4e);
        if (player.health <= 0) respawnPlayer();
      }
    } else {
      enemy.group.position.addScaledVector(moveDir, enemy.speed * 0.55 * slideMultiplier * delta);
      enemy.group.lookAt(enemy.group.position.x + moveDir.x, enemy.group.position.y, enemy.group.position.z + moveDir.z);
    }

    enemy.group.position.y = 0;
    animateWalk(enemy, delta);
  });
}

function animateWalk(enemy, delta) {
  const limbs = enemy.limbs;
  if (!limbs) return;

  if (enemy.sliding) {
    limbs.leftHip.rotation.x = THREE.MathUtils.damp(limbs.leftHip.rotation.x, -1.0, 12, delta);
    limbs.rightHip.rotation.x = THREE.MathUtils.damp(limbs.rightHip.rotation.x, -1.0, 12, delta);
    limbs.leftShoulder.rotation.x = THREE.MathUtils.damp(limbs.leftShoulder.rotation.x, 0.55, 12, delta);
    limbs.rightShoulder.rotation.x = THREE.MathUtils.damp(limbs.rightShoulder.rotation.x, 0.55, 12, delta);
    limbs.body.position.y = THREE.MathUtils.damp(limbs.body.position.y, 0.92, 12, delta);
    return;
  }

  enemy.walkPhase += delta * enemy.speed * 2.4;
  const swing = Math.sin(enemy.walkPhase) * 0.65;
  limbs.leftHip.rotation.x = swing;
  limbs.rightHip.rotation.x = -swing;
  limbs.leftShoulder.rotation.x = -swing * 0.7;
  limbs.rightShoulder.rotation.x = swing * 0.7;
  limbs.body.position.y = 1.25 + Math.abs(Math.sin(enemy.walkPhase)) * 0.05;
}

function respawnPlayer() {
  player.health = 100;
  player.armor = 100;
  player.position.set(0, player.height, 18);
  player.velocity.set(0, 0, 0);
  player.coins = Math.max(0, player.coins - 25);
  player.sliding = false;
  player.slideTimer = 0;
  player.slideVisual = 0;
  showToast("Respawned. Lost 25 coins.");
}

function updateProjectiles(delta) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    const data = projectile.userData;
    data.life -= delta;
    data.velocity.y -= data.gravity * delta;
    projectile.position.addScaledVector(data.velocity, delta);
    projectile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), data.velocity.clone().normalize());

    const candidates = getDamageCandidates();
    const hit = candidates.find((target) => projectile.position.distanceTo(getTargetCenter(target)) < (target.range ? target.group.userData.size * 0.7 : 0.85));
    if (hit) {
      if (data.kind === "grenade") explode(projectile.position, data.weapon);
      else damageTarget(hit, data.weapon.damage, projectile.position.clone(), data.weapon);
      projectile.removeFromParent();
      projectiles.splice(i, 1);
      continue;
    }

    if (projectile.position.y <= 0.12 || data.life <= 0) {
      if (data.kind === "grenade") explode(projectile.position, data.weapon);
      projectile.removeFromParent();
      projectiles.splice(i, 1);
    }
  }
}

function explode(point, weapon) {
  playSound("explode");
  for (let i = 0; i < 18; i++) addImpact(point.clone().add(new THREE.Vector3(THREE.MathUtils.randFloatSpread(2), THREE.MathUtils.randFloat(0, 2), THREE.MathUtils.randFloatSpread(2))), 0xff7a36);
  const radius = 8.5;
  getDamageCandidates().forEach((target) => {
    const targetPos = getTargetCenter(target);
    const distance = targetPos.distanceTo(point);
    if (distance < radius) damageTarget(target, Math.max(12, weapon.damage * (1 - distance / radius)), targetPos, weapon);
  });
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.userData.life -= delta;
    if (particle.userData.velocity) {
      particle.userData.velocity.y -= 6.5 * delta;
      particle.position.addScaledVector(particle.userData.velocity, delta);
    }
    if (particle.material?.opacity !== undefined) particle.material.opacity = Math.max(0, particle.userData.life * 2);
    if (particle.userData.kind === "pad") {
      const flatDistance = new THREE.Vector2(player.position.x - particle.position.x, player.position.z - particle.position.z).length();
      if (flatDistance < 1.6 && player.position.y < 2.2) {
        player.velocity.y = 14;
        player.onGround = false;
      }
    }
    if (particle.userData.life <= 0) {
      particle.removeFromParent();
      particles.splice(i, 1);
    }
  }

  casings.forEach((casing) => {
    casing.userData.velocity.y -= 7.8 * delta;
    casing.position.addScaledVector(casing.userData.velocity, delta);
    casing.rotation.x += delta * 9;
    casing.rotation.y += delta * 13;
    if (casing.position.y < 0.06) {
      casing.position.y = 0.06;
      casing.userData.velocity.multiplyScalar(0.18);
    }
  });
}

function updateWeaponView(delta) {
  const weapon = weapons[activeWeaponId];
  sway += delta;
  recoilPitch = THREE.MathUtils.damp(recoilPitch, 0, 7, delta);
  recoilYaw = THREE.MathUtils.damp(recoilYaw, 0, 7, delta);

  const aimed = player.aiming && weapon.zoom;
  weaponRoot.visible = !aimed;
  const targetX = aimed ? 0.16 : 0.62;
  const targetY = aimed ? -0.5 : -0.58;
  const targetZ = aimed ? -1.05 : -1.3;
  weaponRoot.position.x = THREE.MathUtils.damp(weaponRoot.position.x, targetX + Math.sin(sway * 1.6) * 0.01, 8, delta);
  weaponRoot.position.y = THREE.MathUtils.damp(weaponRoot.position.y, targetY + Math.sin(sway * 2.3) * 0.007, 8, delta);
  weaponRoot.position.z = THREE.MathUtils.damp(weaponRoot.position.z, targetZ, 12, delta);
  weaponRoot.rotation.x = THREE.MathUtils.damp(weaponRoot.rotation.x, -0.05, 10, delta);
  weaponRoot.rotation.y = THREE.MathUtils.damp(weaponRoot.rotation.y, aimed ? -0.03 : -0.16, 10, delta);

  const light = weaponRoot.getObjectByName("muzzleLight");
  if (light) light.intensity = THREE.MathUtils.damp(light.intensity, 0, 18, delta);
  updateScopeOverlay(aimed);
}

function updateScopeOverlay(visible) {
  ui.scopeOverlay.classList.toggle("visible", visible);
  document.body.classList.toggle("scope-active", visible);
}

function updateRangeTargets(delta) {
  rangeTargets.forEach((target) => {
    target.position.x = target.userData.baseX + Math.sin(clock.elapsedTime * (0.35 + target.userData.rowIndex * 0.08) + target.userData.baseX) * 0.18;
  });
}

function updateBurst(delta) {
  if (pendingBurst <= 0) return;
  burstTimer -= delta;
  if (burstTimer <= 0) {
    pendingBurst -= 1;
    burstTimer = 0.06;
    shootHitscan(weapons[activeWeaponId]);
  }
}

function updateUI() {
  const weapon = weapons[activeWeaponId];
  const selected = weapons[selectedListWeapon];
  ui.coins.textContent = `Coins ${player.coins}`;
  ui.kills.textContent = `Kills ${player.kills}`;
  ui.modeLabel.textContent = modes[player.mode];
  ui.health.textContent = player.health;
  ui.healthMini.textContent = player.health;
  ui.armor.textContent = player.armor;
  ui.blueScore.textContent = blueScore;
  ui.redScore.textContent = redScore;
  ui.roundTimer.textContent = formatTime(roundTime);
  ui.ability.textContent = player.ability >= 100 ? getSuperName(weapon) : `${Math.round(player.ability)}%`;
  ui.weaponClass.textContent = weapon.type;
  ui.weaponName.textContent = weapon.name;
  ui.ammoNow.textContent = weapon.currentAmmo;
  ui.ammoMax.textContent = weapon.ammo;
  ui.statDamage.textContent = selected.damage;
  ui.statRate.textContent = `${selected.rpm} rpm`;
  ui.statRange.textContent = `${selected.range} m`;
  ui.statCost.textContent = selected.owned ? "Owned" : `${selected.cost} coins`;
  ui.buyWeapon.textContent = selected.owned ? "Equip" : "Buy";
  [...ui.weaponList.children].forEach((child, index) => child.classList.toggle("active", index === selectedListWeapon));
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const rest = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => ui.toast.classList.remove("visible"), 1700);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);

  if (mouseDown) fireWeapon();
  roundTime -= delta;
  if (roundTime <= 0) {
    roundTime = 120;
    blueScore = 0;
    redScore = 0;
    showToast("New round started");
  }
  player.ability = Math.min(100, player.ability + delta * 4.5);
  updateMovement(delta);
  updateEnemies(delta);
  updateProjectiles(delta);
  updateParticles(delta);
  updateWeaponView(delta);
  updateRangeTargets(delta);
  updateBurst(delta);
  updateNameTags();
  uiTimer -= delta;
  if (uiTimer <= 0) {
    uiTimer = 0.12;
    updateUI();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
