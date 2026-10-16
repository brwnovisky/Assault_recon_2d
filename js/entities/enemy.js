import { OP_RANGE, OP_HALF } from "../config.js";
import { state } from "../state.js";
import { adiff, los } from "../pathfinding.js";
import { createUnit, roomOf } from "./unit.js";

export const createEnemy = (x, y) => createUnit(x, y, 2, -1);

// Inimigo alertado passa a vigiar uma porta sorteada da própria sala
export function alertEnemy(e) {
  e.alert = true;
  const r = roomOf(e), doors = state.doors.filter(d => d.rooms.includes(r));
  if (!doors.length) return;
  const d = doors[(Math.random() * doors.length) | 0];
  e.watch = Math.atan2(d.y + .5 - e.y, d.x + .5 - e.x);
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


