import { OP_RANGE, OP_HALF } from "../config.js";
import { state } from "../state.js";
import { adiff, los } from "../pathfinding.js";
import { createUnit } from "./unit.js";

export const createEnemy = (x, y) => createUnit(x, y, 2, -1);

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


