import { NAMES } from "../config.js";
import { state, say, saveMatch } from "../state.js";
import { faceDoor, updateVis } from "./enemy.js";

export function createOperator(x, y, id) {
  return {
    x: x + .5, y: y + .5, a: 0, want: 0, base: 0,
    hp: 3, max: 3, alive: true, id,
    target: null, react: 0, cd: 0, moving: false,
    path: [], acts: [], aim: null, pi: 0, holds: [],
    waiting: false, lock: 0, lockFrom: -1, lockTo: -1,
    alert: false, heard: null, seen: false, vis: false
  };
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

export function pruneHolds() {
  for (const o of state.ops) {
    for (const h of o.holds.slice()) {
      const y = state.ops[h.op];
      const ok = h.at < o.path.length && y.alive && tileIs(y.path[h.ti - 1], h.tx, h.ty) && tileIs(h.at === 0 ? o : o.path[h.at - 1], h.hx, h.hy);
      if (!ok) removeHold(o, h);
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
  o.aim = null;
  o.holds = [];
  faceDoor(o);
  pruneHolds();
  for (const e of state.enemies) e.seen = false;
  updateVis();
  say(`${NAMES[o.id]} vai pela entrada ${slotIndex(x, y) + 1}.`);
  state.uiDirty = true;
  saveMatch();
}


