// FRONTLINE — Armory UI: shop + loadout editor (R-LDO, R-ECO-4, R-PRG)
import { GUNS, UTILS, ATTACHMENTS, ARMOR, SLOT_LABELS, MAX_GUN_LEVEL, gunLevelCost, gunStats,
         roleCanUse, gunPerks, GUN_LEVEL_PERKS,
         RANKS, SKINS, SKIN_KEYS, RARITY } from "./data.js";
import * as P from "./profile.js";

const profile = P.profile;
let selectedGun = "rifle";   // gun being customized in the Upgrade tab
let tab = "loadout";
let notify = () => {};

export function initShop(onToast) {
  notify = onToast || (() => {});
  document.getElementById("armoryBtn").addEventListener("click", openArmory);
  document.getElementById("armoryClose").addEventListener("click", closeArmory);
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.addEventListener("click", () => { tab = b.dataset.tab; render(); })
  );
  document.getElementById("cloudToggle").addEventListener("click", () => {
    P.setCloud(!profile.cloud);
    notify(profile.cloud
      ? "Cloud sync ON — online accounts arrive in Phase 7 (saved locally for now)"
      : "Cloud sync OFF — progress saves on this device");
    render();
  });
  renderHeader();
}

function openArmory() { document.getElementById("armory").classList.remove("hidden"); render(); }
function closeArmory() { document.getElementById("armory").classList.add("hidden"); }
export function isArmoryOpen() { return !document.getElementById("armory").classList.contains("hidden"); }

// ---------- header (coins + level) ----------
export function renderHeader() {
  const lp = P.levelProgress();
  document.getElementById("menuCoins").textContent = profile.coins;
  const mirror = document.getElementById("armoryCoinsMirror");
  if (mirror) mirror.textContent = profile.coins;
  document.getElementById("menuLevel").textContent = "Lv " + lp.level;
  document.getElementById("menuXpFill").style.width = (lp.into / lp.need * 100).toFixed(1) + "%";
  document.getElementById("menuXpText").textContent = `${lp.into} / ${lp.need} XP`;
  const st = document.getElementById("menuStreak");
  if (st) st.textContent = profile.stats.streak;

  // ranked badge + RR progress (R-RNK-1)
  const ri = P.rankInfo();
  const badge = document.getElementById("menuRankBadge");
  if (badge) {
    badge.style.background = ri.rank.color;
    badge.style.boxShadow = `0 0 14px ${ri.rank.color}88`;
    document.getElementById("menuRankTier").textContent =
      ri.rank.tier === "Ultra" ? "★" : ri.rank.tier[0];
    document.getElementById("menuRankName").textContent = ri.rank.name;
    document.getElementById("menuRrText").textContent =
      ri.next ? `${ri.into} / ${ri.need} RR` : `${profile.rr} RR — MAX`;
    document.getElementById("menuRrFill").style.width = ri.pct + "%";
    document.getElementById("menuProtect").classList.toggle("hidden", !P.protectedPlayer());
  }
}

function act(result) {
  notify(result.msg);
  if (result.ok) { renderHeader(); render(); }
}

// ---------- main render ----------
function render() {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const el = document.getElementById("armoryBody");
  renderHeader();
  document.getElementById("cloudToggle").textContent = profile.cloud ? "☁ Cloud sync: ON" : "☁ Cloud sync: OFF";

  if (tab === "loadout") el.innerHTML = renderLoadout();
  else if (tab === "guns") el.innerHTML = renderGuns();
  else if (tab === "utils") el.innerHTML = renderUtils();
  else if (tab === "upgrade") el.innerHTML = renderUpgrade();
  else if (tab === "armor") el.innerHTML = renderArmor();
  else if (tab === "skins") el.innerHTML = renderSkins();
  else if (tab === "career") el.innerHTML = renderCareer();

  wire(el);
}

function wire(el) {
  el.querySelectorAll("[data-buy-gun]").forEach(b => b.onclick = () => act(P.buyGun(b.dataset.buyGun)));
  el.querySelectorAll("[data-buy-util]").forEach(b => b.onclick = () => act(P.buyUtil(b.dataset.buyUtil)));
  el.querySelectorAll("[data-buy-armor]").forEach(b => b.onclick = () => act(P.buyArmor(b.dataset.buyArmor)));
  el.querySelectorAll("[data-equip-armor]").forEach(b => b.onclick = () => act(P.equipArmor(b.dataset.equipArmor)));
  el.querySelectorAll("[data-equip]").forEach(b => b.onclick = () =>
    act(P.setLoadoutSlot(Number(b.dataset.slot), b.dataset.equip)));
  el.querySelectorAll("[data-pick-gun]").forEach(b => b.onclick = () => { selectedGun = b.dataset.pickGun; render(); });
  el.querySelectorAll("[data-lvlup]").forEach(b => b.onclick = () => act(P.buyGunLevel(b.dataset.lvlup)));
  el.querySelectorAll("[data-buy-att]").forEach(b => b.onclick = () =>
    act(P.buyAttachment(b.dataset.gun, b.dataset.buyAtt)));
  el.querySelectorAll("[data-tog-att]").forEach(b => b.onclick = () =>
    act(P.toggleAttachment(b.dataset.gun, b.dataset.togAtt)));
  el.querySelectorAll("[data-skin]").forEach(b => b.onclick = () => act(P.equipSkin(b.dataset.skin)));
}

// ---------- LOADOUT tab (R-LDO-1/2/3) ----------
function renderLoadout() {
  let h = `<p class="note">Pick 4 items. Changes apply when you respawn.</p>`;
  for (let slot = 0; slot < 4; slot++) {
    const cur = profile.loadout[slot];
    const curName = slot === 3 ? UTILS[cur]?.name : GUNS[cur]?.name;
    h += `<div class="slot-block">
      <div class="slot-head"><b>${slot + 1}. ${SLOT_LABELS[slot]}</b><span>${curName || "—"}</span></div>
      <div class="chip-row">`;
    if (slot === 3) {
      for (const k of profile.ownedUtils) {
        h += chip(UTILS[k].name, cur === k, `data-equip="${k}" data-slot="3"`);
      }
    } else {
      const role = profile.role || "rusher";
      const opts = profile.ownedGuns.filter(k => GUNS[k].slot === slot);
      const usable = opts.filter(k => roleCanUse(k, role));
      const locked = opts.filter(k => !roleCanUse(k, role));
      for (const k of usable) {
        const lv = P.gunLevel(k);
        h += chip(GUNS[k].name + (lv > 1 ? ` <i>Lv${lv}</i>` : ""), cur === k, `data-equip="${k}" data-slot="${slot}"`);
      }
      // owned but wrong role — shown greyed out so you know why it's missing (R-GUN-5)
      for (const k of locked) {
        h += `<button class="chip locked" disabled title="${GUNS[k].roles.join(" / ")} only">${GUNS[k].name} 🔒</button>`;
      }
    }
    h += `</div></div>`;
  }
  const a = ARMOR[profile.armor];
  h += `<div class="slot-block"><div class="slot-head"><b>Armor</b><span>${a.name}${a.value ? " +" + a.value : ""}</span></div></div>`;
  return h;
}

const chip = (label, active, attrs) =>
  `<button class="chip ${active ? "on" : ""}" ${attrs}>${label}</button>`;

// ---------- GUNS shop ----------
function renderGuns() {
  let h = "";
  for (const slot of [0, 1, 2]) {
    h += `<h4 class="group">${SLOT_LABELS[slot]}</h4><div class="cards">`;
    for (const [k, g] of Object.entries(GUNS)) {
      if (g.slot !== slot) continue;
      const owned = P.ownsGun(k);
      const s = gunStats(k, profile);
      h += `<div class="card ${owned ? "owned" : ""}">
        <div class="card-top"><b>${g.name}</b>${owned ? `<span class="tag">OWNED</span>` : `<span class="price">${g.cost}</span>`}</div>
        <div class="stats">
          <span>DMG <b>${s.dmg.toFixed(0)}</b></span>
          <span>RPM <b>${g.rpm}</b></span>
          <span>MAG <b>${g.melee ? "—" : s.mag}</b></span>
        </div>
        <div class="role-tag">${g.roles ? g.roles.join(" · ") : "any role"}${g.alt ? " · alt fire" : ""}</div>
        ${owned ? `<button class="mini" data-equip="${k}" data-slot="${slot}">Equip</button>`
                : `<button class="mini buy" data-buy-gun="${k}">Buy</button>`}
      </div>`;
    }
    h += `</div>`;
  }
  return h;
}

// ---------- UTILITIES shop (slot 4) ----------
function renderUtils() {
  let h = `<p class="note">Slot 4 throwables & gadgets — ${Math.round(30)}s cooldown between uses.</p><div class="cards">`;
  for (const [k, u] of Object.entries(UTILS)) {
    const owned = P.ownsUtil(k);
    const locked = u.level && P.level() < u.level;
    h += `<div class="card ${owned ? "owned" : ""} ${locked ? "locked" : ""}">
      <div class="card-top"><b>${u.name}</b>${owned ? `<span class="tag">OWNED</span>` : `<span class="price">${u.cost}</span>`}</div>
      <div class="stats">
        ${u.dmg ? `<span>DMG <b>${u.dmg}</b></span>` : ""}
        ${u.heal ? `<span>HEAL <b>${u.heal}</b></span>` : ""}
        <span>RADIUS <b>${u.radius}</b></span>
      </div>
      ${owned ? `<button class="mini" data-equip="${k}" data-slot="3">Equip</button>`
        : locked ? `<button class="mini" disabled>Level ${u.level}</button>`
        : `<button class="mini buy" data-buy-util="${k}">Buy</button>`}
    </div>`;
  }
  return h + `</div>`;
}

// ---------- UPGRADE tab: gun levels + attachments ----------
function renderUpgrade() {
  const owned = profile.ownedGuns.filter(k => !GUNS[k].melee);
  if (!owned.includes(selectedGun)) selectedGun = owned[0];
  let h = `<div class="chip-row">`;
  for (const k of owned) h += chip(GUNS[k].name, k === selectedGun, `data-pick-gun="${k}"`);
  h += `</div>`;

  const g = GUNS[selectedGun];
  const s = gunStats(selectedGun, profile);
  const lvl = P.gunLevel(selectedGun);
  const cost = gunLevelCost(lvl);

  h += `<div class="upgrade-head">
    <b>${g.name}</b>
    <span class="lvl">Level ${lvl} / ${MAX_GUN_LEVEL}</span>
  </div>
  <div class="stats big">
    <span>Damage <b>${s.dmg.toFixed(1)}</b></span>
    <span>Recoil <b>${s.kick.toFixed(2)}</b></span>
    <span>Mag <b>${s.mag}</b></span>
  </div>`;

  h += lvl >= MAX_GUN_LEVEL
    ? `<button class="wide" disabled>MAX LEVEL</button>`
    : `<button class="wide buy" data-lvlup="${selectedGun}">Upgrade to Lv${lvl + 1} — ${cost} coins</button>`;

  h += `<h4 class="group">Attachments</h4><div class="cards">`;
  for (const [ak, att] of Object.entries(ATTACHMENTS)) {
    const owns = P.ownsAttachment(selectedGun, ak);
    const on = P.attachmentEquipped(selectedGun, ak);
    const locked = P.level() < att.level;
    h += `<div class="card ${owns ? "owned" : ""} ${locked && !owns ? "locked" : ""}">
      <div class="card-top"><b>${att.name}</b>${owns ? "" : `<span class="price">${att.cost}</span>`}</div>
      <div class="desc">${att.desc}</div>
      ${owns ? `<button class="mini ${on ? "on" : ""}" data-tog-att="${ak}" data-gun="${selectedGun}">${on ? "Equipped" : "Equip"}</button>`
        : locked ? `<button class="mini" disabled>Level ${att.level}</button>`
        : `<button class="mini buy" data-buy-att="${ak}" data-gun="${selectedGun}">Buy</button>`}
    </div>`;
  }
  return h + `</div>`;
}

// ---------- ARMOR shop ----------
function renderArmor() {
  let h = `<p class="note">Armor soaks damage before your health.</p><div class="cards">`;
  for (const [k, a] of Object.entries(ARMOR)) {
    const owned = P.ownsArmor(k);
    const equipped = profile.armor === k;
    const locked = P.level() < a.level;
    h += `<div class="card ${owned ? "owned" : ""} ${locked && !owned ? "locked" : ""}">
      <div class="card-top"><b>${a.name}</b>${owned ? "" : `<span class="price">${a.cost}</span>`}</div>
      <div class="stats"><span>ARMOR <b>${a.value}</b></span></div>
      ${equipped ? `<button class="mini on" disabled>Equipped</button>`
        : owned ? `<button class="mini" data-equip-armor="${k}">Equip</button>`
        : locked ? `<button class="mini" disabled>Level ${a.level}</button>`
        : `<button class="mini buy" data-buy-armor="${k}">Buy</button>`}
    </div>`;
  }
  return h + `</div>`;
}

// ---------- SKINS tab (R-PRG-4: cosmetic only) ----------
function renderSkins() {
  const hex = (c) => "#" + c.toString(16).padStart(6, "0");
  const order = ["mythic", "legendary", "epic", "rare", "common"];
  let h = `<p class="note">Skins are purely cosmetic — they never change a weapon's stats.
           You earn one at every rank-up, plus a few from player levels.</p>`;

  for (const r of order) {
    const keys = SKIN_KEYS.filter(k => SKINS[k].rarity === r);
    if (!keys.length) continue;
    const rar = RARITY[r];
    h += `<h4 class="group" style="color:${rar.color}">${rar.name}</h4><div class="cards">`;
    for (const k of keys) {
      const s = SKINS[k];
      const owned = P.ownsSkin(k);
      const on = profile.skin === k;
      const src = s.from === "start" ? "Starter"
        : s.from.startsWith("rank:") ? `Reach ${RANKS.find(x => x.key === s.from.slice(5))?.name || s.from}`
        : `Player level ${s.from.slice(6)}`;
      h += `<div class="skin-card" style="border-color:${owned ? rar.color + "88" : "rgba(255,255,255,0.1)"}">
        <div class="skin-swatch" style="background:${owned ? hex(s.color) : "#22262c"}"></div>
        <div class="card-top"><b>${owned ? s.name : "???"}</b></div>
        <span class="skin-rarity" style="color:${rar.color}">${rar.name}</span>
        <span class="skin-src">${owned ? "Unlocked" : "🔒 " + src}</span>
        ${on ? `<button class="mini on" disabled>Equipped</button>`
          : owned ? `<button class="mini" data-skin="${k}">Equip</button>`
          : `<button class="mini" disabled>Locked</button>`}
      </div>`;
    }
    h += `</div>`;
  }
  return h;
}

// ---------- CAREER tab (R-RNK-1) ----------
function renderCareer() {
  const ri = P.rankInfo();
  const st = profile.stats;
  const total = st.wins + st.losses;
  const wr = total ? Math.round(st.wins / total * 100) : 0;

  let h = `<div class="stat-grid2">
    <div class="stat-box"><b>${profile.rr}</b><small>Rank Rating</small></div>
    <div class="stat-box"><b>${st.wins}</b><small>Wins</small></div>
    <div class="stat-box"><b>${st.losses}</b><small>Losses</small></div>
    <div class="stat-box"><b>${wr}%</b><small>Win rate</small></div>
    <div class="stat-box"><b>${st.kills}</b><small>Kills</small></div>
    <div class="stat-box"><b>🔥 ${st.streak}</b><small>Win streak</small></div>
    <div class="stat-box"><b>${st.bestStreak || 0}</b><small>Best streak</small></div>
    <div class="stat-box"><b>${profile.ownedSkins.length}/${SKIN_KEYS.length}</b><small>Skins</small></div>
  </div>`;

  if (P.protectedPlayer()) {
    h += `<p class="note" style="color:#6ee87a;margin-top:14px">
      🛡 New-player protection is active — you'll face easier enemies until level 5 / Bronze I.</p>`;
  }
  if (st.streak > 0) {
    h += `<p class="note" style="color:#ffd257;margin-top:6px">
      🔥 On a ${st.streak}-win streak: bonus coins each win, and enemies get tougher. Only a loss resets it.</p>`;
  }

  h += `<h4 class="group">Ladder</h4><div class="ladder">`;
  RANKS.forEach((r, i) => {
    const cls = i === ri.index ? "current" : i < ri.index ? "done" : "";
    h += `<div class="ladder-row ${cls}">
      <span class="ladder-dot" style="background:${r.color}"></span>
      <span>${r.name}</span>
      <span class="rr">${i === ri.index && ri.next ? `${ri.into}/${ri.need} RR` : r.rr + " RR"}</span>
    </div>`;
  });
  return h + `</div>`;
}

export { render as renderArmory };
