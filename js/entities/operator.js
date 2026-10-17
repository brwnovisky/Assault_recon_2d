import { NAMES } from "../config.js";
import { state, say } from "../state.js";
import { saveMatch } from "../storage.js";
import { createUnit, faceDoor } from "./unit.js";
import { updateVis } from "./enemy.js";
import { los, rayDist } from "../pathfinding.js";

export const createOperator = (x, y, id) => createUnit(x, y, 3, id);

export const endOf = o => o.path.length ? o.path[o.path.length - 1] : o;

// Prioridade nas disputas de casa: sem rota própria (-1) mantém a casa; senão vence a rota criada antes
const priority = o => o.path.length > o.lock ? o.planAt : -1;
export const byPriority = (a, b) => (priority(a) - priority(b)) || (a.id - b.id);

// Mira vigente: a última marcada num ponto da rota já alcançado (at = tamanho da rota quando foi marcada)
export function activeAim(o) {
  let aim = null;
  for (const a of o.aims) if (a.at <= o.pi) aim = a;
  return aim;
}

// Ângulo para a mira: com a linha bloqueada por parede, gira a partir dela até a primeira quina
// (o raio passa a ir bem mais longe, ou alcança a distância da mira) e trava nessa quina
const EDGE_STEP = Math.PI / 360, EDGE_MAX = Math.PI * 2 / 3;
export function aimAngle(o, aim) {
  const a = Math.atan2(aim.y - o.y, aim.x - o.x);
  if (los(o.x, o.y, aim.x, aim.y) >= 0) return a;
  const L = Math.hypot(aim.x - o.x, aim.y - o.y);
  const edge = s => {
    let prev = rayDist(o.x, o.y, a, L);
    for (let d = EDGE_STEP; d <= EDGE_MAX; d += EDGE_STEP) {
      const h = rayDist(o.x, o.y, a + s * d, L);
      if (h >= L - 1e-6 || h > prev * 1.3 + 0.3) return d;
      prev = h;
    }
    return Infinity;
  };
  const l = edge(-1), r = edge(1);
  return l === Infinity && r === Infinity ? a : l <= r ? a - l : a + r;
}

export const tileIs = (p, x, y) => p && (p.x | 0) === x && (p.y | 0) === y;

export function dependsOn(a, b) {
  const seen = new Set(), st = [a];
  while (st.length) {
    const c = st.pop();
    if (c === b) return true;
    if (seen.has(c)) continue;
    seen.add(c);
    for (const h of state.ops[c].holds) st.push(h.op);
  }
  return false;
}

export function removeHold(o, h) {
  o.holds = o.holds.filter(x => x !== h);
  o.acts = o.acts.filter(a => a.hold !== h);
}

// Ponto da rota no índice `at` (0 = casa de partida)
export const routePoint = (o, at) => at === 0 ? o : o.path[at - 1];

export function pruneHolds() {
  for (const o of state.ops) {
    for (const h of o.holds.slice()) {
      const y = state.ops[h.op];
      const ok = h.at <= o.path.length && y.alive && tileIs(y.path[h.ti - 1], h.tx, h.ty) && tileIs(routePoint(o, h.at), h.hx, h.hy);
      if (!ok) removeHold(o, h);
    }
    // Abrir porta só vale enquanto o ponto da rota ainda existe e é o mesmo
    for (const q of o.opens.slice()) {
      if (q.at <= o.path.length && tileIs(routePoint(o, q.at), q.tx, q.ty)) continue;
      o.opens = o.opens.filter(x => x !== q);
      o.acts = o.acts.filter(a => a.open !== q);
    }
  }
}

export function slotIndex(x, y) {
  for (let e = 0; e < state.entries.length; e++) {
    if (state.entries[e].some(s => s.x === x && s.y === y)) return e;
  }
  return -1;
}

export function redeploy(o, x, y) {
  o.x = x + .5;
  o.y = y + .5;
  o.path = [];
  o.acts = [];
  o.aims = [];
  o.holds = [];
  o.opens = [];
  o.planAt = Infinity;
  faceDoor(o);
  pruneHolds();
  for (const e of state.enemies) e.seen = false;
  updateVis();
  say(`${NAMES[o.id]} vai pela entrada ${slotIndex(x, y) + 1}.`);
  saveMatch();
}


