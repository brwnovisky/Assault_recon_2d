import { MOVE_BUDGET, NAMES } from "../config.js";
import { state, say } from "../state.js";
import { bfs, pathLen } from "../pathfinding.js";
import { redeploy, slotIndex, removeHold, pruneHolds, dependsOn, tileIs } from "../entities/operator.js";

export function select(i) {
  if (state.status !== "plan" || !state.ops[i] || !state.ops[i].alive) return;
  state.sel = i;
  state.pendingHold = null;
  state.uiDirty = true;
}

export function setMode(m) {
  state.mode = m;
  state.pendingHold = null;
  state.uiDirty = true;
}

export function undo() {
  const o = state.ops[state.sel], a = o.acts.pop();
  if (a === undefined) return;
  if (typeof a === "number") o.path.length -= a;
  else if (a.hold) o.holds = o.holds.filter(x => x !== a.hold);
  else o.aim = a.aim;
  state.pendingHold = null;
  pruneHolds();
  state.uiDirty = true;
}

export function clearPlan() {
  const o = state.ops[state.sel];
  o.path = o.path.slice(0, o.lock);
  o.acts = [];
  o.aim = null;
  o.holds = [];
  state.pendingHold = null;
  pruneHolds();
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

export function tapTile(tx, ty) {
  if (state.status !== "plan") return;
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
    o.path.push(...full.slice(0, n));
    o.acts.push(n);
  }
  state.uiDirty = true;
}
