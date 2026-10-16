import { CLASSIC, CLASSIC_PARAMS, DIRS, DT, MOVE_TIME, MOVE_BUDGET, FREEZE_REAL, NAMES, C, readColors } from "./config.js";
import { state, say, loadStore, persist, setMap, savePlan, saveMatch, restore } from "./state.js";
import { bfs, pathLen } from "./pathfinding.js";
import { generate } from "./map-generator.js";
import { createOperator, redeploy, slotIndex, removeHold, pruneHolds, dependsOn, tileIs } from "./entities/operator.js";
import { createEnemy, faceDoor, updateVis } from "./entities/enemy.js";
import { step } from "./systems/combat.js";
import { setSpeed, recordReplay, applyReplayFrame, startReplay, endReplay } from "./systems/replay.js";
import { initRenderer, layout, zoomAt, clampView, drawStatic, draw } from "./systems/render.js";

const $ = id => document.getElementById(id);

function init() {
  state.H = state.MAP.length;
  state.W = state.MAP[0].length;
  state.N = state.W * state.H;
  state.solid = new Uint8Array(state.N);
  state.opaque = new Uint8Array(state.N);
  state.doorIdx = new Int16Array(state.N).fill(-1);
  state.prev = new Int32Array(state.N);
  state.queue = new Int32Array(state.N);
  state.roomId = new Int16Array(state.N).fill(-1);
  state.doors = [];
  state.ops = [];
  state.enemies = [];
  state.tracers = [];
  state.lines = [];
  state.turn = 1;
  state.sel = 0;
  state.mode = "move";
  state.status = "plan";
  state.entries = [[], []];

  for (let y = 0; y < state.H; y++) for (let x = 0; x < state.W; x++) {
    const c = state.MAP[y][x], k = y * state.W + x;
    if (c === "#" || c === "O") { state.solid[k] = 1; state.opaque[k] = 1; }
    else if (c === "X") state.solid[k] = 2;
    else if (c === "D") {
      state.doorIdx[k] = state.doors.length;
      state.doors.push({ x, y, open: false, vert: state.MAP[y - 1][x] === "#" });
      state.opaque[k] = 1;
    }
    else if (c === "S") { state.ops.push(createOperator(x, y, state.ops.length)); state.entries[0].push({ x, y }); }
    else if (c === "T") state.entries[1].push({ x, y });
    else if (c === "E") state.enemies.push(createEnemy(x, y));
  }

  let rc = 0;
  for (let k = 0; k < state.N; k++) {
    if (state.solid[k] === 1 || state.doorIdx[k] >= 0 || state.roomId[k] >= 0) continue;
    let h = 0, t = 0;
    state.queue[t++] = k;
    state.roomId[k] = rc;
    while (h < t) {
      const c = state.queue[h++], cx = c % state.W, cy = (c / state.W) | 0;
      for (let i = 0; i < 4; i++) {
        const nk = (cy + DIRS[i][1]) * state.W + cx + DIRS[i][0];
        if (state.solid[nk] === 1 || state.doorIdx[nk] >= 0 || state.roomId[nk] >= 0) continue;
        state.roomId[nk] = rc;
        state.queue[t++] = nk;
      }
    }
    rc++;
  }

  for (const d of state.doors) {
    d.rooms = [];
    for (let i = 0; i < 4; i++) {
      const r = state.roomId[(d.y + DIRS[i][1]) * state.W + d.x + DIRS[i][0]];
      if (r >= 0) d.rooms.push(r);
    }
  }

  for (const u of state.ops.concat(state.enemies)) faceDoor(u);
  $("over").hidden = true;
  updateVis();
  say("Planeje as rotas e execute.");
  state.uiDirty = true;
  req();
}

function freezeTurn(timeout) {
  state.status = "freeze";
  state.freezeT = FREEZE_REAL;
  state.lastReplay = state.replayFrames.slice();
  for (const o of state.ops) {
    o.lockTo = o.alive && o.res >= 0 ? o.res : -1;
    o.lockFrom = o.lockTo >= 0 ? o.cur : -1;
  }
  say(timeout ? `Tempo esgotado: congelado aos ${MOVE_TIME} s.` : `Turno resolvido em ${state.simTime.toFixed(1).replace(".", ",")} s.`);
  state.uiDirty = true;
}

function toPlan() {
  state.status = "plan";
  state.turn++;
  state.tracers.length = 0;
  for (const o of state.ops) {
    o.path = []; o.acts = []; o.pi = 0; o.aim = null; o.target = null;
    o.holds = []; o.waiting = false; o.lock = 0;
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
  $("over").hidden = false;
  state.uiDirty = true;
  saveMatch();
}

function execute() {
  if (state.status !== "plan") return;
  state.status = "exec";
  state.simTime = 0;
  state.lastShot = -9;
  acc = 0;
  lastT = 0;
  for (const o of state.ops) {
    o.pi = 0; o.stopped = false; o.blocked = false; o.blockedBy = -1;
    for (const h of o.holds) h.done = false;
    if (o.lock && o.lockFrom >= 0 && o.path.length) {
      o.cur = o.lockFrom;
      o.res = ((o.path[0].y | 0) * state.W) + (o.path[0].x | 0);
    } else {
      o.cur = (o.y | 0) * state.W + (o.x | 0);
      o.res = -1;
    }
  }
  state.lastMove = 0;
  state.pendingHold = null;
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
    acc += real * state.slowMo;
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
    acc += real * state.slowMo;
    while (acc >= DT && state.status === "replay") {
      if (state.replayIdx < state.lastReplay.length - 1) {
        state.replayIdx++;
        applyReplayFrame(state.lastReplay[state.replayIdx]);
      } else {
        state.replayHoldEnd += DT;
        if (state.replayHoldEnd >= 0.8) { endReplay(req); break; }
      }
      acc -= DT;
    }
  } else {
    lastT = 0;
  }

  draw();

  const ck = $("clock"), live = state.status === "exec" || state.status === "freeze" || state.status === "replay";
  ck.hidden = !live;
  if (live) {
    const tt = Math.min(state.simTime, MOVE_TIME);
    $("clockTxt").textContent = state.status === "replay" ? `Replay: ${tt.toFixed(1).replace(".", ",")} s` : `${tt.toFixed(1).replace(".", ",")} s / ${MOVE_TIME} s`;
    $("clockBar").style.width = (tt / MOVE_TIME * 100) + "%";
    ck.classList.toggle("frozen", state.status === "freeze");
  }

  if (state.uiDirty) {
    ui();
    state.uiDirty = false;
    savePlan();
  }
  if (live) req();
}

const squad = $("squad");
function buildSquad() {
  squad.innerHTML = "";
  state.ops.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.i = i;
    b.innerHTML = `<span class="nm"><span class="sw"></span>${i + 1} ${NAMES[i]}</span><span class="row"><span class="pips">${"<i></i>".repeat(o.max)}</span><span class="mv"></span></span>`;
    b.addEventListener("click", () => select(i));
    squad.appendChild(b);
  });
}

function ui() {
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
  $("clear").disabled = state.status !== "plan" || (!o.acts.length);
  $("go").disabled = state.status !== "plan";
  const rb = $("replayBtn");
  if (rb) {
    rb.textContent = state.status === "replay" ? "Parar" : "Replay";
    rb.disabled = state.status === "exec" || state.status === "freeze" || (!state.lastReplay && state.status !== "replay");
  }
}

function select(i) {
  if (state.status !== "plan" || !state.ops[i] || !state.ops[i].alive) return;
  state.sel = i;
  state.pendingHold = null;
  state.uiDirty = true;
  req();
}

function setMode(m) {
  state.mode = m;
  state.pendingHold = null;
  state.uiDirty = true;
  req();
}

function undo() {
  const o = state.ops[state.sel], a = o.acts.pop();
  if (a === undefined) return;
  if (typeof a === "number") o.path.length -= a;
  else if (a.hold) o.holds = o.holds.filter(x => x !== a.hold);
  else o.aim = a.aim;
  state.pendingHold = null;
  pruneHolds();
  state.uiDirty = true;
  req();
}

function clearPlan() {
  const o = state.ops[state.sel];
  o.path = o.path.slice(0, o.lock);
  o.acts = [];
  o.aim = null;
  o.holds = [];
  state.pendingHold = null;
  pruneHolds();
  state.uiDirty = true;
  req();
}

function waitTap(o, tx, ty) {
  if (!state.pendingHold) {
    let at = -1;
    if (tileIs(o, tx, ty)) at = 0;
    else {
      const k = o.path.findIndex(p => tileIs(p, tx, ty));
      if (k >= 0) at = k + 1;
    }
    if (at < 0) say(`Toque num ponto da rota de ${NAMES[o.id]} para marcar onde ele espera.`);
    else if (at >= o.path.length) say(`${NAMES[o.id]} precisa ter rota depois do ponto de espera.`);
    else {
      state.pendingHold = { op: o.id, at };
      say(`Agora toque no ponto da rota de outro operador que libera ${NAMES[o.id]}.`);
    }
    state.uiDirty = true;
    req();
    return;
  }
  const at = state.pendingHold.at;
  state.pendingHold = null;
  for (const y of state.ops) {
    if (y === o || !y.alive) continue;
    const j = y.path.findIndex(p => tileIs(p, tx, ty));
    if (j < 0) continue;
    if (dependsOn(y.id, o.id)) {
      say(`${NAMES[y.id]} já espera por ${NAMES[o.id]}: os dois ficariam travados.`);
      state.uiDirty = true;
      req();
      return;
    }
    const old = o.holds.find(h => h.at === at);
    if (old) removeHold(o, old);
    const hp = at === 0 ? o : o.path[at - 1];
    const h = { at, op: y.id, ti: j + 1, hx: hp.x | 0, hy: hp.y | 0, tx, ty };
    o.holds.push(h);
    o.acts.push({ hold: h });
    say(`${NAMES[o.id]} espera ${NAMES[y.id]} chegar ao ponto marcado.`);
    state.uiDirty = true;
    req();
    return;
  }
  say("Esse ponto não está na rota de outro operador. Espera cancelada.");
  state.uiDirty = true;
  req();
}

function tapAt(e) {
  if (state.status !== "plan") return;
  const cv = $("cv");
  const r = cv.getBoundingClientRect();
  const tx = Math.floor(state.OX + (e.clientX - r.left) / (32 * state.Z));
  const ty = Math.floor(state.OY + (e.clientY - r.top) / (32 * state.Z));
  if (tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return;
  const hit = state.ops.findIndex(o => o.alive && (o.x | 0) === tx && (o.y | 0) === ty);
  if (hit >= 0 && hit !== state.sel && state.mode === "move") { select(hit); return; }
  if (state.turn === 1 && state.mode === "move" && hit < 0 && slotIndex(tx, ty) >= 0) {
    redeploy(state.ops[state.sel], tx, ty);
    return;
  }
  const o = state.ops[state.sel];
  if (!o.alive) return;
  if (state.mode === "wait") { waitTap(o, tx, ty); return; }
  if (state.mode === "aim") {
    o.acts.push({ aim: o.aim });
    o.aim = { x: tx + .5, y: ty + .5 };
  } else {
    if (hit === state.sel) return;
    const s = o.path.length ? o.path[o.path.length - 1] : o;
    const full = bfs(s.x | 0, s.y | 0, tx, ty);
    if (!full) {
      say(state.solid[ty * state.W + tx] ? "Esse ponto está bloqueado." : "Sem caminho até ali.");
      state.uiDirty = true;
      req();
      return;
    }
    let left = MOVE_BUDGET - pathLen(o), px = s.x, py = s.y, n = 0;
    for (const q of full) {
      const d = Math.hypot(q.x - px, q.y - py);
      if (d > left + 1e-6) break;
      left -= d; px = q.x; py = q.y; n++;
    }
    if (!n) { say(`${NAMES[o.id]} já usou todo o movimento do turno.`); state.uiDirty = true; req(); return; }
    if (n < full.length) say(`Rota cortada no limite de movimento de ${NAMES[o.id]}.`);
    o.path.push(...full.slice(0, n));
    o.acts.push(n);
  }
  state.uiDirty = true;
  req();
}

function start(resume) {
  init();
  state.Z = 1; state.OX = 0; state.OY = 0; state.pendingHold = null;
  const ok = !!resume && restore();
  if (!ok) delete state.store.plans[state.mapId];
  buildSquad();
  layout(req);
  saveMatch();
  return ok;
}

// Inicialização de Eventos
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
    if (gesture.pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], r = cv.getBoundingClientRect();
      zoomAt(gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, req);
    } else if (!gesture.pinch) {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) gesture.moved = true;
      if (gesture.moved && state.Z > 1) {
        state.OX -= dx / (32 * state.Z);
        state.OY -= dy / (32 * state.Z);
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

  $("zin").addEventListener("click", () => zoomAt(state.Z * 1.5, cv.clientWidth / 2, cv.clientHeight / 2, req));
  $("zout").addEventListener("click", () => zoomAt(state.Z / 1.5, cv.clientWidth / 2, cv.clientHeight / 2, req));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("undo").addEventListener("click", undo);
  $("clear").addEventListener("click", clearPlan);
  $("go").addEventListener("click", execute);
  $("reset").addEventListener("click", () => { state.lastReplay = null; start(false); });
  $("again").addEventListener("click", () => { state.lastReplay = null; start(false); });

  $("replayBtn").addEventListener("click", () => state.status === "replay" ? endReplay(req) : startReplay(req));
  $("spd05").addEventListener("click", () => setSpeed(0.5));
  $("spd025").addEventListener("click", () => setSpeed(0.25));
  $("clockSpeed").addEventListener("click", () => setSpeed(state.slowMo === 0.5 ? 0.25 : 0.5));

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
    else if (k === "+" || k === "=") zoomAt(state.Z * 1.5, cv.clientWidth / 2, cv.clientHeight / 2, req);
    else if (k === "-") zoomAt(state.Z / 1.5, cv.clientWidth / 2, cv.clientHeight / 2, req);
    else if (k === "z") undo();
    else if (k === "r") state.status === "replay" ? endReplay(req) : startReplay(req);
    else if (k === "enter") execute();
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
    const i = $(id), o =$(id + "o"), f = () => { o.textContent = i.value + (id === "pC" || id === "pK" ? "%" : ""); };
    i.addEventListener("input", f);
    f();
  });

  function applyParams(g) {
    PF.forEach(([id, k]) => {
      if (g[k] != null) { $(id).value = g[k];$(id).dispatchEvent(new Event("input")); }
    });
    if (g.seed) $("pSeed").value = g.seed;
    state.store.settings.gen = { ...g };
    persist();
  }

  const newSeed = () => Math.random().toString(36).slice(2, 8);
  $("pSeed").value = newSeed();

  function genMap() {
    let seed = $("pSeed").value.trim();
    if (!seed) { seed = newSeed(); $("pSeed").value = seed; }
    const p = { seed };
    PF.forEach(([id, k]) => { p[k] = +$(id).value; });
    const res = generate(p);
    state.store.settings.gen = p;
    setMap(res.rows, { name: seed, source: "generated", params: p });
    if (start(true)) return;
    let m = `Mapa gerado com ${res.rooms} salas, ${res.corridors} ${res.corridors === 1 ? "corredor" : "corredores"} e ${res.enemies} inimigos.`;
    if (res.entries < 2) m += ` Este mapa tem só uma entrada.`;
    if (res.rooms < p.rooms) m += ` Nesse tamanho só couberam ${res.rooms} salas.`;
    else if (res.enemies < p.enemies) m += ` Não havia espaço para ${p.enemies}.`;
    say(m);
    state.uiDirty = true;
    req();
  }

  $("genBtn").addEventListener("click", () => { genMap(); closeSheets(); });
  $("reroll").addEventListener("click", () => { $("pSeed").value = newSeed(); genMap(); closeSheets(); });
  $("classic").addEventListener("click", () => {
    setMap(CLASSIC, { name: "Clássico", source: "classic", params: CLASSIC_PARAMS });
    applyParams(CLASSIC_PARAMS);
    start(true);
    closeSheets();
  });

  let wipeArm = 0;
  $("wipe").addEventListener("click", () => {
    const b = $("wipe");
    if (!wipeArm) {
      b.textContent = "Toque de novo para apagar";
      wipeArm = setTimeout(() => { wipeArm = 0; b.textContent = "Apagar dados salvos"; }, 3000);
      return;
    }
    clearTimeout(wipeArm);
    wipeArm = 0;
    b.textContent = "Apagar dados salvos";
    const meta = state.store.maps[state.mapId];
    state.store = { version: 1, lastMapId: null, settings: { gen: null }, maps: {}, plans: {}, matches: {} };
    setMap(state.MAP, meta ? { name: meta.name, source: meta.source, params: meta.params } : { name: "Clássico", source: "classic", params: CLASSIC_PARAMS });
    start(false);
    say("Dados salvos apagados.");
    state.uiDirty = true;
    req();
    persist();
    closeSheets();
  });

  const gs = state.store.settings.gen;
  if (gs) {
    PF.forEach(([id, k]) => {
      if (gs[k] != null) { $(id).value = gs[k];$(id).dispatchEvent(new Event("input")); }
    });
    if (gs.seed) $("pSeed").value = gs.seed;
  }

  document.querySelectorAll(".fields input").forEach(i => i.addEventListener("input", () => {
    const g = { seed: $("pSeed").value.trim() };
    PF.forEach(([id, k]) => { g[k] = +$(id).value; });
    state.store.settings.gen = g;
    persist();
  }));
}

// Ponto de Entrada da Aplicação
(function bootstrap() {
  state.store = loadStore();
  readColors();
  initRenderer($("cv"));

  const last = state.store.lastMapId && state.store.maps[state.store.lastMapId];
  if (last && last.source !== "classic" && Array.isArray(last.rows) && last.rows.length) {
    setMap(last.rows, { name: last.name, source: last.source, params: last.params });
  } else {
    setMap(CLASSIC, { name: "Clássico", source: "classic", params: CLASSIC_PARAMS });
  }

  setupEvents();
  start(true);

  addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
  if (document.fonts) document.fonts.ready.then(() => { state.uiDirty = true; req(); });
})();


