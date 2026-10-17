import { STORE_KEY, MAX_MAPS } from "./config.js";
import { state, say, setDoor } from "./state.js";
import { settleDoor } from "./systems/doors.js";

export const emptyStore = () => ({ version: 1, lastMapId: null, settings: { gen: null }, maps: {}, plans: {}, matches: {} });

export function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && s.version === 1 && s.settings && s.maps && s.plans && s.matches) return s;
  } catch (e) { }
  return emptyStore();
}

let saveT = 0;
export function persist() {
  clearTimeout(saveT);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.store));
  } catch (e) { }
}

function schedulePersist() {
  clearTimeout(saveT);
  saveT = setTimeout(persist, 250);
}

function mapKey(rows) {
  let h = 2166136261;
  for (const r of rows) {
    for (let i = 0; i < r.length; i++) h = Math.imul(h ^ r.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 10, 16777619);
  }
  return `m_${rows[0].length}x${rows.length}_${(h >>> 0).toString(36)}`;
}

export function setMap(rows, meta) {
  state.MAP = rows;
  state.mapId = mapKey(rows);
  const now = Date.now(), old = state.store.maps[state.mapId];
  state.store.maps[state.mapId] = {
    id: state.mapId, name: meta.name, source: meta.source, params: meta.params,
    width: rows[0].length, height: rows.length, rows: rows.slice(),
    createdAt: old ? old.createdAt : now, updatedAt: now
  };
  state.store.lastMapId = state.mapId;
  const ids = Object.keys(state.store.maps);
  if (ids.length > MAX_MAPS) {
    ids.sort((a, b) => state.store.maps[a].updatedAt - state.store.maps[b].updatedAt);
    for (const id of ids.slice(0, ids.length - MAX_MAPS)) {
      if (id !== state.mapId) {
        delete state.store.maps[id];
        delete state.store.plans[id];
        delete state.store.matches[id];
      }
    }
  }
  schedulePersist();
}

const r3 = v => Math.round(v * 1000) / 1000;
const tileOf = p => [p.x | 0, p.y | 0];
const center = t => t ? { x: t[0] + .5, y: t[1] + .5 } : null;

export function savePlan() {
  if (!state.mapId || state.status !== "plan") return;
  state.store.plans[state.mapId] = {
    mapId: state.mapId, turn: state.turn, selected: state.sel, mode: state.mode, updatedAt: Date.now(),
    operators: state.ops.map(o => ({
      path: o.path.map(tileOf),
      aims: o.aims.map(a => ({ at: a.at, tile: tileOf(a) })),
      steps: o.acts.map(a => typeof a === "number" ? { type: "move", tiles: a } : a.hold ? { type: "hold", index: o.holds.indexOf(a.hold) } : a.open ? { type: "open", index: o.opens.indexOf(a.open) } : { type: "aim", index: o.aims.indexOf(a.aim), replaced: a.replaced ? { at: a.replaced.at, tile: tileOf(a.replaced) } : null }),
      holds: o.holds.map(h => ({ at: h.at, operator: h.op, triggerIndex: h.ti, hold: [h.hx, h.hy], trigger: [h.tx, h.ty] })),
      opens: o.opens.map(q => ({ at: q.at, door: q.door, tile: [q.tx, q.ty] })),
      order: Number.isFinite(o.planAt) ? o.planAt : null
    }))
  };
  schedulePersist();
}

export function saveMatch() {
  if (!state.mapId || state.status === "exec") return;
  const over = state.status === "over";
  state.store.matches[state.mapId] = {
    mapId: state.mapId, turn: state.turn,
    status: over ? (state.enemies.some(e => e.alive) ? "lost" : "won") : "active",
    updatedAt: Date.now(),
    operators: state.ops.map(o => ({
      x: r3(o.x), y: r3(o.y), angle: r3(o.a), hp: o.hp,
      lock: o.lock && o.lockFrom >= 0 && o.path.length ? { to: tileOf(o.path[0]), from: [o.lockFrom % state.W, (o.lockFrom / state.W) | 0] } : null
    })),
    enemies: state.enemies.map(e => ({
      x: r3(e.x), y: r3(e.y), angle: r3(e.a), baseAngle: r3(e.base), hp: e.hp,
      alert: e.alert, watchDoor: e.watchDoor, watchLeft: r3(e.watchLeft), seen: e.seen,
      attackers: e.attackers, threatLeft: r3(e.threatLeft)
    })),
    doorsOpen: state.doors.map(d => d.open),
    doorSwing: state.doors.map(d => r3(d.swing)),
    log: state.lines.slice()
  };
  if (over) delete state.store.plans[state.mapId];
  if (state.store.maps[state.mapId]) state.store.maps[state.mapId].updatedAt = Date.now();
  schedulePersist();
}

export function restore() {
  const m = state.store.matches[state.mapId];
  if (!m || m.operators.length !== state.ops.length || m.enemies.length !== state.enemies.length || m.doorsOpen.length !== state.doors.length || !m.enemies.every(s => "watchDoor" in s)) return false;
  state.turn = m.turn;
  m.operators.forEach((s, i) => {
    const o = state.ops[i];
    o.x = s.x; o.y = s.y; o.a = o.want = s.angle; o.hp = s.hp; o.alive = s.hp > 0;
    if (s.lock) {
      o.lock = 1;
      o.lockFrom = s.lock.from[1] * state.W + s.lock.from[0];
      o.lockTo = s.lock.to[1] * state.W + s.lock.to[0];
      o.path = [center(s.lock.to)];
    }
  });
  m.enemies.forEach((s, i) => {
    const e = state.enemies[i];
    e.x = s.x; e.y = s.y; e.a = e.want = s.angle; e.base = s.baseAngle;
    e.hp = s.hp; e.alive = s.hp > 0; e.alert = s.alert; e.watchDoor = s.watchDoor; e.watchLeft = s.watchLeft; e.seen = s.seen;
    e.attackers = s.attackers || 0; e.threatLeft = s.threatLeft || 0;
  });
  m.doorsOpen.forEach((v, i) => {
    const d = state.doors[i];
    setDoor(i, v);
    if (!v) return;
    if (m.doorSwing) { d.swing = m.doorSwing[i]; d.settled = true; } else settleDoor(d);
  });
  state.lines = m.log.slice(-2);
  if (m.status !== "active") return true;

  const p = state.store.plans[state.mapId];
  if (p && p.turn === m.turn && p.operators.length === state.ops.length && p.operators.every(s => s.aims)) {
    p.operators.forEach((s, i) => {
      const o = state.ops[i];
      if (!o.alive) return;
      o.path = s.path.map(center);
      o.aims = s.aims.map(a => ({ at: a.at, ...center(a.tile) }));
      o.holds = (s.holds || []).map(h => ({ at: h.at, op: h.operator, ti: h.triggerIndex, hx: h.hold[0], hy: h.hold[1], tx: h.trigger[0], ty: h.trigger[1] }));
      o.opens = (s.opens || []).map(q => ({ at: q.at, door: q.door, tx: q.tile[0], ty: q.tile[1] }));
      o.planAt = s.order == null ? Infinity : s.order;
      state.planSeq = Math.max(state.planSeq, s.order || 0);
      o.acts = s.steps.map(st => st.type === "move" ? st.tiles : st.type === "hold" ? { hold: o.holds[st.index] } : st.type === "open" ? { open: o.opens[st.index] } : { aim: o.aims[st.index], replaced: st.replaced ? { at: st.replaced.at, ...center(st.replaced.tile) } : null }).filter(a => typeof a === "number" || (!("hold" in a) || a.hold) && (!("open" in a) || a.open));
    });
    state.sel = p.selected;
    state.mode = p.mode === "aim" || p.mode === "move" || p.mode === "open" ? p.mode : null;
  }
  if (!state.ops[state.sel] || !state.ops[state.sel].alive) {
    state.sel = state.ops.findIndex(o => o.alive);
  }
  say(`Partida retomada no turno ${state.turn}.`);
  return true;
}
