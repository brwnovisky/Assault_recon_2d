import { MOVE_BUDGET, NAMES } from "../config.js";
import { state, say } from "../state.js";
import { bfs, pathLen } from "../pathfinding.js";
import { redeploy, slotIndex, removeHold, pruneHolds, dependsOn, tileIs, endOf, byPriority } from "../entities/operator.js";

// Há ordem do jogador (rota, mira ou espera) para algum operador vivo
export const hasOrders = () => state.ops.some(o => o.alive && o.acts.length > 0);

export function select(i) {
  if (state.status !== "plan" || !state.ops[i] || !state.ops[i].alive) return;
  if (i !== state.sel) state.mode = null;
  state.sel = i;
  state.pendingHold = null;
  state.uiDirty = true;
}

export function setMode(m) {
  state.mode = state.mode === m ? null : m;
  state.pendingHold = null;
  state.uiDirty = true;
}

export function undo() {
  const o = state.ops[state.sel], a = o.acts.pop();
  if (a === undefined) return;
  if (typeof a === "number") o.path.length -= a;
  else if (a.hold) o.holds = o.holds.filter(x => x !== a.hold);
  else {
    o.aims = o.aims.filter(x => x !== a.aim);
    if (a.replaced) o.aims.push(a.replaced);
  }
  if (o.path.length === o.lock) o.planAt = Infinity;
  state.pendingHold = null;
  resolveEnds();
  state.uiDirty = true;
}

export function clearPlan() {
  const o = state.ops[state.sel];
  o.path = o.path.slice(0, o.lock);
  o.acts = [];
  o.aims = [];
  o.holds = [];
  o.planAt = Infinity;
  state.pendingHold = null;
  resolveEnds();
  state.uiDirty = true;
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
      return;
    }
    const old = o.holds.find(h => h.at === at);
    if (old) removeHold(o, old);
    const hp = at === 0 ? o : o.path[at - 1];
    const h = { at, op: y.id, ti: j + 1, hx: hp.x | 0, hy: hp.y | 0, tx, ty };
    o.holds.push(h);
    o.acts.push({ hold: h });
    say(`${NAMES[o.id]} espera ${NAMES[y.id]} chegar ao ponto marcado.`);
    return;
  }
  say("Esse ponto não está na rota de outro operador. Espera cancelada.");
}

const tileKey = p => (p.y | 0) * state.W + (p.x | 0);

function trimEnd(o) {
  o.path.pop();
  for (let i = o.acts.length - 1; i >= 0; i--) if (typeof o.acts[i] === "number") {
    if (--o.acts[i] === 0) o.acts.splice(i, 1);
    break;
  }
  for (const a of o.aims) a.at = Math.min(a.at, o.path.length);
  if (o.path.length === o.lock) o.planAt = Infinity;
}

// Dois operadores nunca terminam na mesma casa: a rota de menor prioridade é cortada até liberar
function resolveEnds() {
  const cut = new Map();
  for (let changed = true; changed;) {
    changed = false;
    const ends = new Map();
    for (const u of state.ops.filter(u => u.alive).sort(byPriority)) {
      const k = tileKey(endOf(u));
      if (ends.has(k) && u.path.length > u.lock) {
        cut.set(u.id, ends.get(k));
        trimEnd(u);
        changed = true;
        break;
      }
      ends.set(k, u.id);
    }
  }
  for (const [id, by] of cut) say(`Rota de ${NAMES[id]} cortada: ${NAMES[by]} tem prioridade nessa casa.`);
  pruneHolds();
}

export function tapTile(tx, ty) {
  if (state.status !== "plan") return;
  if (tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return;
  const hit = state.ops.findIndex(o => o.alive && (o.x | 0) === tx && (o.y | 0) === ty);
  if (!state.mode) { if (hit >= 0) select(hit); return; }
  if (state.turn === 1 && state.mode === "move" && hit < 0 && slotIndex(tx, ty) >= 0) {
    redeploy(state.ops[state.sel], tx, ty);
    resolveEnds();
    return;
  }
  const o = state.ops[state.sel];
  if (!o.alive) return;
  if (state.mode === "wait") { waitTap(o, tx, ty); return; }
  if (state.mode === "aim") {
    // A mira vale a partir do fim da rota atual e substitui outra marcada no mesmo ponto
    const at = o.path.length, aim = { at, x: tx + .5, y: ty + .5 }, replaced = o.aims.find(a => a.at === at) || null;
    o.aims = o.aims.filter(a => a !== replaced);
    o.aims.push(aim);
    o.acts.push({ aim, replaced });
  } else {
    if (hit === state.sel) return;
    const s = endOf(o);
    const full = bfs(s.x | 0, s.y | 0, tx, ty);
    if (!full) {
      say(state.solid[ty * state.W + tx] ? "Esse ponto está bloqueado." : "Sem caminho até ali.");
      return;
    }
    let left = MOVE_BUDGET - pathLen(o), px = s.x, py = s.y, n = 0;
    for (const q of full) {
      const d = Math.hypot(q.x - px, q.y - py);
      if (d > left + 1e-6) break;
      left -= d; px = q.x; py = q.y; n++;
    }
    if (!n) { say(`${NAMES[o.id]} já usou todo o movimento do turno.`); return; }
    if (n < full.length) say(`Rota cortada no limite de movimento de ${NAMES[o.id]}.`);
    if (o.path.length === o.lock) o.planAt = ++state.planSeq;
    o.path.push(...full.slice(0, n));
    o.acts.push(n);
    resolveEnds();
  }
  state.uiDirty = true;
}
