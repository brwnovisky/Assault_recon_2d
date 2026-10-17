import { CLASSIC, CLASSIC_META, DT, MOVE_TIME, MOVE_BUDGET, FREEZE_REAL, NAMES, C, readColors } from "./config.js";
import { state, say } from "./state.js";
import { emptyStore, loadStore, persist, setMap, savePlan, saveMatch, restore } from "./storage.js";
import { buildWorld } from "./world.js";
import { pathLen } from "./pathfinding.js";
import { generate } from "./map-generator.js";
import { step } from "./systems/simulation.js";
import { select, setMode, undo, clearPlan, tapTile, hasOrders } from "./systems/planning.js";
import { cycleSpeed, recordReplay, startReplay, stepReplay, toggleReplay, seekReplay, endReplay } from "./systems/replay.js";
import { initRenderer, layout, zoomAt, clampView, drawStatic, draw } from "./systems/render.js";

const $ = id => document.getElementById(id);

function freezeTurn(timeout) {
  state.status = "freeze";
  state.freezeT = FREEZE_REAL;
  state.lastReplay = state.replayFrames.slice();
  for (const o of state.ops) {
    o.lockTo = o.alive && o.res >= 0 ? o.res : -1;
    o.lockFrom = o.lockTo >= 0 ? o.cur : -1;
  }
  say(timeout ? `Tempo esgotado: congelado aos ${MOVE_TIME} s.` : `Turno resolvido em ${state.simTime.toFixed(1).replace(".", ",")} s.`);
}

function toPlan() {
  state.status = "plan";
  state.turn++;
  state.tracers.length = 0;
  for (const o of state.ops) {
    o.path = []; o.acts = []; o.pi = 0; o.aims = []; o.target = null;
    o.holds = []; o.opens = []; o.waiting = false; o.lock = 0; o.planAt = Infinity;
    if (o.alive && o.lockTo >= 0) {
      o.path = [{ x: (o.lockTo % state.W) + .5, y: ((o.lockTo / state.W) | 0) + .5 }];
      o.lock = 1;
    }
  }
  if (!state.ops[state.sel].alive) state.sel = state.ops.findIndex(o => o.alive);
  state.uiDirty = true;
  saveMatch();
}

function finish(win) {
  state.status = "over";
  state.lastReplay = state.replayFrames.slice();
  $("overMsg").textContent = win ? `Área limpa em ${state.turn} ${state.turn > 1 ? "turnos" : "turno"}.` : "Esquadrão perdido.";
  state.uiDirty = true;
  saveMatch();
}

function execute() {
  if (state.status !== "plan" || !hasOrders()) return;
  state.status = "exec";
  state.simTime = 0;
  state.lastShot = -9;
  acc = 0;
  lastT = 0;
  for (const o of state.ops) {
    o.pi = 0; o.stopped = false; o.blocked = false; o.blockedBy = -1;
    for (const h of o.holds) h.done = false;
    for (const q of o.opens) q.done = false;
    if (o.lock && o.lockFrom >= 0 && o.path.length) {
      o.cur = o.lockFrom;
      o.res = ((o.path[0].y | 0) * state.W) + (o.path[0].x | 0);
    } else {
      o.cur = (o.y | 0) * state.W + (o.x | 0);
      o.res = -1;
    }
  }
  state.lastMove = 0;
  state.replayFrames = [];
  recordReplay();
  state.uiDirty = true;
  req();
}

let raf = 0, acc = 0, lastT = 0;
function req() { if (!raf) raf = requestAnimationFrame(frame); }

function frame(t) {
  raf = 0;
  const real = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  if (state.status === "exec") {
    lastT = t;
    acc += real;
    while (acc >= DT && state.status === "exec") {
      step({ finish, freezeTurn });
      recordReplay();
      acc -= DT;
    }
  } else if (state.status === "freeze") {
    lastT = t;
    state.freezeT -= real;
    if (state.freezeT <= 0) { lastT = 0; toPlan(); }
  } else if (state.status === "replay") {
    lastT = t;
    if (!state.replayPaused) {
      acc += real * state.replaySpeed;
      while (acc >= DT && state.status === "replay") {
        stepReplay();
        acc -= DT;
      }
    }
  } else {
    lastT = 0;
  }

  draw();

  const live = state.status === "exec" || state.status === "freeze" || state.status === "replay";
  timeline(live);

  if (state.uiDirty) {
    ui();
    state.uiDirty = false;
    savePlan();
  }
  if (live) req();
}

// Barra de tempo única: progresso da execução ou posição do replay
function timeline(live) {
  const tl = $("timeline"), replay = state.status === "replay", tt = live ? Math.min(state.simTime, MOVE_TIME) : 0;
  const s = tt.toFixed(1).replace(".", ","), max = replay ? state.lastReplay[state.lastReplay.length - 1].simTime : MOVE_TIME;
  tl.max = max;
  tl.value = tt;
  tl.style.setProperty("--p", tt / max);
  ticks(max);
  tl.classList.toggle("frozen", state.status === "freeze");
  $("timeTxt").textContent = !live ? "" : replay ? `Replay: ${s} s` : `${s} s / ${MOVE_TIME} s`;
}

// Marca a cada segundo; rótulos a cada 1, 2, 5 ou 10 s, conforme a largura disponível
let ticksKey = "";
function ticks(max) {
  const el = $("ticks"), px = el.clientWidth / max;
  const step = [1, 2, 5, 10].find(s => px * s >= 30) || 10, key = `${max}|${step}`;
  if (key === ticksKey) return;
  ticksKey = key;
  el.innerHTML = "";
  for (let s = 0; s <= max + 1e-9; s++) {
    const t = document.createElement("i");
    t.style.setProperty("--f", s / max);
    if (s % step === 0) t.dataset.s = s;
    el.appendChild(t);
  }
}

const squad = $("squad");
function buildSquad() {
  squad.innerHTML = "";
  state.ops.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.i = i;
    b.innerHTML = `<span class="nm"><span class="sw"></span>${i + 1} ${NAMES[i]}</span><span class="row"><span class="pips">${"<i></i>".repeat(o.max)}</span><span class="mv"></span></span>`;
    b.addEventListener("click", () => { select(i); req(); });
    squad.appendChild(b);
  });
}

function ui() {
  $("mapname").textContent = state.store.maps[state.mapId].name;
  $("turn").textContent = state.turn;
  $("foes").textContent = `${state.enemies.filter(e => !e.alive).length}/${state.enemies.length}`;
  $("log").textContent = state.lines.join("\n");
  [...squad.children].forEach((b, i) => {
    const o = state.ops[i];
    b.classList.toggle("dead", !o.alive);
    b.style.borderColor = i === state.sel && state.status === "plan" ? C.op[i] : "";
    b.querySelector(".sw").style.background = C.op[i];
    b.querySelector(".pips").style.color = C.op[i];
    b.querySelector(".mv").textContent = state.status === "plan" && o.alive ? `${Math.round(pathLen(o))}/${MOVE_BUDGET}` : "";
    [...b.querySelectorAll(".pips i")].forEach((p, k) => p.classList.toggle("on", k < o.hp));
    b.disabled = state.status !== "plan" || !o.alive;
  });
  document.querySelectorAll("[data-mode]").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
    b.disabled = state.status !== "plan";
  });
  const o = state.ops[state.sel];
  $("undo").disabled = state.status !== "plan" || !o.acts.length;
  $("clear").disabled = state.status !== "plan" || !o.acts.length;
  $("go").disabled = state.status !== "plan" || !hasOrders();
  $("replayBtn").disabled = state.status !== "plan" || !state.lastReplay || !state.lastReplay.length;
  $("over").hidden = state.status !== "over";
  for (const id of ["replayToggle", "timeline", "replayClose"]) $(id).disabled = state.status !== "replay";
  $("replayToggle").textContent = state.replayPaused ? "Reproduzir" : "Pausar";
  $("replaySpeed").textContent = `${state.replaySpeed}×`;
}

function tapAt(e) {
  const r = $("cv").getBoundingClientRect();
  if (!r.width || !r.height) return;
  const tx = Math.floor(state.OX + ((e.clientX - r.left) / r.width) * (state.W / state.Z));
  const ty = Math.floor(state.OY + ((e.clientY - r.top) / r.height) * (state.H / state.Z));
  tapTile(tx, ty);
  req();
}

function start(resume) {
  buildWorld();
  say("Planeje as rotas e execute.");
  req();
  state.Z = 1; state.OX = 0; state.OY = 0;
  const ok = !!resume && restore();
  if (!ok) delete state.store.plans[state.mapId];
  buildSquad();
  layout(req);
  saveMatch();
  return ok;
}

function setupEvents() {
  const cv = $("cv");
  const ptrs = new Map();
  let gesture = null;

  cv.addEventListener("pointerdown", e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: state.Z };
    } else if (ptrs.size === 1) {
      gesture = { pinch: false, moved: false };
    }
  });

  cv.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId);
    if (!p || !gesture) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const r = cv.getBoundingClientRect();

    if (gesture.pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      zoomAt(gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, req);
    } else if (!gesture.pinch) {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) gesture.moved = true;
      if (gesture.moved && state.Z > 1 && r.width && r.height) {
        state.OX -= (dx * (state.W / state.Z)) / r.width;
        state.OY -= (dy * (state.H / state.Z)) / r.height;
        clampView();
        req();
      }
    }
  });

  const endPtr = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (e.type === "pointerup" && gesture && !gesture.pinch && !gesture.moved && !ptrs.size) tapAt(e);
    if (!ptrs.size) gesture = null;
    else if (gesture && gesture.pinch) gesture = { pinch: false, moved: true };
  };

  cv.addEventListener("pointerup", endPtr);
  cv.addEventListener("pointercancel", endPtr);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(state.Z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top, req);
  }, { passive: false });

  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { setMode(b.dataset.mode); req(); }));

  $("undo").addEventListener("click", () => { undo(); req(); });
  $("clear").addEventListener("click", () => { clearPlan(); req(); });
  $("go").addEventListener("click", execute);
  // Ação destrutiva: o primeiro toque arma o botão, o segundo (em até 3 s) confirma
  function confirmClick(b, armedText, action) {
    const label = b.textContent;
    let arm = 0;
    const disarm = () => { clearTimeout(arm); arm = 0; b.textContent = label; b.classList.remove("armed"); };
    b.addEventListener("click", () => {
      if (!arm) {
        b.textContent = armedText;
        b.classList.add("armed");
        arm = setTimeout(disarm, 3000);
        return;
      }
      disarm();
      action();
    });
  }

  confirmClick($("reset"), "Confirmar", () => { state.lastReplay = null; start(false); });
  $("again").addEventListener("click", () => { state.lastReplay = null; start(false); });

  $("replayBtn").addEventListener("click", () => startReplay(req));

  // Controlos da linha do tempo do Replay
  $("replayClose").addEventListener("click", () => endReplay(req));
  $("replayToggle").addEventListener("click", toggleReplay);
  $("timeline").addEventListener("input", e => { seekReplay(parseFloat(e.target.value)); req(); });
  $("replaySpeed").addEventListener("click", () => { cycleSpeed(); req(); });

  addEventListener("keydown", e => {
    if (document.querySelector(".sheet:not([hidden])")) {
      if (e.key === "Escape") closeSheets();
      return;
    }
    if (e.target.tagName === "INPUT") return;
    if (e.target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
    const k = e.key.toLowerCase();
    if (k >= "1" && k <= "4") select(+k - 1);
    else if (k === "m") setMode("move");
    else if (k === "a") setMode("aim");
    else if (k === "e") setMode("wait");
    else if (k === "o") setMode("open");
    else if (k === "z") undo();
    else if (k === "r") state.status === "replay" ? endReplay(req) : startReplay(req);
    else if (k === "enter") execute();
    req();
  });

  let rt = 0;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => layout(req), 60);
  }).observe($("stage"));

  function closeSheets() {
    document.querySelectorAll(".sheet").forEach(s => { s.hidden = true; });
  }

  document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    const s = $(b.dataset.open);
    s.hidden = false;
    s.querySelector("[data-close]").focus();
  }));

  document.querySelectorAll(".sheet").forEach(s => s.addEventListener("click", e => {
    if (e.target === s || e.target.closest("[data-close]")) closeSheets();
  }));

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    readColors();
    drawStatic();
    state.uiDirty = true;
    req();
  });

  const PF = [["pW", "w"], ["pH", "h"], ["pR", "rooms"], ["pE", "enemies"], ["pC", "crates"], ["pX", "extra"], ["pK", "corridors"], ["pKw", "corrW"]];
  PF.forEach(([id]) => {
    const i = $(id), o = $(id + "o"), f = () => { o.textContent = i.value + (id === "pC" || id === "pK" ? "%" : ""); };
    i.addEventListener("input", f);
    f();
  });

  function fillParams(g) {
    PF.forEach(([id, k]) => {
      if (g[k] != null) { $(id).value = g[k]; $(id).dispatchEvent(new Event("input")); }
    });
    if (g.seed) $("pSeed").value = g.seed;
  }

  function readParams() {
    const g = { seed: $("pSeed").value.trim() };
    PF.forEach(([id, k]) => { g[k] = +$(id).value; });
    return g;
  }

  function applyParams(g) {
    fillParams(g);
    state.store.settings.gen = { ...g };
    persist();
  }

  const newSeed = () => Math.random().toString(36).slice(2, 8);
  $("pSeed").value = newSeed();

  function genMap() {
    if (!$("pSeed").value.trim()) $("pSeed").value = newSeed();
    const p = readParams();
    const res = generate(p);
    state.store.settings.gen = p;
    setMap(res.rows, { name: p.seed, source: "generated", params: p });
    if (start(true)) return;
    let m = `Mapa gerado com ${res.rooms} salas, ${res.corridors} ${res.corridors === 1 ? "corredor" : "corredores"} e ${res.enemies} inimigos.`;
    if (res.entries < 2) m += ` Este mapa tem só uma entrada.`;
    if (res.rooms < p.rooms) m += ` Nesse tamanho só couberam ${res.rooms} salas.`;
    else if (res.enemies < p.enemies) m += ` Não havia espaço para ${p.enemies}.`;
    say(m);
    req();
  }

  $("genBtn").addEventListener("click", () => { genMap(); closeSheets(); });
  $("reroll").addEventListener("click", () => { $("pSeed").value = newSeed(); genMap(); closeSheets(); });
  $("classic").addEventListener("click", () => {
    setMap(CLASSIC, CLASSIC_META);
    applyParams(CLASSIC_META.params);
    start(true);
    closeSheets();
  });

  confirmClick($("wipe"), "Toque de novo para apagar", () => {
    const meta = state.store.maps[state.mapId];
    state.store = emptyStore();
    setMap(state.MAP, meta || CLASSIC_META);
    start(false);
    say("Dados salvos apagados.");
    req();
    persist();
    closeSheets();
  });

  const gs = state.store.settings.gen;
  if (gs) fillParams(gs);

  document.querySelectorAll(".fields input").forEach(i => i.addEventListener("input", () => {
    state.store.settings.gen = readParams();
    persist();
  }));
}

(function bootstrap() {
  state.store = loadStore();
  readColors();
  initRenderer($("cv"));

  const last = state.store.lastMapId && state.store.maps[state.store.lastMapId];
  if (last && last.source !== "classic" && Array.isArray(last.rows) && last.rows.length) {
    setMap(last.rows, last);
  } else {
    setMap(CLASSIC, CLASSIC_META);
  }

  setupEvents();
  start(true);

  addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
  document.fonts.ready.then(() => { state.uiDirty = true; req(); });
})();
