import { OP_RANGE, OP_HALF } from "../config.js";
import { state } from "../state.js";
import { adiff, los } from "../pathfinding.js";

export function createEnemy(x, y) {
  return {
    x: x + .5, y: y + .5, a: 0, want: 0, base: 0,
    hp: 2, max: 2, alive: true, id: -1,
    target: null, react: 0, cd: 0, moving: false,
    path: [], acts: [], aim: null, pi: 0, holds: [],
    waiting: false, lock: 0, lockFrom: -1, lockTo: -1,
    alert: false, heard: null, seen: false, vis: false
  };
}

export function faceDoor(u) {
  const r = state.roomId[(u.y | 0) * state.W + (u.x | 0)];
  let best = null, bd = 1e9;
  for (const d of state.doors) {
    const dd = (d.x + .5 - u.x) ** 2 + (d.y + .5 - u.y) ** 2 + (d.rooms.includes(r) ? 0 : 1e4);
    if (dd < bd) { bd = dd; best = d; }
  }
  if (best) u.a = u.want = u.base = Math.atan2(best.y + .5 - u.y, best.x + .5 - u.x);
}

export function updateVis() {
  for (const e of state.enemies) {
    e.vis = false;
    if (!e.alive) continue;
    for (const o of state.ops) {
      if (!o.alive) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      if (dx * dx + dy * dy > OP_RANGE * OP_RANGE) continue;
      if (Math.abs(adiff(Math.atan2(dy, dx), o.a)) > OP_HALF) continue;
      if (los(o.x, o.y, e.x, e.y) < 0) continue;
      e.vis = e.seen = true;
      break;
    }
  }
}


