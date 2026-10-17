import { MOVE_BUDGET, NAMES } from "../config.js";
import { state, say } from "../state.js";
import { bfs, pathLen } from "../pathfinding.js";
import { redeploy, slotIndex, removeHold, pruneHolds, dependsOn, tileIs, endOf, byPriority, routePoint } from "../entities/operator.js";

// Há ordem do jogador (rota, mira ou espera) para algum operador vivo
export const hasOrders = () => state.ops.some(o => o.alive && o.acts.length > 0);

export function select(i) {
  if (state.status !== "plan" || !state.ops[i] || !state.ops[i].alive) return;
  if (i !== state.sel) state.mode = null;
  state.sel = i;
  state.uiDirty = true;
}

export function setMode(m) {
  state.mode = state.mode === m ? null : m;
  state.uiDirty = true;
}

export function undo() {
  const o = state.ops[state.sel], a = o.acts.pop();
  if (a === undefined) return;
  if (typeof a === "number") o.path.length -= a;
  else if (a.hold) o.holds = o.holds.filter(x => x !== a.hold);
  else if (a.open) o.opens = o.opens.filter(x => x !== a.open);
  else {
    o.aims = o.aims.filter(x => x !== a.aim);
    if (a.replaced) o.aims.push(a.replaced);
  }
  if (o.path.length === o.lock) o.planAt = Infinity;
  resolveEnds();
  state.uiDirty = true;
}

export function clearPlan() {
  const o = state.ops[state.sel];
  o.path = o.path.slice(0, o.lock);
  o.acts = [];
  o.aims = [];
  o.holds = [];
  o.opens = [];
  o.planAt = Infinity;
  resolveEnds();
  state.uiDirty = true;
}

// Espera: o fim da rota atual (ou a casa inicial, sem rota) fica preso a uma casa da rota de outro
// operador; os movimentos traçados depois só começam quando ele chegar lá
function waitTap(o, tx, ty) {
  const at = o.path.length;
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
  say(`Toque numa casa da rota de outro operador para ${NAMES[o.id]} esperar por ele.`);
}

// Abrir porta: vale no fim da rota atual (ou na casa de partida), que precisa estar ao lado da porta.
// Os movimentos traçados depois só começam quando a porta termina de abrir
function openTap(o, tx, ty) {
  const di = state.doorIdx[ty * state.W + tx];
  if (di < 0) { say("Toque numa porta para abri-la."); return; }
  const at = o.path.length, p = routePoint(o, at), px = p.x | 0, py = p.y | 0;
  if ((px === tx && py === ty) || Math.abs(px - tx) > 1 || Math.abs(py - ty) > 1) {
    say(`O fim da rota de ${NAMES[o.id]} precisa estar ao lado da porta.`);
    return;
  }
  if (o.opens.some(q => q.at === at && q.door === di)) return;
  const q = { at, door: di, tx: px, ty: py };
  o.opens.push(q);
  o.acts.push({ open: q });
  say(`${NAMES[o.id]} abre a porta e espera ela abrir por completo.`);
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
  if (state.mode === "open") { openTap(o, tx, ty); return; }
  if (state.mode === "aim") {
    // A mira vale a partir do fim da rota atual e substitui outra marcada no mesmo ponto
    const at = o.path.length, aim = { at, x: tx + .5, y: ty + .5 }, replaced = o.aims.find(a => a.at === at) || null;
    o.aims = o.aims.filter(a => a !== replaced);
    o.aims.push(aim);
    o.acts.push({ aim, replaced });
  } else {
    if (hit === state.sel) return;
    // A rota nunca passa nem termina na posição final de outro operador
    // e só passa (sem terminar) pelas casas da rota de outro operador
    const s = endOf(o), ends = new Map(), paths = new Map();
    for (const u of state.ops) if (u !== o && u.alive) {
      ends.set(tileKey(endOf(u)), u);
      for (const p of u.path) paths.set(tileKey(p), u);
    }
    const k = ty * state.W + tx;
    if (!ends.has(k) && paths.has(k)) {
      say(`Ali passa a rota de ${NAMES[paths.get(k).id]}: escolha outra casa final.`);
      return;
    }
    const full = bfs(s.x | 0, s.y | 0, tx, ty, ends);
    if (!full) {
      say(state.solid[k] ? "Esse ponto está bloqueado." : ends.has(k) ? `Ali é a posição final de ${NAMES[ends.get(k).id]}.` : "Sem caminho até ali.");
      return;
    }
    let left = MOVE_BUDGET - pathLen(o), px = s.x, py = s.y, n = 0;
    for (const q of full) {
      const d = Math.hypot(q.x - px, q.y - py);
      if (d > left + 1e-6) break;
      left -= d; px = q.x; py = q.y; n++;
    }
    const fit = n;
    while (n && paths.has(tileKey(full[n - 1]))) n--;
    if (!n) {
      say(fit ? `${NAMES[o.id]} não tem onde parar fora da rota de outro operador.` : `${NAMES[o.id]} já usou todo o movimento do turno.`);
      return;
    }
    if (n < full.length) say(`Rota cortada no limite de movimento de ${NAMES[o.id]}.`);
    if (o.path.length === o.lock) o.planAt = ++state.planSeq;
    o.path.push(...full.slice(0, n));
    o.acts.push(n);
    resolveEnds();
  }
  state.uiDirty = true;
}
